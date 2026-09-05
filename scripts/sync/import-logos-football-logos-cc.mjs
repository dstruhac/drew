// Jednorázový import log soutěže + klubů Premier League z
// football-logos.cc (5.9.2026, na žádost uživatele). Na rozdíl od
// import-logos.mjs (Chance Liga, lfafotbal.cz -- ZIP s PDF/PNG,
// vyžaduje pdftoppm+ImageMagick) tenhle zdroj dává rovnou hotové
// transparentní PNG přímo na stránce každého loga, takže žádná
// konverze není potřeba -- jen přečíst <meta property="og:image">
// z HTML detailu loga a stáhnout ho.
//
// Zdroj a struktura URL ověřené ručně v chatu přes api-probe.yml (ne
// odhadnuté):
//   - detail loga:  https://football-logos.cc/{country}/{slug}/
//     (og:image obsahuje URL na 1500x1500 transparentní PNG)
//   - licence: https://football-logos.cc/license/ -- "informational,
//     editorial, and fan-based purposes... research, non-commercial
//     design work, and fan projects" povoleno, komerční merchandise
//     zakázáno. Klopi je nekomerční hra pro partu kamarádů, tedy v
//     povoleném rozsahu.
//
// Mapování team_name (jak ho appka má uložené v matches.home_team/
// away_team, scrapováno z livesport.cz) -> slug na football-logos.cc
// ověřeno přes db-probe.yml (distinct home_team/away_team pro Premier
// League) proti seznamu klubů nalezenému na stránce ligy -- 20 klubů,
// 20 slugů, jednoznačná shoda.
//
// Běží jen v GitHub Actions (.github/workflows/import-logos-premier-league.yml),
// ne lokálně ani v appce.

import { createSupabaseClient } from "./lib/supabase-client.mjs";

const COMPETITION_NAME = "Premier League";
const COUNTRY_SLUG = "england";
const LEAGUE_SLUG = "english-premier-league";

const TEAM_SLUG_BY_NAME = {
  Arsenal: "arsenal",
  "Aston Villa": "aston-villa",
  Bournemouth: "bournemouth",
  Brentford: "brentford",
  Brighton: "brighton",
  Chelsea: "chelsea",
  Coventry: "coventry-city",
  "Crystal Palace": "crystal-palace",
  Everton: "everton",
  Fulham: "fulham",
  Hull: "hull-city",
  Ipswich: "ipswich",
  Leeds: "leeds-united",
  Liverpool: "liverpool",
  "Manchester City": "manchester-city",
  "Manchester Utd": "manchester-united",
  Newcastle: "newcastle",
  Nottingham: "nottingham-forest",
  Sunderland: "sunderland",
  Tottenham: "tottenham",
};

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (drew-app logo import)" },
  });
  if (!res.ok) throw new Error(`Stažení ${url} selhalo: HTTP ${res.status}`);
  return res.text();
}

function extractOgImage(html, sourceUrl) {
  const match = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!match) throw new Error(`og:image nenalezeno na ${sourceUrl}`);
  return match[1];
}

async function downloadPng(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (drew-app logo import)" },
  });
  if (!res.ok) throw new Error(`Stažení obrázku ${url} selhalo: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadPng(supabase, storagePath, buffer) {
  const { error } = await supabase.storage
    .from("logos")
    .upload(storagePath, buffer, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Upload ${storagePath} selhal: ${error.message}`);
  const { data } = supabase.storage.from("logos").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function fetchAndUploadLogo(supabase, pageUrl, storagePath) {
  const html = await fetchHtml(pageUrl);
  const ogImageUrl = extractOgImage(html, pageUrl);
  const buffer = await downloadPng(ogImageUrl);
  return uploadPng(supabase, storagePath, buffer);
}

async function main() {
  const supabase = createSupabaseClient();

  const { data: competition, error: competitionError } = await supabase
    .from("competitions")
    .select("id, name")
    .eq("name", COMPETITION_NAME)
    .single();
  if (competitionError || !competition) {
    throw new Error(
      `Competition "${COMPETITION_NAME}" nenalezena: ${competitionError?.message ?? "žádný řádek"}`,
    );
  }
  const competitionSlug = slugify(competition.name);

  console.log(`Stahuji logo soutěže: ${LEAGUE_SLUG}`);
  const leagueLogoUrl = await fetchAndUploadLogo(
    supabase,
    `https://football-logos.cc/${COUNTRY_SLUG}/${LEAGUE_SLUG}/`,
    `competitions/${competitionSlug}.png`,
  );
  console.log(`Logo soutěže nahráno: ${leagueLogoUrl}`);

  const { error: updateError } = await supabase
    .from("competitions")
    .update({ logo_url: leagueLogoUrl })
    .eq("id", competition.id);
  if (updateError) throw new Error(`Uložení logo_url selhalo: ${updateError.message}`);

  const teamLogoRows = [];
  for (const [teamName, teamSlug] of Object.entries(TEAM_SLUG_BY_NAME)) {
    const pageUrl = `https://football-logos.cc/${COUNTRY_SLUG}/${teamSlug}/`;
    const storagePath = `teams/${competitionSlug}/${slugify(teamName)}.png`;
    const logoUrl = await fetchAndUploadLogo(supabase, pageUrl, storagePath);
    console.log(`"${teamName}" (${teamSlug}) -> ${logoUrl}`);
    teamLogoRows.push({ competition_id: competition.id, team_name: teamName, logo_url: logoUrl });
  }

  const { error: upsertError } = await supabase
    .from("team_logos")
    .upsert(teamLogoRows, { onConflict: "competition_id,team_name" });
  if (upsertError) throw new Error(`Uložení team_logos selhalo: ${upsertError.message}`);

  console.log(`Hotovo: logo soutěže + ${teamLogoRows.length} log klubů uloženo.`);
}

await main();
