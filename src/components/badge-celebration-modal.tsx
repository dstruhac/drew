"use client";

import { useEffect, useState } from "react";
import { Medal } from "lucide-react";

type Badge = {
  competition_id: string;
  week_start: string;
  points: number;
  awarded_at: string;
  competitions: { name: string } | null;
};

const WATERMARK_KEY = "drew:lastSeenBadgeAt";

// Fronta neviděných medailí -- appka je zobrazí jednu po druhé
// (odsouhlaseno implicitně tím, že appka umí udělit víc medailí
// najednou při remíze víc soutěží ve stejném týdnu). Watermark je
// jen v tomhle prohlížeči/zařízení, ne v appce/databázi -- vědomé
// zjednodušení, viz docs/PROJECT.md.
export function BadgeCelebrationModal({ badges }: { badges: Badge[] }) {
  const [queue, setQueue] = useState<Badge[]>([]);

  useEffect(() => {
    let watermark: string | null;
    try {
      watermark = localStorage.getItem(WATERMARK_KEY);
    } catch {
      return; // localStorage nedostupné -- appka radši nic neukáže, než aby to opakovala pořád dokola
    }

    const unseen = badges.filter((b) => !watermark || b.awarded_at > watermark);
    if (unseen.length === 0) return;

    setQueue(unseen);
    import("canvas-confetti").then(({ default: confetti }) => {
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.3 },
        colors: ["#16a34a", "#22c55e", "#ffd166", "#ffffff"],
      });
    });
    // Jen při prvním vykreslení -- appka porovnává proti watermarku
    // z localStorage, ne proti proměnlivým `badges` propům.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (queue.length === 0) return null;

  const current = queue[0];

  function dismiss() {
    try {
      localStorage.setItem(WATERMARK_KEY, current.awarded_at);
    } catch {
      // nevadí -- appka to příště jen ukáže znovu, nic se nerozbije
    }
    setQueue((q) => q.slice(1));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-sm overflow-hidden rounded-[26px] bg-[#15171c] p-8 text-center">
        <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-accent/25" />

        <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent animate-[celebrate-pop_0.6s_var(--ease-bounce)]">
          <Medal className="h-8 w-8 text-accent-foreground" strokeWidth={2} />
        </div>
        <h2 className="relative mt-4 text-lg font-extrabold text-white">
          Jsi vítěz týdne!
        </h2>
        <p className="relative mt-1 text-sm font-semibold text-white/60">
          {current.competitions?.name ?? "Soutěž"} · {current.points} bodů
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="btn-press relative mt-6 w-full rounded-full bg-accent px-6 py-3 text-sm font-extrabold text-accent-foreground"
        >
          Paráda!
        </button>
      </div>
    </div>
  );
}
