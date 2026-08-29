// Entrypoint pro sync-results.yml. Pro každou competition nejdřív zjistí
// z VLASTNÍ databáze (zdarma, bez scrapování), jestli je vůbec potřeba
// otevírat prohlížeč — buď (a) nemá v databázi ŽÁDNÝ dohraný zápas
// (typicky nová soutěž přidaná uprostřed sezóny — viz "zpětné dotažení"
// níže), nebo (b) má zápas, kterému už uplynul kickoff_at, ale pořád
// nemá status='finished'. Pokud ani jedno neplatí, competition se
// přeskočí bez jediného otevření prohlížeče.
//
// POZOR: podmínka (a) je záměrně "nemá ŽÁDNÝ DOHRANÝ zápas", ne "nemá
// žádný zápas vůbec" — competition typicky v DB už zápasy má (denní
// sync-fixtures jí naimportoval nadcházející zápasy z klouzavého okna),
// jen žádný z nich není ten starý, který appka nestihla zachytit před
// jeho odehráním. Původní verze (27.8.2026) kontrolovala "žádný zápas
// vůbec" a u Chance Ligy (28 nadcházejících zápasů, ale 0 dohraných)
// proto zpětné dotažení vůbec nespustila — objeveno hned při prvním
// ostrém běhu po nasazení, viz PROJECT.md.
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
//
// Kromě dohraných zápasů se (od 28.8.2026) stejným během doplňuje i
// status='live' + průběžné skóre u zápasu, který PRÁVĚ probíhá --
// appka ho pak zobrazí ve vlastní sekci "Probíhající", ne až mezi
// "Proběhlé" bez skóre. Zdroj je jiná stránka livesport.cz než výsledky
// (viz scrapeLivesportLiveMatches) -- jen UPDATE podle external_id,
// nikdy insert (na živém zápase chybí platný kickoff_at, viz
// validate-results.mjs).

import { createSupabaseClient } from "./lib/supabase-client.mjs";
import { scrapeLivesportResults, scrapeLivesportLiveMatches } from "./lib/scrape-livesport.mjs";
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
      const finishedCount = (existing ?? []).filter((m) => m.status === "finished").length;

      if (pendingCount === 0 && finishedCount > 0) {
        console.log(`${competition.name}: žádné nedohrané zápasy po výkopu, přeskakuji (0 požadavků).`);
        continue;
      }

      console.log(
        pendingCount > 0
          ? `----- ${competition.name}: ${pendingCount} zápasů čeká na výsledek -----`
          : `----- ${competition.name}: v databázi zatím žádný dohraný zápas, zkouším zpětně dotáhnout ze stránky s výsledky -----`,
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

      // Živě probíhající zápas -- jiná stránka livesport.cz než výsledky
      // výše (viz komentář u scrapeLivesportLiveMatches). Vždy se
      // zkouší, i když finished zápasů teď nepřibylo -- to je běžný
      // případ (zápas právě začal, ještě neskončil).
      const live = await scrapeLivesportLiveMatches(competition.scrape_path);
      if (live.length > 0) {
        const { ok: liveOk, errors: liveErrors } = validateResults(live, {
          requireKickoffAt: false,
        });

        if (!liveOk) {
          hadFailure = true;
          await reportFailure({
            title: `⚠️ sync-results: ${competition.name} — živý zápas nevypadá v pořádku`,
            body: [
              `Scrapování živého zápasu ${competition.scrape_source}:${competition.scrape_path} vrátilo data, která neprošla kontrolou rozumnosti — nic se nezapsalo.`,
              "",
              "**Chyby:**",
              ...liveErrors.map((e) => `- ${e}`),
            ].join("\n"),
            label,
          });
          console.log(`::error::Validace živého zápasu selhala pro ${competition.name}, přeskakuji.`);
        } else {
          for (const m of live) {
            // Jen UPDATE existujícího řádku (podle external_id) -- živý
            // zápas byl v databázi vždy už dřív založen jako
            // nadcházející (sync-fixtures), takže tu na rozdíl od
            // dohraných výsledků výše není potřeba upsert/insert.
            // .neq("status", "finished") je pojistka proti souběhu se
            // sekcí výše, kdyby stejný zápas mezitím stihl skončit.
            const { error: liveUpdateError } = await supabase
              .from("matches")
              .update({ status: "live", home_score: m.homeScore, away_score: m.awayScore })
              .eq("competition_id", competition.id)
              .eq("external_id", m.externalId)
              .neq("status", "finished");

            if (liveUpdateError) {
              throw new Error(`Update živého zápasu selhal: ${liveUpdateError.message}`);
            }
          }
          console.log(`Aktualizován stav ${live.length} živě probíhajícího zápasu/zápasů.`);
        }
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
