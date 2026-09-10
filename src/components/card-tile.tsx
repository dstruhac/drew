import { Lock } from "lucide-react";
import type { CardRarity } from "@/lib/supabase/database.types";
import {
  RARITY_LABELS,
  RARITY_BORDER_CLASSES,
  RARITY_GLOW_OPACITY,
  RARITY_SHIMMER_DURATION,
  RARITY_RING_VARS,
  TOTAL_PLANNED_CARDS,
} from "@/lib/rarity";

export type CardData = {
  id: number;
  name: string;
  club: string;
  position: string;
  flavor_text: string;
  image_url: string | null;
  rarity: CardRarity;
};

const CORNER_MARKS = [
  "left-1 top-1 border-l-2 border-t-2 rounded-tl-[3px]",
  "right-1 top-1 border-r-2 border-t-2 rounded-tr-[3px]",
  "left-1 bottom-1 border-l-2 border-b-2 rounded-bl-[3px]",
  "right-1 bottom-1 border-r-2 border-b-2 rounded-br-[3px]",
];

// Jedna sběratelská kartička ve "Sbírce artefaktů"/na veřejném profilu
// -- vlastněná ukáže fotku/jméno/klub v "certifikátovém" rámu s
// medailonkem čísla (X/50, appka je od začátku myšlená na plnou
// padesátku bez ohledu na to, kolik karet dnes reálně existuje),
// nevlastněná zůstane "zamčená" (appka schválně neprozradí jméno ani
// fotku dopředu, jen vzácnost -- to je součást sbírání, číslo slotu
// ale vidět je, jako u číslovaného alba samolepek).
//
// Přepompéznění 10.9.2026 (na žádost uživatele -- "ať si sednou na
// prdel", předchozí verze vypadala u běžné vzácnosti jako "prohra"):
// rámeček kolem vlastněné karty je teď kovový přechod (tři odstíny
// barvy vzácnosti, viz RARITY_RING_VARS) s trvalou barevnou září
// (box-shadow), místo plochého 2px obrysu. Fotka navíc má nekonečný
// jemný "přejezd" světla (card-shimmer, globals.css) -- kartička tak
// "září"/dýchá i v klidu, ne jen při najetí myší. Platí už i pro
// "běžnou" vzácnost, která dřív byla plochá šedá (#9ca3af) a teď je
// bronzová -- i nejnižší stupeň má vypadat jako medaile, ne jako
// vyřazení. Klik na kartičku (interaktivní "zvednutí" + vtipný popis)
// řeší zvlášť clickable-card-tile.tsx, tahle komponenta zůstává čistě
// vizuální, ať ji může dál použít i needitovatelný náhled v
// badge-center.tsx (malá kartička v gratulačním modalu).
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
  const rarity = card.rarity;
  const ringVars = RARITY_RING_VARS[rarity];

  return (
    <div
      className={`relative rounded-2xl p-[3px] transition-all duration-[var(--duration-celebration)] ${
        owned
          ? "shadow-[0_0_0_1px_rgb(0_0_0_/_0.04),0_0_24px_2px_var(--rc-glow)]"
          : "bg-border-strong"
      } ${muted ? "grayscale opacity-50" : ""} ${isNew ? "animate-[celebrate-pop_0.7s_var(--ease-bounce)]" : ""}`}
      style={
        owned
          ? ({
              ...ringVars,
              background:
                "linear-gradient(135deg, var(--rc-light), var(--rc) 45%, var(--rc-dark) 75%, var(--rc))",
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="relative flex flex-col overflow-hidden rounded-[13px] bg-surface shadow-[var(--shadow-card)]">
        {/* "Mat" kolem fotky -- dvojitý rámeček jako u vystavené trofeje. */}
        <div className="relative m-1.5 aspect-[3/4] overflow-hidden rounded-xl bg-surface-hover ring-1 ring-inset ring-black/5">
          {owned && card.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Lock className="h-6 w-6 text-faint-foreground" strokeWidth={2} />
            </div>
          )}

          {/* Záře za fotkou podle vzácnosti -- čím vzácnější, tím sytější. */}
          {owned && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(circle at 50% 28%, var(--rarity-${rarity}) 0%, transparent 72%)`,
                opacity: RARITY_GLOW_OPACITY[rarity],
              }}
            />
          )}

          {/* Nekonečný "přejezd" světla -- karta tak září/dýchá i v
              klidu, rychlost/sytost se liší podle vzácnosti. */}
          {owned && (
            <div
              className="pointer-events-none absolute -left-[60%] -top-[60%] h-[220%] w-[45%] bg-gradient-to-r from-transparent via-white/40 to-transparent"
              style={{ animation: `card-shimmer ${RARITY_SHIMMER_DURATION[rarity]} ease-in-out infinite` }}
            />
          )}

          {/* Rohové "muzejní" značky -- v barvě vzácnosti u vlastněné karty. */}
          {CORNER_MARKS.map((cls) => (
            <span
              key={cls}
              className={`pointer-events-none absolute h-3.5 w-3.5 ${cls} ${
                owned ? RARITY_BORDER_CLASSES[rarity] : "border-border-strong/70"
              }`}
            />
          ))}

          {quantity !== undefined && quantity > 1 && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
              ×{quantity}
            </span>
          )}

          {/* Číselný medailonek -- vždy X/50, i u zamčené karty (jako
              prázdný slot v albu samolepek). "Embosovaný" radiální
              gradient místo ploché barvy, ať sám o sobě vypadá jako
              ražená medaile. */}
          <span
            className={`absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface text-center text-[9px] font-extrabold leading-[1.05] text-white shadow-[0_2px_5px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.5)] ${
              owned ? "" : "bg-border-strong"
            }`}
            style={
              owned
                ? {
                    background:
                      "radial-gradient(circle at 32% 28%, var(--rc-light), var(--rc) 55%, var(--rc-dark) 100%)",
                  }
                : undefined
            }
          >
            {card.id}
            <span className="block text-[6.5px] font-bold opacity-80">/{TOTAL_PLANNED_CARDS}</span>
          </span>
        </div>

        <div className="flex flex-col items-center gap-1 px-2 pb-2.5 pt-1 text-center">
          <p className="w-full truncate text-xs font-extrabold tracking-tight">
            {owned ? card.name : "???"}
          </p>
          <div className="flex w-full items-center justify-center gap-1.5 text-faint-foreground">
            <span className="h-px w-3 shrink-0 bg-current opacity-40" />
            <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em]">
              {owned ? card.club : RARITY_LABELS[rarity]}
            </p>
            <span className="h-px w-3 shrink-0 bg-current opacity-40" />
          </div>
        </div>
      </div>
    </div>
  );
}
