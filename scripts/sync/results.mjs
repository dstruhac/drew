// Entrypoint pro sync-results.yml. Pro každou competition nejdřív zjistí
// z VLASTNÍ databáze (zdarma, bez scrapování), jestli je vůbec potřeba
// otevírat prohlížeč — buď (a) nemá v databázi ŽÁDNÝ zápas (typicky
// nová soutěž přidaná uprostřed sezóny — viz "zpětné dotažení" níže),
// nebo (b) má zápas, kterému už uplynul kickoff_at, ale pořád nemá
// status='finished'. Pokud ani jedno neplatí, competition se přeskočí
// bez jediného otevření prohlížeče.
//
// Teprve když je potřeba, stáhne se stránka "/vysledky/" a zapíšou se
// VŠECHNY nalezené zápasy se skóre — jak update už existujících (podle
// external_id), tak insert úplně nových řádků. Tohle je záměrně
// "zpětné dotažení" zdarma: když appka začne sledovat soutěž, jejíž
// sezóna už běží (přesně tenhle případ nastal 27.8.2026 u Chance Ligy —
// sync-fixtures naimportoval jen zápasy v okně [dnes-1, dnes+21], starší
// dohrané zápasy z databáze úplně chyběly), první běh sync-results je
// rovnou dotáhne i s výsledkem, aniž by to vyžadovalo zvláštní ruční
// krok. Zápasy, které na výsledkové stránce ještě skóre nemají
// (dohrávka, odložení, apod.), se prostě přeskočí a zkusí se znovu při
// dalším běhu.
//
// Body se přepočítají samy — DB trigger `matches_calculate_points` se
// spustí, jakmile existující zápas dostane status='finished' a obě
// skóre (běží jen na UPDATE). Nově vloženým zápasům trigger neběží, ale
// nevadí to: zápas, který v databázi ještě neexistoval, nemohl mít ani
// žádný tip k obodování — a nový tip na už odehraný zápas RLS politika
// (kickoff_at v minulosti) stejně nedovolí.
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
  const now = Date.now();

  for (const competition of competitions) {
    const label = `sync-results:${competition.id}`;

    try {
      const { data: existing, error: existingError } = await supabase
        .from("matches")
        .select("id, status, kickoff_at")
        .eq("competition_id", competition.id);

      if (existingError) throw new Error(`Nepodařilo se načíst zápasy: ${existingError.message}`);

      const pendingCount = (existing ?? []).filter(
        (m) => m.status !== "finished" && new Date(m.kickoff_at).getTime() <= now,
      ).length;
      const hasAnyMatches = (existing ?? []).length > 0;

      if (hasAnyMatches && pendingCount === 0) {
        console.log(`${competition.name}: žádné nedohrané zápasy po výkopu, přeskakuji (0 požadavků).`);
        continue;
      }

      console.log(
        hasAnyMatches
          ? `----- ${competition.name}: ${pendingCount} zápasů čeká na výsledek -----`
          : `----- ${competition.name}: v databázi zatím žádný zápas, zkouším zpětně dotáhnout ze stránky s výsledky -----`,
      );

      if (competition.scrape_source !== "livesport") {
        throw new Error(`Neznámý scrape_source: ${competition.scrape_source}`);
      }

      const scraped = await scrapeLivesportResults(competition.scrape_path);
      const withResult = scraped.filter((m) => m.homeScore != null && m.awayScore != null);

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
        console.log(`${competition.name}: na livesport.cz zatím žádný zápas se zapsaným výsledkem.`);
        await reportRecovery({ label, summary: "Poslední běh v pořádku, zatím bez nových výsledků." });
        continue;
      }

      const rows = withResult.map((m) => ({
        competition_id: competition.id,
        external_id: m.externalId,
        home_team: m.homeTeam,
        away_team: m.awayTeam,
        kickoff_at: m.kickoffAt,
        home_score: m.homeScore,
        away_score: m.awayScore,
        status: "finished",
      }));

      const { error: upsertError } = await supabase
        .from("matches")
        .upsert(rows, { onConflict: "competition_id,external_id" });

      if (upsertError) throw new Error(`Upsert selhal: ${upsertError.message}`);

      console.log(`Zapsáno/aktualizováno ${rows.length} zápasů s výsledkem.`);
      await reportRecovery({ label, summary: `Poslední běh v pořádku, ${rows.length} zápasů s výsledkem.` });
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
