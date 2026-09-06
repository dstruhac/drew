import type { CardRarity } from "@/lib/supabase/database.types";

// Vzácnost sběratelské karty (6.9.2026) je vlastnost SAMOTNÉ karty --
// nezávislá na sportovní barvě soutěže (--accent, viz sport.ts), proto
// vlastní sada tokenů (--rarity-*, viz globals.css).
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
