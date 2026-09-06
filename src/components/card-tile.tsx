import { Lock } from "lucide-react";
import type { CardRarity } from "@/lib/supabase/database.types";
import { RARITY_LABELS, RARITY_BORDER_CLASSES } from "@/lib/rarity";

export type CardData = {
  id: number;
  name: string;
  club: string;
  position: string;
  flavor_text: string;
  image_url: string | null;
  rarity: CardRarity;
};

// Jedna sběratelská kartička ve "Sbírce artefaktů"/na veřejném profilu
// -- vlastněná ukáže fotku/jméno/klub, nevlastněná zůstane "zamčená"
// (appka schválně neprozradí jméno ani fotku dopředu, jen vzácnost --
// to je součást sbírání). Rámeček podle vzácnosti (--rarity-*) je vidět
// jen u vlastněné karty, u zamčené by prozrazoval, co appka skrývá.
export function CardTile({
  card,
  owned,
  quantity,
  isNew,
  muted,
}: {
  card: CardData;
  owned: boolean;
  quantity?: number;
  // Právě dohrála "pop" animace odemčení (po zavření gratulačního
  // modalu) -- viz badge-center.tsx.
  isNew?: boolean;
  // Karta je nová, ale modal ještě nebyl zavřený -- appka ji v mřížce
  // schválně ukáže "ztlumenou" (přestože je od téhle chvíle technicky
  // vlastněná), ať odemčení v modalu i následná animace dole nepůsobí
  // duplicitně.
  muted?: boolean;
}) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border-2 bg-surface shadow-[var(--shadow-card)] transition-all duration-[var(--duration-celebration)] ${
        owned ? RARITY_BORDER_CLASSES[card.rarity] : "border-border-subtle"
      } ${muted ? "grayscale opacity-50" : ""} ${isNew ? "animate-[celebrate-pop_0.7s_var(--ease-bounce)]" : ""}`}
    >
      <div className="relative aspect-[3/4] w-full bg-surface-hover">
        {owned && card.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Lock className="h-6 w-6 text-faint-foreground" strokeWidth={2} />
          </div>
        )}
        <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
          #{card.id}
        </span>
        {owned && quantity !== undefined && quantity > 1 && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
            ×{quantity}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-2 text-center">
        <p className="truncate text-xs font-extrabold">{owned ? card.name : "???"}</p>
        <p className="truncate text-[10px] font-semibold text-faint-foreground">
          {owned ? card.club : RARITY_LABELS[card.rarity]}
        </p>
      </div>
    </div>
  );
}
