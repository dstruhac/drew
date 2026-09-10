import { describe, it, expect } from "vitest";
import { drawCard } from "./cards.mjs";

describe("drawCard", () => {
  // Váhy: common=5, rare=2, legendary=1 -> totalWeight 13 pro celý
  // katalog. roll = random() * totalWeight, pak se odečítá po pořadí.
  const catalog = [
    { id: 1, rarity: "common" },
    { id: 2, rarity: "common" },
    { id: 3, rarity: "rare" },
    { id: 4, rarity: "legendary" },
  ];

  it("losuje z nevlastněných karet napříč VŠEMI vzácnostmi, ne jen jedné", () => {
    // random()=0 -> roll=0 -> první karta v poolu (common #1).
    expect(drawCard(catalog, new Set(), () => 0).id).toBe(1);
    // random() těsně pod 1 -> roll těsně pod 13 -> poslední karta (legendary #4).
    expect(drawCard(catalog, new Set(), () => 0.999).id).toBe(4);
  });

  it("váží podle vzácnosti karty, ne podle toho, kolik soutěží hráč vyhrál", () => {
    // roll v [5,10) -> druhá common karta (#2).
    expect(drawCard(catalog, new Set(), () => 0.5).id).toBe(2);
    // roll v [10,12) -> rare karta (#3).
    expect(drawCard(catalog, new Set(), () => 0.8).id).toBe(3);
    // roll v [12,13) -> legendary karta (#4).
    expect(drawCard(catalog, new Set(), () => 0.99).id).toBe(4);
  });

  it("vynechá vlastněné karty bez ohledu na jejich vzácnost", () => {
    // Vlastní common #1 a rare #3 -> pool je jen [common #2, legendary #4],
    // totalWeight 6. random()=0 -> karta #2, random() blízko 1 -> karta #4.
    const owned = new Set([1, 3]);
    expect(drawCard(catalog, owned, () => 0).id).toBe(2);
    expect(drawCard(catalog, owned, () => 0.99).id).toBe(4);
  });

  it("vrátí null, pokud hráč vlastní celý katalog -- appka nikdy nelosuje duplicitu", () => {
    const owned = new Set([1, 2, 3, 4]);
    expect(drawCard(catalog, owned, () => 0)).toBeNull();
    expect(drawCard(catalog, owned, () => 0.5)).toBeNull();
  });

  it("prázdný katalog je rovnou null, ne chyba", () => {
    expect(drawCard([], new Set(), () => 0)).toBeNull();
  });
});
