import { describe, it, expect } from "vitest";
import { computeMissingByUser, shouldSendNow, buildReminderEmail } from "./reminder-logic.mjs";

describe("computeMissingByUser", () => {
  it("finds matches without a prediction, sorted by kickoff time", () => {
    const participants = [{ user_id: "u1", competition_id: "c1" }];
    const matches = [
      { id: "m2", competition_id: "c1", kickoff_at: "2026-08-28T18:00:00Z" },
      { id: "m1", competition_id: "c1", kickoff_at: "2026-08-28T10:00:00Z" },
    ];
    const predictions = [];

    const result = computeMissingByUser(participants, matches, predictions);

    expect(result.get("u1").matches.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(result.get("u1").earliestKickoffAt).toBe("2026-08-28T10:00:00Z");
  });

  it("excludes matches the user already predicted", () => {
    const participants = [{ user_id: "u1", competition_id: "c1" }];
    const matches = [
      { id: "m1", competition_id: "c1", kickoff_at: "2026-08-28T10:00:00Z" },
      { id: "m2", competition_id: "c1", kickoff_at: "2026-08-28T18:00:00Z" },
    ];
    const predictions = [{ match_id: "m1", user_id: "u1" }];

    const result = computeMissingByUser(participants, matches, predictions);

    expect(result.get("u1").matches.map((m) => m.id)).toEqual(["m2"]);
  });

  it("a user with no missing matches doesn't appear in the result at all", () => {
    const participants = [{ user_id: "u1", competition_id: "c1" }];
    const matches = [{ id: "m1", competition_id: "c1", kickoff_at: "2026-08-28T10:00:00Z" }];
    const predictions = [{ match_id: "m1", user_id: "u1" }];

    const result = computeMissingByUser(participants, matches, predictions);

    expect(result.has("u1")).toBe(false);
  });

  it("combines missing matches across multiple competitions the user plays", () => {
    const participants = [
      { user_id: "u1", competition_id: "c1" },
      { user_id: "u1", competition_id: "c2" },
    ];
    const matches = [
      { id: "m1", competition_id: "c1", kickoff_at: "2026-08-28T18:00:00Z" },
      { id: "m2", competition_id: "c2", kickoff_at: "2026-08-28T11:30:00Z" },
    ];
    const predictions = [];

    const result = computeMissingByUser(participants, matches, predictions);

    expect(result.get("u1").matches.map((m) => m.id)).toEqual(["m2", "m1"]);
    expect(result.get("u1").earliestKickoffAt).toBe("2026-08-28T11:30:00Z");
  });

  it("only sees matches from competitions the user actually participates in", () => {
    const participants = [{ user_id: "u1", competition_id: "c1" }];
    const matches = [{ id: "m1", competition_id: "c2", kickoff_at: "2026-08-28T10:00:00Z" }];
    const predictions = [];

    const result = computeMissingByUser(participants, matches, predictions);

    expect(result.size).toBe(0);
  });

  it("keeps users independent of each other", () => {
    const participants = [
      { user_id: "u1", competition_id: "c1" },
      { user_id: "u2", competition_id: "c1" },
    ];
    const matches = [{ id: "m1", competition_id: "c1", kickoff_at: "2026-08-28T10:00:00Z" }];
    const predictions = [{ match_id: "m1", user_id: "u1" }];

    const result = computeMissingByUser(participants, matches, predictions);

    expect(result.has("u1")).toBe(false);
    expect(result.get("u2").matches.map((m) => m.id)).toEqual(["m1"]);
  });
});

describe("shouldSendNow", () => {
  it("is false more than the threshold before kickoff", () => {
    const kickoff = "2026-08-28T18:00:00Z";
    const now = new Date("2026-08-28T15:00:00Z"); // 3h before
    expect(shouldSendNow(kickoff, now, 2)).toBe(false);
  });

  it("is true exactly at the threshold", () => {
    const kickoff = "2026-08-28T18:00:00Z";
    const now = new Date("2026-08-28T16:00:00Z"); // exactly 2h before
    expect(shouldSendNow(kickoff, now, 2)).toBe(true);
  });

  it("is true after the threshold has passed (e.g. hourly cron ran a bit late)", () => {
    const kickoff = "2026-08-28T18:00:00Z";
    const now = new Date("2026-08-28T16:20:00Z");
    expect(shouldSendNow(kickoff, now, 2)).toBe(true);
  });

  it("is true even after kickoff itself (defensive -- shouldn't normally happen since matches filter to future)", () => {
    const kickoff = "2026-08-28T18:00:00Z";
    const now = new Date("2026-08-28T19:00:00Z");
    expect(shouldSendNow(kickoff, now, 2)).toBe(true);
  });
});

describe("buildReminderEmail", () => {
  it("uses singular subject/body for exactly one missing match", () => {
    const matches = [
      {
        id: "m1",
        competition_id: "c1",
        home_team: "Slavia Praha",
        away_team: "Sparta Praha",
        kickoff_at: "2026-08-28T16:00:00Z", // 18:00 CEST
      },
    ];

    const { subject, text } = buildReminderEmail(matches, "https://drew-pink.vercel.app");

    expect(subject).toBe("Chybí ti tip na dnešní zápas");
    expect(text).toContain("dnes tě čeká zápas, na který ještě nemáš tip:");
    expect(text).toContain("18:00 Slavia Praha – Sparta Praha");
    expect(text).toContain("https://drew-pink.vercel.app/spaces/c1/matches/m1");
  });

  it("uses plural subject/body and lists every match for more than one", () => {
    const matches = [
      {
        id: "m1",
        competition_id: "c1",
        home_team: "Slavia Praha",
        away_team: "Sparta Praha",
        kickoff_at: "2026-08-28T16:00:00Z",
      },
      {
        id: "m2",
        competition_id: "c2",
        home_team: "Liverpool",
        away_team: "Arsenal",
        kickoff_at: "2026-08-28T18:30:00Z",
      },
    ];

    const { subject, text } = buildReminderEmail(matches, "https://drew-pink.vercel.app");

    expect(subject).toBe("Chybí ti tip na 2 dnešní zápasy");
    expect(text).toContain("dnes tě čekají zápasy, na které ještě nemáš tip:");
    expect(text).toContain("https://drew-pink.vercel.app/spaces/c1/matches/m1");
    expect(text).toContain("https://drew-pink.vercel.app/spaces/c2/matches/m2");
  });
});
