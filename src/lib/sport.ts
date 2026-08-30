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
