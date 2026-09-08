import type { CardRarity } from "@/lib/supabase/database.types";

// Vzácnost sběratelské karty (6.9.2026) je vlastnost SAMOTNÉ karty --
// nezávislá na sportovní barvě soutěže (--accent, viz sport.ts), proto
// vlastní sada tokenů (--rarity-*, viz globals.css).

// Cílová velikost celé sbírky (50, viz docs/PROJECT.md) -- NEZÁVISLÉ na
// tom, kolik karet appka aktuálně má v katalogu (`cards` tabulka, dnes
// 10). Kartička tak vždy ukazuje "8/50", ne "8/10" -- i u zamčeného
// slotu, ať appka od začátku vypadá jako plnohodnotný číslovaný album,
// ne jako neúplný katalog.
export const TOTAL_PLANNED_CARDS = 50;

export const RARITY_LABELS: Record<CardRarity, string> = {
  common: "Běžná",
  rare: "Vzácná",
  legendary: "Legendární",
};

export const RARITY_ORDER: Record<CardRarity, number> = {
  common: 0,
  rare: 1,
  legendary: 2,
};

export const RARITY_BORDER_CLASSES: Record<CardRarity, string> = {
  common: "border-rarity-common",
  rare: "border-rarity-rare",
  legendary: "border-rarity-legendary",
};

export const RARITY_TEXT_CLASSES: Record<CardRarity, string> = {
  common: "text-rarity-common",
  rare: "text-rarity-rare",
  legendary: "text-rarity-legendary",
};

export const RARITY_BG_CLASSES: Record<CardRarity, string> = {
  common: "bg-rarity-common",
  rare: "bg-rarity-rare",
  legendary: "bg-rarity-legendary",
};

// Sytost záře za fotkou podle vzácnosti -- čím vzácnější karta, tím
// víc "září" (viz card-tile.tsx), jemný signál hodnoty i bez čtení textu.
export const RARITY_GLOW_OPACITY: Record<CardRarity, number> = {
  common: 0.12,
  rare: 0.22,
  legendary: 0.4,
};
