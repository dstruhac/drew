import { describe, it, expect } from "vitest";
import { getPreviousWeekRange, getTodayRange } from "./week-range.mjs";

describe("getTodayRange", () => {
  it("mid-day, returns today's Prague calendar boundaries (summer/CEST)", () => {
    const result = getTodayRange(new Date("2026-08-28T15:00:00Z")); // 17:00 CEST
    expect(result.dateString).toBe("2026-08-28");
    expect(result.todayStart).toBe("2026-08-27T22:00:00.000Z"); // 28.8. 00:00 CEST
    expect(result.todayEnd).toBe("2026-08-28T22:00:00.000Z"); // 29.8. 00:00 CEST
  });

  it("just after UTC midnight but already the next Prague day, resolves to the Prague date", () => {
    // 23:00 UTC on the 27th is already 01:00 CEST on the 28th.
    const result = getTodayRange(new Date("2026-08-27T23:00:00Z"));
    expect(result.dateString).toBe("2026-08-28");
    expect(result.todayStart).toBe("2026-08-27T22:00:00.000Z");
    expect(result.todayEnd).toBe("2026-08-28T22:00:00.000Z");
  });

  it("handles the winter (CET) offset correctly", () => {
    const result = getTodayRange(new Date("2027-01-15T10:00:00Z")); // 11:00 CET
    expect(result.dateString).toBe("2027-01-15");
    expect(result.todayStart).toBe("2027-01-14T23:00:00.000Z");
    expect(result.todayEnd).toBe("2027-01-15T23:00:00.000Z");
  });
});

describe("getPreviousWeekRange", () => {
  it("on a Monday morning, returns the week that just ended (summer/CEST)", () => {
    // 31.8.2026 je pondělí -- předchozí týden je po 24.8. -- ne 30.8.
    const result = getPreviousWeekRange(new Date("2026-08-31T05:00:00Z"));
    expect(result.weekStartDate).toBe("2026-08-24");
    expect(result.weekStart).toBe("2026-08-23T22:00:00.000Z"); // pondělí 00:00 CEST
    expect(result.weekEnd).toBe("2026-08-30T22:00:00.000Z"); // následující pondělí 00:00 CEST
  });

  it("mid-week (not just Monday), still resolves to the last FULLY completed week", () => {
    // 26.8.2026 je středa, uprostřed týdne 24.-30.8. -- ten je ještě
    // rozpracovaný, takže "předchozí" týden je 17.-23.8.
    const result = getPreviousWeekRange(new Date("2026-08-26T12:00:00Z"));
    expect(result.weekStartDate).toBe("2026-08-17");
    expect(result.weekEnd).toBe("2026-08-23T22:00:00.000Z");
  });

  it("on a Sunday, still treats the in-progress week (started that Monday) as not yet complete", () => {
    // 30.8.2026 je neděle, poslední den týdne 24.-30.8. -- pořád ten
    // stejný "aktuální" týden jako u středy výše, výsledek je stejný.
    const result = getPreviousWeekRange(new Date("2026-08-30T20:00:00Z"));
    expect(result.weekStartDate).toBe("2026-08-17");
  });

  it("handles the winter (CET) offset correctly", () => {
    // 18.1.2027 je pondělí -- předchozí týden je 11.-17.1., v zimním čase (UTC+1).
    const result = getPreviousWeekRange(new Date("2027-01-18T05:00:00Z"));
    expect(result.weekStartDate).toBe("2027-01-11");
    expect(result.weekStart).toBe("2027-01-10T23:00:00.000Z"); // pondělí 00:00 CET
    expect(result.weekEnd).toBe("2027-01-17T23:00:00.000Z");
  });
});
