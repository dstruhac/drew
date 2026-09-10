// Čistá logika kolem sběratelských karet za vítězství týdne (žádné
// I/O) -- losování bez duplicit z celého katalogu, vážené podle
// vzácnosti karty samotné. Používá award-weekly-badges.mjs.

// Váhy podle vzácnosti KARTY -- čím vzácnější karta, tím řidší šance,
// že padne dřív, ale NIKDY nemožné (10.9.2026, na žádost uživatele --
// appka dřív vázala vzácnost na POČET soutěží, které hráč ten týden
// vyhrál najednou, takže hráč hrající jen jednu soutěž nemohl nikdy
// dostat vzácnou/legendární kartu bez ohledu na to, jak dobře tipuje).
// Teď stačí vyhrát aspoň jednu soutěž (o tom rozhoduje
// award-weekly-badges.mjs před zavoláním drawCard) -- KTERÁ konkrétní
// karta padne je čistě náhoda vážená vzácností té karty.
const RARITY_WEIGHT = {
  common: 5,
  rare: 2,
  legendary: 1,
};

// `catalog` -- celý katalog karet (musí mít `id`, `rarity`).
// `ownedCardIds` -- Set čísel karet, které hráč už vlastní (JAKÉKOLIV
// vzácnosti) -- appka duplicity nepodporuje, takže se tyhle karty z
// losování úplně vyřadí. Vrátí `null`, pokud hráč už vlastní celý
// katalog -- není co losovat, appka mu ten týden žádnou novou kartu
// nepřidá (dokud appka nedoplní další karty do katalogu). `random` --
// injektovaný zdroj náhody (výchozí Math.random), aby šel výsledek
// v testu určit napevno.
export function drawCard(catalog, ownedCardIds, random = Math.random) {
  const pool = catalog.filter((c) => !ownedCardIds.has(c.id));
  if (pool.length === 0) return null;

  const totalWeight = pool.reduce((sum, c) => sum + (RARITY_WEIGHT[c.rarity] ?? 1), 0);
  let roll = random() * totalWeight;
  for (const card of pool) {
    roll -= RARITY_WEIGHT[card.rarity] ?? 1;
    if (roll < 0) return card;
  }
  // Zaokrouhlovací pojistka (roll by teoreticky mohl zůstat >= 0 i po
  // projetí celého poolu kvůli chybě na posledním desetinném místě).
  return pool[pool.length - 1];
}
