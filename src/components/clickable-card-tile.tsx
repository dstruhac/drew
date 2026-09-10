"use client";

import { useState } from "react";
import { CardTile, type CardData } from "./card-tile";
import { RARITY_LABELS, RARITY_PILL_CLASSES, RARITY_RING_VARS, LOCKED_CARD_TAUNTS } from "@/lib/rarity";

// Klikatelná obálka okolo CardTile pro mřížky sbírky (badge-center.tsx
// "Sbírka artefaktů", profil/[userId]/page.tsx "Sbírka karet") -- na
// žádost uživatele 10.9.2026: klik na vlastněnou kartičku ji "zvedne"
// a odhalí vtipný popis (card.flavor_text) v modalu; klik na zamčenou
// jen vtipně odmítne (appka neprozradí jméno/fotku dopředu, to je
// součást chtěné emoce "musím si tuhle ještě vysloužit"). CardTile
// samotná zůstává čistě vizuální/bez interakce, ať ji dál může použít
// i needitovatelný náhled v gratulačním modalu (malá kartička vedle
// "Gratuluju...").
export function ClickableCardTile({
  card,
  owned,
  quantity,
  isNew,
  muted,
}: {
  card: CardData;
  owned: boolean;
  quantity?: number;
  isNew?: boolean;
  muted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [taunt, setTaunt] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  function handleClick() {
    if (!owned) {
      setTaunt(LOCKED_CARD_TAUNTS[Math.floor(Math.random() * LOCKED_CARD_TAUNTS.length)]);
      setShake(true);
      window.setTimeout(() => setTaunt(null), 2200);
      return;
    }
    setOpen(true);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        onAnimationEnd={() => setShake(false)}
        className={`btn-press block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
          shake ? "animate-[card-shake_0.4s_ease]" : ""
        }`}
      >
        <CardTile card={card} owned={owned} quantity={quantity} isNew={isNew} muted={muted} />
      </button>

      {taunt && (
        <div className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max max-w-[180px] -translate-x-1/2 rounded-xl bg-[#15171c] px-3 py-2 text-center text-[11px] font-bold text-white shadow-[var(--shadow-card-hover)]">
          🔒 {taunt}
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex max-w-md flex-col items-center gap-4 overflow-hidden rounded-[28px] bg-[#15171c] p-7 text-center sm:flex-row sm:text-left"
            onClick={(event) => event.stopPropagation()}
            style={RARITY_RING_VARS[card.rarity] as React.CSSProperties}
          >
            <div
              className="pointer-events-none absolute -top-10 -left-8 h-40 w-40 rounded-full opacity-60 blur-xl"
              style={{ background: "var(--rc-glow)" }}
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Zavřít"
              className="btn-press absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              ✕
            </button>

            <div
              className="relative w-36 flex-shrink-0 sm:w-40"
              style={{ animation: "card-reveal-lift 0.5s cubic-bezier(0.22, 1.6, 0.4, 1)" }}
            >
              <CardTile card={card} owned={owned} quantity={quantity} />
            </div>

            <div className="relative flex flex-col items-center gap-2 sm:items-start">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] ${RARITY_PILL_CLASSES[card.rarity]}`}
              >
                {RARITY_LABELS[card.rarity]}
              </span>
              <h3 className="text-lg font-extrabold text-white">{card.name}</h3>
              <p className="text-xs font-bold text-white/55">{card.club}</p>
              <p
                className="mt-1 max-w-[26ch] border-l-2 pl-3 text-sm italic leading-relaxed text-white/90"
                style={{ borderColor: "var(--rc)" }}
              >
                „{card.flavor_text}“
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
