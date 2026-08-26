import { describe, it, expect } from "vitest";
import { validateFixtures } from "./validate-fixtures.mjs";

function match(overrides = {}) {
  return {
    externalId: "g_1_abc123",
    homeTeam: "Sparta Praha",
    awayTeam: "Slavia Praha",
    kickoffAt: "2026-08-29T13:00:00.000Z",
    homeScore: null,
    awayScore: null,
    ...overrides,
  };
}

const range = { minExpected: 1, maxExpected: 60 };

describe("validateFixtures", () => {
  it("accepts a well-formed batch", () => {
    const { ok, errors } = validateFixtures([match()], range);
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
  });

  it("rejects an empty batch (selector found nothing — layout probably changed)", () => {
    const { ok, errors } = validateFixtures([], range);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/Nalezeno jen 0/);
  });

  it("rejects a suspiciously large batch", () => {
    const many = Array.from({ length: 61 }, (_, i) =>
      match({ externalId: `g_1_${i}`, kickoffAt: `2026-08-${(i % 28) + 1}T13:00:00.000Z` }),
    );
    const { ok, errors } = validateFixtures(many, range);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/víc než očekávaných/);
  });

  it("rejects a match with no external_id", () => {
    const { ok, errors } = validateFixtures([match({ externalId: null })], range);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/chybí external_id/);
  });

  it("rejects duplicate external_ids within the same batch", () => {
    const { ok, errors } = validateFixtures(
      [match({ externalId: "g_1_same" }), match({ externalId: "g_1_same" })],
      range,
    );
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("duplicitní external_id"))).toBe(true);
  });

  it("rejects a match with a missing team name", () => {
    const { ok, errors } = validateFixtures([match({ homeTeam: "" })], range);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/chybí jméno domácího týmu/);
  });

  it("rejects home and away team being identical (parser almost certainly broken)", () => {
    const { ok, errors } = validateFixtures(
      [match({ homeTeam: "Sparta Praha", awayTeam: "Sparta Praha" })],
      range,
    );
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("vyšli stejně"))).toBe(true);
  });

  it("rejects an invalid kickoff_at", () => {
    const { ok, errors } = validateFixtures([match({ kickoffAt: null })], range);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/neplatný kickoff_at/);
  });

  it("accepts a finished match with a real score", () => {
    const { ok } = validateFixtures([match({ homeScore: 3, awayScore: 1 })], range);
    expect(ok).toBe(true);
  });

  it("rejects a negative score", () => {
    const { ok, errors } = validateFixtures([match({ homeScore: -1 })], range);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/neplatné skóre domácích/);
  });
});
