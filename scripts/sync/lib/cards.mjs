// Čistá logika kolem sběratelských karet za vítězství týdne (žádné
// I/O) -- vzácnost podle počtu vyhraných soutěží + losování karty bez
// duplicit, dokud hráč nemá všechny karty dané vzácnosti. Používá
// award-weekly-badges.mjs.

// 1 vyhraná soutěž ten týden = běžná, 2 = vzácná, 3 nebo víc (appka
// dnes sleduje 4 soutěže, ale strop není natvrdo na 4 -- "všechny" má
// zůstat legendární i po přidání další soutěže) = legendární.
export function rarityForWinCount(winCount) {
  if (winCount >= 3) return "legendary";
  if (winCount === 2) return "rare";
  return "common";
}

// `cardsOfRarity` -- katalog karet (musí mít `id`) omezený na danou
// vzácnost. `ownedCardIds` -- Set čísel karet té vzácnosti, které hráč
// už vlastní. `random` -- injektovaný zdroj náhody (výchozí
// Math.random), aby šel výsledek v testu určit napevno.
export function drawCard(cardsOfRarity, ownedCardIds, random = Math.random) {
  if (cardsOfRarity.length === 0) {
    throw new Error("Žádné karty dané vzácnosti v katalogu.");
  }
  const unowned = cardsOfRarity.filter((c) => !ownedCardIds.has(c.id));
  const pool = unowned.length > 0 ? unowned : cardsOfRarity;
  const index = Math.floor(random() * pool.length);
  return pool[index];
}
