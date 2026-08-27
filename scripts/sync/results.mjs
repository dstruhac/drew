// Entrypoint pro sync-results.yml. Pro každou competition nejdřív zjistí
// z VLASTNÍ databáze (zdarma, bez scrapování), jestli má nějaké zápasy,
// kterým už uplynul kickoff_at, ale pořád nemají status='finished' —
// pokud ne, competition se přeskočí bez jediného otevření prohlížeče.
// Teprve když takové zápasy existují, stáhne se stránka "/vysledky/" a
// dohledá se na ní výsledek podle external_id. Zápasy, které tam ještě
// nemají skóre (dohrávka, odložení, apod.), se prostě přeskočí a zkusí
// se znovu při dalším běhu.
//
// Body se přepočítají samy — DB trigger `matches_calculate_points` se
// spustí, jakmile zápas dostane status='finished' a obě skóre.
//
// POZOR: `overtime_flag` (prodloužení/nájezdy u hokeje) se zatím
// nezapisuje — livesport.cz způsob označení není ověřený na reálných
// datech (hokejová sezóna v době psaní ještě nezačala, viz
// docs/IMPORT-ARCHITECTURE.md). Až se objeví první reálný dohraný zápas
// v prodloužení, ověří se přes playwright-probe a doplní se.

import { createSupabaseClient } from "./lib/supabase-client.mjs";
import { scrapeLivesportResults } from "./lib/scrape-livesport.mjs";
import { validateResults } from "./lib/validate-results.mjs";
import { reportFailure, reportRecovery } from "./lib/notify-issue.mjs";

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
  const now = new Date().toISOString();

  for (const competition of competitions) {
    const label = `sync-results:${competition.id}`;

    try {
      const { data: pending, error: pendingError } = await supabase
        .from("matches")
        .select("id, external_id")
        .eq("competition_id", competition.id)
        .not("external_id", "is", null)
        .neq("status", "finished")
        .lte("kickoff_at", now);

      if (pendingError) throw new Error(`Nepodařilo se načíst nedohrané zápasy: ${pendingError.message}`);

      if (!pending || pending.length === 0) {
        console.log(`${competition.name}: žádné nedohrané zápasy po výkopu, přeskakuji (0 požadavků).`);
        continue;
      }

      console.log(`----- ${competition.name}: ${pending.length} zápasů čeká na výsledek -----`);

      if (competition.scrape_source !== "livesport") {
        throw new Error(`Neznámý scrape_source: ${competition.scrape_source}`);
      }

      const scraped = await scrapeLivesportResults(competition.scrape_path);
      const pendingExternalIds = new Set(pending.map((m) => m.external_id));
      const withResult = scraped.filter(
        (m) => pendingExternalIds.has(m.externalId) && m.homeScore != null && m.awayScore != null,
      );

      const { ok, errors } = validateResults(withResult);

      if (!ok) {
        hadFailure = true;
        await reportFailure({
          title: `⚠️ sync-results: ${competition.name} — data nevypadají v pořádku`,
          body: [
            `Scrapování výsledků ${competition.scrape_source}:${competition.scrape_path} vrátilo data, která neprošla kontrolou rozumnosti — nic se nezapsalo do databáze.`,
            "",
            "**Chyby:**",
            ...errors.map((e) => `- ${e}`),
          ].join("\n"),
          label,
        });
        console.log(`::error::Validace selhala pro ${competition.name}, přeskakuji zápis.`);
        continue;
      }

      if (withResult.length === 0) {
        console.log(`${competition.name}: zatím žádný z čekajících zápasů nemá na livesport.cz zapsaný výsledek.`);
        await reportRecovery({ label, summary: "Poslední běh v pořádku, zatím bez nových výsledků." });
        continue;
      }

      const rows = withResult.map((m) => ({
        competition_id: competition.id,
        external_id: m.externalId,
        home_team: m.homeTeam,
        away_team: m.awayTeam,
        home_score: m.homeScore,
        away_score: m.awayScore,
        status: "finished",
      }));

      const { error: upsertError } = await supabase
        .from("matches")
        .upsert(rows, { onConflict: "competition_id,external_id" });

      if (upsertError) throw new Error(`Upsert selhal: ${upsertError.message}`);

      console.log(`Zapsán výsledek u ${rows.length} zápasů.`);
      await reportRecovery({ label, summary: `Poslední běh v pořádku, ${rows.length} nových výsledků.` });
    } catch (err) {
      hadFailure = true;
      console.log(`::error::${competition.name}: ${err.message}`);
      await reportFailure({
        title: `⚠️ sync-results: ${competition.name} — běh selhal`,
        body: `Scrapování selhalo s chybou:\n\n\`\`\`\n${err.stack || err.message}\n\`\`\``,
        label,
      });
    }
  }

  if (hadFailure) process.exitCode = 1;
}

await main();
