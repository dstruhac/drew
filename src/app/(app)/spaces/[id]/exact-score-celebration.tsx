"use client";

import { useEffect, useState } from "react";

// "Banger" moment č. 1 (redesign 29.8.2026): když appka poprvé v
// tomhle prohlížeči zobrazí zápas s přesně trefeným tipem, pustí
// malý konfetový výbuch + zvýrazní bodovou částku. Appka si to
// pamatuje jen v localStorage tohohle zařízení (ne v appce/databázi)
// -- vědomé zjednodušení, viz docs/PROJECT.md.
function hasCelebrated(matchId: string): boolean {
  try {
    return localStorage.getItem(`drew:celebrated:${matchId}`) !== null;
  } catch {
    return true; // localStorage nedostupné -- radši nic, než opakovat efekt
  }
}

function markCelebrated(matchId: string) {
  try {
    localStorage.setItem(`drew:celebrated:${matchId}`, "1");
  } catch {
    // nevadí -- appka příště jen zkusí konfety znovu, nic se nerozbije
  }
}

export function ExactScoreCelebration({
  matchId,
  points,
}: {
  matchId: string;
  points: number;
}) {
  const [justCelebrated, setJustCelebrated] = useState(false);

  useEffect(() => {
    if (hasCelebrated(matchId)) return;
    markCelebrated(matchId);
    setJustCelebrated(true);

    import("canvas-confetti").then(({ default: confetti }) => {
      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.3 },
        colors: ["#16a34a", "#22c55e", "#ffd166"],
      });
    });
  }, [matchId]);

  return (
    <span
      className={`text-lg font-extrabold leading-none text-success ${
        justCelebrated ? "animate-[celebrate-pop_0.6s_var(--ease-bounce)]" : ""
      }`}
    >
      {points} b.
    </span>
  );
}
