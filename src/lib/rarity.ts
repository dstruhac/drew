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

// Sytost záře za fotkou podle vzácnosti -- čím vzácnější karta, tím
// víc "září" (viz card-tile.tsx), jemný signál hodnoty i bez čtení textu.
export const RARITY_GLOW_OPACITY: Record<CardRarity, number> = {
  common: 0.22,
  rare: 0.3,
  legendary: 0.46,
};

// Rychlost nekonečného "přejezdu" světla přes fotku (card-shimmer,
// viz globals.css) -- vzácnější karta se "třpytí" rychleji a
// výrazněji, ale i běžná musí pořád vypadat jako medaile, ne jako
// vyřazení (10.9.2026, na žádost uživatele -- dřív byla plochá šedá).
export const RARITY_SHIMMER_DURATION: Record<CardRarity, string> = {
  common: "4.6s",
  rare: "3.8s",
  legendary: "3.1s",
};

// Světlejší/tmavší odstín + barva záře pro kovový přechodový rámeček
// a podsvícení kartičky (--rarity-*-light/-dark/-glow v globals.css) --
// Tailwind neumí přechod tří vlastních barev jako utility třídu, takže
// se tyhle hodnoty čtou přímo jako CSS proměnné z inline stylu
// (card-tile.tsx/clickable-card-tile.tsx), ne přes @theme.
export const RARITY_RING_VARS: Record<CardRarity, Record<string, string>> = {
  common: {
    "--rc": "var(--rarity-common)",
    "--rc-light": "var(--rarity-common-light)",
    "--rc-dark": "var(--rarity-common-dark)",
    "--rc-glow": "var(--rarity-common-glow)",
  },
  rare: {
    "--rc": "var(--rarity-rare)",
    "--rc-light": "var(--rarity-rare-light)",
    "--rc-dark": "var(--rarity-rare-dark)",
    "--rc-glow": "var(--rarity-rare-glow)",
  },
  legendary: {
    "--rc": "var(--rarity-legendary)",
    "--rc-light": "var(--rarity-legendary-light)",
    "--rc-dark": "var(--rarity-legendary-dark)",
    "--rc-glow": "var(--rarity-legendary-glow)",
  },
};

// Rarity label jako "pilulka" v detailním modalu (clickable-card-tile.tsx)
// -- tlumená varianta barvy vzácnosti na tmavém pozadí modalu.
export const RARITY_PILL_CLASSES: Record<CardRarity, string> = {
  common: "bg-rarity-common/25 text-[#f3c28f]",
  rare: "bg-rarity-rare/25 text-[#bcd4ff]",
  legendary: "bg-rarity-legendary/25 text-[#ffe9ae]",
};

// Vtipné hlášky při kliknutí na ještě nezískanou (zamčenou) kartičku
// -- appka nikdy neprozradí jméno/fotku dopředu, to je součást chtěné
// emoce "musím si tuhle ještě vysloužit" (10.9.2026, na žádost uživatele).
export const LOCKED_CARD_TAUNTS: readonly string[] = [
  "Tahle na tebe ještě čeká. Vyhraj týden a uvidíš víc.",
  "Ne tak rychle — tahle je pořád tajemství.",
  "Ještě se neznáme. Zasluž si mě.",
];
