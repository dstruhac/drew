// Entrypoint pro sync-fixtures.yml. Pro každou competition s vyplněným
// scrape_source/scrape_path stáhne rozpis zápasů, ověří rozumnost dat
// a teprve pak upsertne do `matches`. Když validace selže, nic se
// nezapíše a založí/aktualizuje se GitHub Issue.

import { createSupabaseClient } from "./lib/supabase-client.mjs";
import { scrapeLivesportFixtures } from "./lib/scrape-livesport.mjs";
import { validateFixtures } from "./lib/validate-fixtures.mjs";
import { reportFailure, reportRecovery } from "./lib/notify-issue.mjs";

// Zkráceno z 21 na 7 dní (6.9.2026, na žádost uživatele) -- appka
// hráčům ukazovala příliš mnoho nadcházejících zápasů najednou
// ("Nadcházející" sekce na /spaces/[id] rostla s každým dnem, protože
// appka nic nemaže -- jen nikdy nepřestane přibírat další den dopředu).
// Zúžení okna zastaví přibírání nových zápasů nad 7 dní dopředu;
// zápasy už dřív načtené za tuhle hranicí appka na stránce soutěže
// navíc rovnou skryje (viz UPCOMING_WINDOW_DAYS ve
// src/app/(app)/spaces/[id]/page.tsx), takže efekt je vidět hned, ne
// až se stará data postupně "vyhrají" pryč.
const WINDOW_DAYS = 7;

async function main() {
  const supabase = createSupabaseClient();

  const { data: competitions, error } = await supabase
    .from("competitions")
    .select("id, name, scrape_source, scrape_path")
    .not("scrape_source", "is", null)
    .not("scrape_path", "is", null);

  if (error) throw new Error(`Nepodařilo se načíst competitions: ${error.message}`);

  if (!competitions || competitions.length === 0) {
    console.log("Žádná competition nemá vyplněné scrape_source/scrape_path — není co dělat.");
    return;
  }

  let hadFailure = false;

  for (const competition of competitions) {
    const label = `sync-fixtures:${competition.id}`;
    console.log(`----- ${competition.name} (${competition.scrape_source}:${competition.scrape_path}) -----`);

    try {
      if (competition.scrape_source !== "livesport") {
        throw new Error(`Neznámý scrape_source: ${competition.scrape_source}`);
      }

      const allMatches = await scrapeLivesportFixtures(competition.scrape_path);
      const now = Date.now();
      const windowEnd = now + WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const inWindow = allMatches.filter((m) => {
        const t = new Date(m.kickoffAt).getTime();
        return t >= now - 24 * 60 * 60 * 1000 && t <= windowEnd; // malá rezerva do minulosti pro dnešní zápasy
      });

      // minExpected snížen na 0 (6.9.2026, spolu se zkrácením okna na 7
      // dní) -- při 21denním okně bylo "0 zápasů" prakticky vždycky
      // známka rozbitého scraperu, ale v 7denním okně to může být
      // naprosto legitimní bye week/reprezentační pauza. Appka by jinak
      // zakládala planý GitHub Issue pokaždé, když liga zrovna nehraje.
      // maxExpected zůstává jako záchranná brzda proti "řádově moc"
      // (např. omylem nascrapovaná kola navíc).
      const { ok, errors } = validateFixtures(inWindow, { minExpected: 0, maxExpected: 60 });

      if (!ok) {
        hadFailure = true;
        await reportFailure({
          title: `⚠️ sync-fixtures: ${competition.name} — data nevypadají v pořádku`,
          body: [
            `Scrapování ${competition.scrape_source}:${competition.scrape_path} vrátilo data, která neprošla kontrolou rozumnosti — nic se nezapsalo do databáze.`,
            "",
            "**Chyby:**",
            ...errors.map((e) => `- ${e}`),
          ].join("\n"),
          label,
        });
        console.log(`::error::Validace selhala pro ${competition.name}, přeskakuji zápis.`);
        continue;
      }

      const rows = inWindow.map((m) => ({
        competition_id: competition.id,
        external_id: m.externalId,
        home_team: m.homeTeam,
        away_team: m.awayTeam,
        kickoff_at: m.kickoffAt,
        ...(m.homeScore != null && m.awayScore != null
          ? { home_score: m.homeScore, away_score: m.awayScore, status: "finished" }
          // Explicitní 'scheduled' (ne jen necháno na sloupcovém
          // výchozím stavu) -- 29.8.2026, aby se dřív odložený zápas
          // (status='postponed', viz results.mjs) sám odblokoval, jakmile
          // se znovu objeví v rozpisu s novým termínem. Bez tohohle by
          // upsert při konfliktu status vůbec netknul a zápas by zůstal
          // navždy označený jako odložený i po vyhlášení nového termínu.
          : { status: "scheduled" }),
      }));

      const { error: upsertError } = await supabase
        .from("matches")
        .upsert(rows, { onConflict: "competition_id,external_id" });

      if (upsertError) throw new Error(`Upsert selhal: ${upsertError.message}`);

      console.log(`Zapsáno/aktualizováno ${rows.length} zápasů.`);
      await reportRecovery({ label, summary: `Poslední běh v pořádku, ${rows.length} zápasů.` });
    } catch (err) {
      hadFailure = true;
      console.log(`::error::${competition.name}: ${err.message}`);
      await reportFailure({
        title: `⚠️ sync-fixtures: ${competition.name} — běh selhal`,
        body: `Scrapování selhalo s chybou:\n\n\`\`\`\n${err.stack || err.message}\n\`\`\``,
        label,
      });
    }
  }

  if (hadFailure) process.exitCode = 1;
}

await main();
