// Entrypoint pro random-league.yml. Jednou denně (brzy ráno) vybere 5
// náhodných zápasů z dnešního dne napříč skupinou známých lig
// (RANDOM_LEAGUE_POOL) a zapíše je do trvalé soutěže "Náhodná liga".
//
// Na rozdíl od sync-fixtures/sync-results appka tu nemá jednu
// competition = jedna liga -- "Náhodná liga" kombinuje víc lig najednou,
// takže si u KAŽDÉHO zápasu zvlášť pamatuje sport a zdrojovou
// scrape_path (viz migrace 20260830090000_random_league.sql), aby
// sync-results později věděl, kde hledat výsledek (viz syncRandomPool
// v results.mjs).
//
// Idempotence: pokud "Náhodná liga" už má pro dnešní pražský den
// nějaký zápas zapsaný, běh se přeskočí -- výběr je náhodný, takže
// druhé spuštění stejný den by (kdyby se nekontrolovalo) přidalo jiných
// 5 zápasů navíc místo žádné změny.
//
// "Míň než 5 zápasů dnes napříč celým poolem" NENÍ chyba (rozhodnuto s
// uživatelem 30.8.2026) -- appka prostě zapíše, kolik jich je (klidně
// 0), místo aby si něco vymýšlela nebo failovala.

import { createSupabaseClient } from "./lib/supabase-client.mjs";
import { scrapeLivesportFixtures } from "./lib/scrape-livesport.mjs";
import { getTodayRange } from "./lib/week-range.mjs";
import { validateFixtures } from "./lib/validate-fixtures.mjs";
import { reportFailure, reportRecovery } from "./lib/notify-issue.mjs";
import { RANDOM_LEAGUE_POOL } from "./lib/random-league-pool.mjs";

const COMPETITION_NAME = "Náhodná liga";
const PICK_COUNT = 5;
const LABEL = "random-league";

async function ensureCompetition(supabase) {
  const { data: existing, error: selectError } = await supabase
    .from("competitions")
    .select("id")
    .eq("name", COMPETITION_NAME)
    .eq("sport", "mixed")
    .maybeSingle();

  if (selectError) throw new Error(`Nepodařilo se ověřit "Náhodná liga": ${selectError.message}`);
  if (existing) return existing.id;

  const { data: inserted, error: insertError } = await supabase
    .from("competitions")
    .insert({ name: COMPETITION_NAME, sport: "mixed" })
    .select("id")
    .single();

  if (insertError) throw new Error(`Založení "Náhodná liga" selhalo: ${insertError.message}`);
  console.log(`Založena competition "${COMPETITION_NAME}" (${inserted.id}).`);
  return inserted.id;
}

// Fisher-Yates -- appka nepotřebuje kryptografickou náhodnost, jen
// rovnoměrné rozložení mezi kandidáty.
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function main() {
  const supabase = createSupabaseClient();
  const competitionId = await ensureCompetition(supabase);

  const { dateString, todayStart, todayEnd } = getTodayRange();

  const { data: alreadyPicked, error: existingError } = await supabase
    .from("matches")
    .select("id")
    .eq("competition_id", competitionId)
    .gte("kickoff_at", todayStart)
    .lt("kickoff_at", todayEnd)
    .limit(1);

  if (existingError) throw new Error(`Nepodařilo se ověřit dnešní výběr: ${existingError.message}`);

  if (alreadyPicked && alreadyPicked.length > 0) {
    console.log(`${dateString}: "Náhodná liga" už má dnešní zápasy vybrané, nic dalšího nedělám.`);
    return;
  }

  console.log(`----- ${dateString}: hledám dnešní zápasy napříč ${RANDOM_LEAGUE_POOL.length} ligami -----`);

  const candidates = [];
  const leagueErrors = [];

  for (const league of RANDOM_LEAGUE_POOL) {
    try {
      const fixtures = await scrapeLivesportFixtures(league.scrapePath);
      const today = fixtures.filter((m) => {
        const t = new Date(m.kickoffAt).getTime();
        return t >= new Date(todayStart).getTime() && t < new Date(todayEnd).getTime();
      });
      console.log(`${league.name}: ${today.length} zápasů dnes.`);
      for (const m of today) {
        candidates.push({ ...m, sport: league.sport, sourceScrapePath: league.scrapePath });
      }
    } catch (err) {
      leagueErrors.push(`${league.name}: ${err.message}`);
      console.log(`::warning::${league.name}: scrapování selhalo (${err.message}), pokračuji dalšími ligami.`);
    }
  }

  if (candidates.length === 0) {
    const summary =
      leagueErrors.length === RANDOM_LEAGUE_POOL.length
        ? "Scrapování selhalo úplně u všech lig v poolu."
        : "Dnes napříč celým poolem nemá žádná liga zápas -- vzácné, ale ne chyba (viz PROJECT.md).";
    console.log(summary);
    if (leagueErrors.length === RANDOM_LEAGUE_POOL.length) {
      await reportFailure({
        title: "⚠️ random-league: scrapování selhalo u všech lig",
        body: `Žádná liga v poolu nešla nascrapovat:\n\n${leagueErrors.map((e) => `- ${e}`).join("\n")}`,
        label: LABEL,
      });
    } else {
      await reportRecovery({ label: LABEL, summary });
    }
    return;
  }

  const picked = shuffle(candidates).slice(0, PICK_COUNT);

  const { ok, errors } = validateFixtures(picked, { minExpected: 0, maxExpected: PICK_COUNT });
  if (!ok) {
    await reportFailure({
      title: "⚠️ random-league: vybraná data nevypadají v pořádku",
      body: ["Kontrola rozumnosti vybraných zápasů selhala -- nic se nezapsalo.", "", "**Chyby:**", ...errors.map((e) => `- ${e}`)].join("\n"),
      label: LABEL,
    });
    console.log("::error::Validace selhala, přeskakuji zápis.");
    return;
  }

  const rows = picked.map((m) => ({
    competition_id: competitionId,
    external_id: m.externalId,
    home_team: m.homeTeam,
    away_team: m.awayTeam,
    kickoff_at: m.kickoffAt,
    sport: m.sport,
    source_scrape_path: m.sourceScrapePath,
  }));

  const { error: upsertError } = await supabase
    .from("matches")
    .upsert(rows, { onConflict: "competition_id,external_id" });

  if (upsertError) throw new Error(`Upsert selhal: ${upsertError.message}`);

  console.log(`Vybráno a zapsáno ${rows.length} z ${candidates.length} kandidátů: ${rows.map((r) => `${r.home_team}-${r.away_team}`).join(", ")}`);

  const summary =
    leagueErrors.length > 0
      ? `Zapsáno ${rows.length} zápasů, i když ${leagueErrors.length} liga/y selhaly: ${leagueErrors.join("; ")}`
      : `Zapsáno ${rows.length} zápasů, poslední běh v pořádku.`;
  await reportRecovery({ label: LABEL, summary });
  if (leagueErrors.length > 0) console.log(`::warning::${leagueErrors.length} liga/y selhaly, ale výběr se přesto povedl: ${leagueErrors.join("; ")}`);
}

await main();
