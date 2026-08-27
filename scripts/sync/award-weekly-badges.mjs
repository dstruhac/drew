// Entrypoint pro award-weekly-badges.yml. Běží v pondělí ráno a pro
// každou competition vyhodnotí PŘEDCHOZÍ kalendářní týden (po-ne,
// pražský čas, viz lib/week-range.mjs): kdo měl za zápasy odehrané
// v tom týdnu nejvíc bodů, dostane řádek v weekly_badges. Při shodě
// (víc hráčů se stejným maximem) dostanou medaili všichni -- žádné
// svévolné tie-breaky (odsouhlaseno s uživatelem 27.8.2026).
//
// Týden bez jediného odehraného zápasu (mimo sezónu) nebo týden, kde
// nikdo nezískal žádné body (maxPoints === 0), zůstává bez medaile --
// "vítěz" s 0 body by nic neznamenal.
//
// Idempotentní: pokud pro (competition_id, week_start) už nějaká
// medaile existuje, competition se přeskočí -- bezpečné i při ručním
// opakovaném spuštění.

import { createSupabaseClient } from "./lib/supabase-client.mjs";
import { getPreviousWeekRange } from "./lib/week-range.mjs";
import { reportFailure, reportRecovery } from "./lib/notify-issue.mjs";

async function main() {
  const supabase = createSupabaseClient();
  const { weekStartDate, weekStart, weekEnd } = getPreviousWeekRange();

  const { data: competitions, error } = await supabase
    .from("competitions")
    .select("id, name");

  if (error) throw new Error(`Nepodařilo se načíst competitions: ${error.message}`);

  if (!competitions || competitions.length === 0) {
    console.log("Žádná competition v databázi — není co dělat.");
    return;
  }

  let hadFailure = false;

  for (const competition of competitions) {
    // GitHub label name má limit 50 znaků -- "award-weekly-badges:" + UUID
    // (36 znaků) je 56 a založení Issue s takovým štítkem tvrdě selže
    // (objeveno prvním ostrým během 27.8.2026). "weekly-badges:" + UUID
    // je přesně na hraně (50), stejně jako u sync-fixtures.
    const label = `weekly-badges:${competition.id}`;

    try {
      const { data: existing, error: existingError } = await supabase
        .from("weekly_badges")
        .select("user_id")
        .eq("competition_id", competition.id)
        .eq("week_start", weekStartDate)
        .limit(1);

      if (existingError) throw new Error(`Nepodařilo se ověřit existující medaile: ${existingError.message}`);

      if (existing && existing.length > 0) {
        console.log(`${competition.name}: medaile za týden ${weekStartDate} už existují, přeskakuji.`);
        continue;
      }

      const { data: matches, error: matchesError } = await supabase
        .from("matches")
        .select("id")
        .eq("competition_id", competition.id)
        .gte("kickoff_at", weekStart)
        .lt("kickoff_at", weekEnd);

      if (matchesError) throw new Error(`Nepodařilo se načíst zápasy týdne: ${matchesError.message}`);

      const matchIds = (matches ?? []).map((m) => m.id);

      if (matchIds.length === 0) {
        console.log(`${competition.name}: žádné zápasy v týdnu ${weekStartDate}, medaile se neuděluje.`);
        continue;
      }

      const { data: predictions, error: predictionsError } = await supabase
        .from("predictions")
        .select("user_id, points")
        .in("match_id", matchIds)
        .not("points", "is", null);

      if (predictionsError) throw new Error(`Nepodařilo se načíst tipy týdne: ${predictionsError.message}`);

      const totals = new Map();
      for (const p of predictions ?? []) {
        totals.set(p.user_id, (totals.get(p.user_id) ?? 0) + p.points);
      }

      const maxPoints = Math.max(0, ...totals.values());

      if (maxPoints === 0) {
        console.log(`${competition.name}: v týdnu ${weekStartDate} nikdo nezískal žádné body, medaile se neuděluje.`);
        continue;
      }

      const winners = [...totals.entries()].filter(([, points]) => points === maxPoints);
      const rows = winners.map(([user_id]) => ({
        competition_id: competition.id,
        week_start: weekStartDate,
        user_id,
        points: maxPoints,
      }));

      const { error: insertError } = await supabase.from("weekly_badges").insert(rows);
      if (insertError) throw new Error(`Zápis medailí selhal: ${insertError.message}`);

      console.log(
        `${competition.name}: uděleno ${rows.length} medail${rows.length === 1 ? "" : "í"} za týden ${weekStartDate} (${maxPoints} b.).`,
      );
      await reportRecovery({ label, summary: `Poslední běh v pořádku, ${rows.length} medailí za týden ${weekStartDate}.` });
    } catch (err) {
      hadFailure = true;
      console.log(`::error::${competition.name}: ${err.message}`);
      await reportFailure({
        title: `⚠️ award-weekly-badges: ${competition.name} — běh selhal`,
        body: `Vyhodnocení týdenních medailí selhalo s chybou:\n\n\`\`\`\n${err.stack || err.message}\n\`\`\``,
        label,
      });
    }
  }

  if (hadFailure) process.exitCode = 1;
}

await main();
