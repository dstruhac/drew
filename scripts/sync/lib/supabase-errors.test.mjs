import { describe, expect, it } from "vitest";
import { throwIfSupabaseError } from "../../../src/lib/supabase/errors.ts";

describe("throwIfSupabaseError", () => {
  it("does nothing when the query succeeded", () => {
    expect(() => throwIfSupabaseError(null, "Načtení soutěží")).not.toThrow();
  });

  it("adds useful context to a database failure", () => {
    expect(() =>
      throwIfSupabaseError({ code: "42501", message: "permission denied" }, "Načtení soutěží"),
    ).toThrow("Načtení soutěží: permission denied");
  });

  it("allows an expected missing-row response", () => {
    expect(() =>
      throwIfSupabaseError(
        { code: "PGRST116", message: "no rows" },
        "Načtení soutěže",
        ["PGRST116"],
      ),
    ).not.toThrow();
  });
});
