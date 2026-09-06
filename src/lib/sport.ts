import type { CSSProperties } from "react";
import type { CompetitionSport, Sport } from "@/lib/supabase/database.types";

// SpotlightMatchCard/PredictionForm potřebují vždycky konkrétní sport
// ("hockey" | "football"), nikdy "mixed" -- u "Náhodné ligy" ho ale
// vždycky přebije vlastní sport zápasu (matches.sport), takže tahle
// hodnota je jen defenzivní placeholder, co se v praxi nikdy nepoužije.
export function competitionFallbackSport(
  sport: CompetitionSport | undefined | null,
): Sport {
  return sport === "hockey" || sport === "football" ? sport : "football";
}

// Sportovní "vibe" (6.9.2026, odsouhlaseno s uživatelem přes
// AskUserQuestion): fotbalové soutěže/zápasy zůstávají ve výchozí
// (zelené) --accent appky, hokejové dostanou modrou. "Náhodná liga"
// (sport "mixed") zůstává neutrální na úrovni SOUTĚŽE (karta, tlačítka
// Chci hrát/upozornění), ale jednotlivé ZÁPASY uvnitř mají svůj vlastní
// sport (match.sport), takže při zavolání na úrovni zápasu se i tam
// správně obarví.
//
// Mechanismus: přepíše se --accent na nejbližším obalujícím elementu.
// Díky dědění CSS proměnných to automaticky obarví všechno uvnitř, co
// používá Tailwind třídy jako bg-accent/text-accent/border-accent/
// ring-accent -- bez nutnosti měnit kód jednotlivých komponent. Barva
// podle úspěšnosti tipu (zelená/žlutá/šedá, `--success`/`--warning`) je
// záměrně nezávislý systém a tímhle se nemění.
export function sportAccentStyle(
  sport: CompetitionSport | Sport | null | undefined,
): CSSProperties | undefined {
  if (sport === "hockey") {
    return { "--accent": "var(--accent-hockey)" } as CSSProperties;
  }
  return undefined;
}
