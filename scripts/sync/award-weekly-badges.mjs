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
//
// Navazuje sběratelská karta (6.9.2026, viz docs/PROJECT.md): PO
// zpracování všech competitions se zjistí, kdo ten týden vyhrál aspoň
// jednu soutěž (napříč competitions), a takovému hráči se vylosuje
// přesně jedna karta z celého katalogu, bez duplicit -- viz
// awardCardsForWeek()/lib/cards.mjs. Vzácnost karty od 10.9.2026 už
// NEurčuje počet vyhraných soutěží za týden (appka to dřív dělala, ale
// znevýhodňovalo to hráče v míň soutěžích -- ti by nikdy nemohli
// dostat vzácnou/legendární kartu), jen ovlivňuje VÁHU při losování
// (drawCard v lib/cards.mjs). Nezávisle idempotentní přes card_draws
// (per-user), takže funguje i po částečném selhání předchozího běhu.

import { createSupabaseClient } from "./lib/supabase-client.mjs";
import { getPreviousWeekRange } from "./lib/week-range.mjs";
import { reportFailure, reportRecovery } from "./lib/notify-issue.mjs";
import { drawCard } from "./lib/cards.mjs";

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

  try {
    await awardCardsForWeek(supabase, weekStartDate);
  } catch (err) {
    hadFailure = true;
    console.log(`::error::Losování karet za týden ${weekStartDate}: ${err.message}`);
    await reportFailure({
      title: `⚠️ award-weekly-badges: losování karet za týden ${weekStartDate} selhalo`,
      body: `Losování sběratelských karet selhalo s chybou:\n\n\`\`\`\n${err.stack || err.message}\n\`\`\``,
      label: `weekly-badges-cards:${weekStartDate}`,
    });
  }

  if (hadFailure) process.exitCode = 1;
}

// Kdo ten týden vyhrál aspoň jednu soutěž (napříč competitions,
// weekly_badges už jsou v DB -- ať už je založil běh výše, nebo
// existovaly z dřívějška), tomu se vylosuje přesně jedna karta z celého
// katalogu, bez duplicit (drawCard v lib/cards.mjs vynechá karty, které
// hráč už vlastní, bez ohledu na jejich vzácnost). Kolik soutěží hráč
// vyhrál najednou se dál zaznamenává (`card_draws.win_count`) jen pro
// historický přehled -- o tom, KTERÁ karta padne, už nerozhoduje.
// Hráč, který už vlastní celý katalog, ten týden žádnou kartu nedostane
// (drawCard vrátí null) -- appka mu žádný řádek do card_draws nezapíše,
// takže se to samo napraví, jakmile appka doplní další karty.
//
// Idempotentní per-user přes card_draws (primary key user_id+week_start)
// -- hráč, kterému se karta v předchozím (třeba částečně selhaném) běhu
// už vylosovala, se přeskočí, ostatní se dolosují.
async function awardCardsForWeek(supabase, weekStartDate) {
  const { data: badges, error: badgesError } = await supabase
    .from("weekly_badges")
    .select("user_id")
    .eq("week_start", weekStartDate);
  if (badgesError) throw new Error(`Nepodařilo se načíst medaile týdne: ${badgesError.message}`);

  const winCountByUser = new Map();
  for (const b of badges ?? []) {
    winCountByUser.set(b.user_id, (winCountByUser.get(b.user_id) ?? 0) + 1);
  }

  if (winCountByUser.size === 0) {
    console.log(`Karty: v týdnu ${weekStartDate} nikdo nevyhrál žádnou soutěž, není co losovat.`);
    return;
  }

  const { data: existingDraws, error: existingDrawsError } = await supabase
    .from("card_draws")
    .select("user_id")
    .eq("week_start", weekStartDate);
  if (existingDrawsError) {
    throw new Error(`Nepodařilo se ověřit existující losování karet: ${existingDrawsError.message}`);
  }
  const alreadyDrawn = new Set((existingDraws ?? []).map((d) => d.user_id));

  const { data: cards, error: cardsError } = await supabase.from("cards").select("id, rarity");
  if (cardsError) throw new Error(`Nepodařilo se načíst katalog karet: ${cardsError.message}`);
  if (!cards || cards.length === 0) {
    console.log("Karty: katalog karet je prázdný, není co losovat.");
    return;
  }

  let drawnCount = 0;
  let fullyCollectedCount = 0;
  for (const [userId, winCount] of winCountByUser) {
    if (alreadyDrawn.has(userId)) continue;

    const { data: ownedRows, error: ownedError } = await supabase
      .from("user_cards")
      .select("card_id")
      .eq("user_id", userId);
    if (ownedError) throw new Error(`Nepodařilo se načíst sbírku hráče: ${ownedError.message}`);

    const ownedCardIds = new Set((ownedRows ?? []).map((r) => r.card_id));
    const drawn = drawCard(cards, ownedCardIds);
    if (drawn === null) {
      // Hráč už vlastní celý katalog -- žádná karta k losování, žádný
      // řádek do card_draws (ať se to samo zkusí znovu, jakmile appka
      // doplní další karty).
      fullyCollectedCount += 1;
      continue;
    }

    const { error: insertError } = await supabase
      .from("user_cards")
      .insert({ user_id: userId, card_id: drawn.id, quantity: 1 });
    if (insertError) throw new Error(`Zápis nové karty selhal: ${insertError.message}`);

    const { error: drawInsertError } = await supabase.from("card_draws").insert({
      user_id: userId,
      week_start: weekStartDate,
      card_id: drawn.id,
      rarity: drawn.rarity,
      win_count: winCount,
    });
    if (drawInsertError) throw new Error(`Zápis losování karty selhal: ${drawInsertError.message}`);

    drawnCount += 1;
  }

  console.log(
    `Karty: vylosováno ${drawnCount} karet za týden ${weekStartDate}` +
      (fullyCollectedCount > 0 ? ` (${fullyCollectedCount}× hráč už má celý katalog)` : "") +
      ".",
  );
}

await main();
