import { describe, it, expect } from "vitest";
import { parseScore, pragueWallTimeToUtcIso, inferYear } from "./scrape-livesport.mjs";

describe("parseScore", () => {
  it("parses a real score", () => {
    expect(parseScore("2")).toBe(2);
    expect(parseScore("0")).toBe(0);
  });

  it("returns null for the not-yet-played placeholder", () => {
    expect(parseScore("-")).toBeNull();
  });

  it("returns null for empty/missing text", () => {
    expect(parseScore("")).toBeNull();
    expect(parseScore(null)).toBeNull();
    expect(parseScore(undefined)).toBeNull();
  });

  it("returns null for non-numeric junk (layout changed under us)", () => {
    expect(parseScore("TBD")).toBeNull();
  });
});

describe("pragueWallTimeToUtcIso", () => {
  it("converts summer time (CEST, UTC+2) correctly", () => {
    // 29.8.2026 15:00 pražského (letního) času -> 13:00 UTC
    expect(pragueWallTimeToUtcIso(2026, 8, 29, 15, 0)).toBe("2026-08-29T13:00:00.000Z");
  });

  it("converts winter time (CET, UTC+1) correctly", () => {
    // 16.1.2027 18:00 pražského (zimního) času -> 17:00 UTC
    expect(pragueWallTimeToUtcIso(2027, 1, 16, 18, 0)).toBe("2027-01-16T17:00:00.000Z");
  });

  it("gets the offset right on the autumn DST-change day itself (evening match)", () => {
    // 25.10.2026: přechod z CEST na CET brzy ráno. Večerní zápas (kdy se
    // reálně hraje) je už v CET (UTC+1).
    expect(pragueWallTimeToUtcIso(2026, 10, 25, 18, 0)).toBe("2026-10-25T17:00:00.000Z");
  });

  it("gets the offset right on the spring DST-change day itself (evening match)", () => {
    // 29.3.2026: přechod z CET na CEST brzy ráno. Večerní zápas je už v
    // CEST (UTC+2).
    expect(pragueWallTimeToUtcIso(2026, 3, 29, 18, 0)).toBe("2026-03-29T16:00:00.000Z");
  });

  it("known limitation: is not exact for times in the ~1-4h window on the change day itself", () => {
    // Offset se počítá z poledne daného dne (viz komentář u funkce) —
    // pro časy brzy ráno přesně v den přechodu proto může vyjít o hodinu
    // vedle. Sportovní zápasy se v tuhle dobu nehrají, takže to appce
    // nevadí — tenhle test jen zdokumentuje, že o limitaci víme a je
    // záměrná, ne že bychom ji nezaznamenali.
    expect(pragueWallTimeToUtcIso(2026, 10, 25, 1, 30)).toBe("2026-10-25T00:30:00.000Z");
  });
});

describe("inferYear", () => {
  const today = new Date("2026-08-26T00:00:00Z");

  it("keeps the current year for a date later this year", () => {
    expect(inferYear(9, 20, 13, 0, today)).toBe(2026);
  });

  it("rolls over to next year for a date more than ~2 months in the past", () => {
    // Zápas v lednu, dnešek je srpen -> jde o leden PŘÍŠTÍHO roku (nová sezóna)
    expect(inferYear(1, 16, 18, 0, today)).toBe(2027);
  });

  it("does not roll over for a date just a few days in the past", () => {
    // Sezóna běžně zahrnuje i pár dní zpátky (probíhající den) — to není "loňský" zápas.
    const almostToday = new Date("2026-08-26T00:00:00Z");
    expect(inferYear(8, 20, 13, 0, almostToday)).toBe(2026);
  });
});
