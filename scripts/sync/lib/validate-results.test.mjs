import { describe, it, expect } from "vitest";
import { validateResults } from "./validate-results.mjs";

function match(overrides = {}) {
  return {
    externalId: "g_1_abc123",
    homeTeam: "Sparta Praha",
    awayTeam: "Slavia Praha",
    kickoffAt: "2026-08-29T13:00:00.000Z",
    homeScore: 2,
    awayScore: 1,
    ...overrides,
  };
}

describe("validateResults", () => {
  it("accepts a well-formed batch", () => {
    const { ok, errors } = validateResults([match()]);
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
  });

  it("accepts an empty batch (none of the pending matches have a result yet)", () => {
    const { ok, errors } = validateResults([]);
    expect(ok).toBe(true);
    expect(errors).toEqual([]);
  });

  it("does not require a valid kickoff_at (results are matched by external_id only)", () => {
    const { ok } = validateResults([match({ kickoffAt: null })]);
    expect(ok).toBe(true);
  });

  it("rejects a match with no external_id", () => {
    const { ok, errors } = validateResults([match({ externalId: null })]);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/chybí external_id/);
  });

  it("rejects duplicate external_ids within the same batch", () => {
    const { ok, errors } = validateResults([
      match({ externalId: "g_1_same" }),
      match({ externalId: "g_1_same" }),
    ]);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("duplicitní external_id"))).toBe(true);
  });

  it("rejects a match with a missing team name", () => {
    const { ok, errors } = validateResults([match({ homeTeam: "" })]);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/chybí jméno domácího týmu/);
  });

  it("rejects home and away team being identical (parser almost certainly broken)", () => {
    const { ok, errors } = validateResults([
      match({ homeTeam: "Sparta Praha", awayTeam: "Sparta Praha" }),
    ]);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.includes("vyšli stejně"))).toBe(true);
  });

  it("rejects a missing score", () => {
    const { ok, errors } = validateResults([match({ homeScore: null })]);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/neplatné skóre domácích/);
  });

  it("rejects a negative score", () => {
    const { ok, errors } = validateResults([match({ awayScore: -1 })]);
    expect(ok).toBe(false);
    expect(errors[0]).toMatch(/neplatné skóre hostů/);
  });
});
