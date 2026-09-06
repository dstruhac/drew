import { describe, it, expect } from "vitest";
import { rarityForWinCount, drawCard } from "./cards.mjs";

describe("rarityForWinCount", () => {
  it("1 výhra = běžná", () => {
    expect(rarityForWinCount(1)).toBe("common");
  });

  it("2 výhry = vzácná", () => {
    expect(rarityForWinCount(2)).toBe("rare");
  });

  it("3 výhry = legendární", () => {
    expect(rarityForWinCount(3)).toBe("legendary");
  });

  it("4 výhry (všechny sledované soutěže) = pořád legendární, ne zvláštní stupeň navíc", () => {
    expect(rarityForWinCount(4)).toBe("legendary");
  });
});

describe("drawCard", () => {
  const cards = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it("vybere jednu z NEvlastněných karet, pokud nějaké zbývají", () => {
    const owned = new Set([1]);
    // random()=0 -> první z poolu; pool = nevlastněné [2, 3]
    expect(drawCard(cards, owned, () => 0).id).toBe(2);
    expect(drawCard(cards, owned, () => 0.99).id).toBe(3);
  });

  it("jakmile hráč vlastní všechny karty dané vzácnosti, losuje duplicitu ze všech", () => {
    const owned = new Set([1, 2, 3]);
    expect(drawCard(cards, owned, () => 0).id).toBe(1);
    expect(drawCard(cards, owned, () => 0.99).id).toBe(3);
  });

  it("prázdný katalog dané vzácnosti je chyba (nemělo by nastat)", () => {
    expect(() => drawCard([], new Set(), () => 0)).toThrow();
  });
});
