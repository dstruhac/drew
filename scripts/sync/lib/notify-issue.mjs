// Nahlašuje selhání scrapingu jako GitHub Issue — bez nového účtu/služby:
// GitHub sám e-mailem upozorní vlastníka repozitáře na nový issue v jeho
// repu, což je pro netechnického uživatele spolehlivější než čekat, až
// si někdo ručně zkontroluje log v Actions.
//
// Dedupe podle labelu: když už otevřený issue se stejným labelem
// existuje, jen se do něj přidá komentář místo založení dalšího.
// Když se běh po předchozím selhání znovu povede, existující issue se
// zavře s vysvětlujícím komentářem, ať se neduplikují falešné poplachy.

const GITHUB_API = "https://api.github.com";

function repoInfo() {
  const repo = process.env.GITHUB_REPOSITORY; // "owner/repo", nastavuje Actions automaticky
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) {
    throw new Error("Chybí GITHUB_REPOSITORY nebo GITHUB_TOKEN v prostředí.");
  }
  const [owner, name] = repo.split("/");
  return { owner, name, token };
}

async function gh(path, options = {}) {
  const { token } = repoInfo();
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API ${options.method || "GET"} ${path} selhalo: ${res.status} ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

async function findOpenIssue(owner, name, label) {
  const issues = await gh(
    `/repos/${owner}/${name}/issues?labels=${encodeURIComponent(label)}&state=open&per_page=1`,
  );
  return issues && issues.length > 0 ? issues[0] : null;
}

export async function reportFailure({ title, body, label }) {
  const { owner, name } = repoInfo();
  const existing = await findOpenIssue(owner, name, label);

  if (existing) {
    await gh(`/repos/${owner}/${name}/issues/${existing.number}/comments`, {
      method: "POST",
      body: JSON.stringify({
        body: `Selhalo znovu (${new Date().toISOString()}):\n\n${body}`,
      }),
    });
    console.log(`::warning::Přidán komentář k existujícímu issue #${existing.number}`);
    return existing.number;
  }

  const created = await gh(`/repos/${owner}/${name}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title,
      body,
      labels: [label],
    }),
  });
  console.log(`::error::Založen issue #${created.number}: ${title}`);
  return created.number;
}

export async function reportRecovery({ label, summary }) {
  const { owner, name } = repoInfo();
  const existing = await findOpenIssue(owner, name, label);
  if (!existing) return;

  await gh(`/repos/${owner}/${name}/issues/${existing.number}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: `✅ Znovu funguje (${new Date().toISOString()}): ${summary}`,
    }),
  });
  await gh(`/repos/${owner}/${name}/issues/${existing.number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
  console.log(`Issue #${existing.number} zavřen — scraping zase funguje.`);
}
