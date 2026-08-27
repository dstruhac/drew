import { describe, it, expect } from "vitest";
import { getPreviousWeekRange } from "./week-range.mjs";

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
