"use client";

import { useEffect, useState } from "react";

// "Banger" moment č. 1 (redesign 29.8.2026, konfety odebrány
// 6.9.2026 na žádost uživatele -- nelíbily se mu): když appka poprvé
// v tomhle prohlížeči zobrazí zápas s přesně trefeným tipem, zvýrazní
// bodovou částku krátkou "pop" animací. Appka si to pamatuje jen
// v localStorage tohohle zařízení (ne v appce/databázi) -- vědomé
// zjednodušení, viz docs/PROJECT.md.
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
  }, [matchId]);

  return (
    <span
      className={`text-lg font-extrabold leading-none text-accent ${
        justCelebrated ? "animate-[celebrate-pop_0.6s_var(--ease-bounce)]" : ""
      }`}
    >
      {points} b.
    </span>
  );
}
