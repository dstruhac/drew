import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type MatchForLogos = {
  id: string;
  competition_id: string;
  home_team: string;
  away_team: string;
  source_match_id: string | null;
};

export type MatchLogos = { home?: string; away?: string };

// Sdíleno mezi /spaces/[id], /spaces/[id]/matches/[matchId] a
// Dashboardem (17.9.2026, na žádost uživatele "šlo by to sjednotit?").
// Dřív si každá z těch tří stránek zvlášť tahala `team_logos` podle
// competition_id AKTUÁLNÍ soutěže -- u hecovaček appka ale zápasy jen
// KOPÍRUJE ze zdrojové soutěže (viz `matches.source_match_id`), takže
// hecovačka měla vlastní competition_id, pod kterým žádná loga nikdy
// nebyla naimportovaná -- appka je proto u zápasů v hecovačkách nikdy
// nenašla.
//
// Oprava NENÍ prosté sloučení `team_logos` napříč VŠEMI soutěžemi podle
// jména týmu -- ověřeno na reálných datech (17.9.2026, db-probe.yml),
// že se jméno týmu dokáže shodovat napříč dvěma různými kluby s různým
// znakem (např. "Sparta Praha" je ve `team_logos` jednou jako fotbalový
// znak, podruhé jako hokejový -- appka sleduje oba sporty). Prosté
// sloučení by tak u zápasu z jedné soutěže mohlo omylem vykreslit znak
// z úplně jiného sportu.
//
// Appka proto pro každý zápas se `source_match_id` nejdřív dohledá
// competition_id PŮVODNÍHO zápasu (odkud appka skóre/stav kopíruje) a
// loga hledá přesně tam -- ne v competition_id hecovačky. U běžných
// (nezkopírovaných) zápasů se nic nemění, loga se hledají jako dřív
// pod jejich vlastní soutěží.
export async function buildMatchLogos(
  supabase: SupabaseClient<Database>,
  matches: MatchForLogos[],
): Promise<Map<string, MatchLogos>> {
  const sourceMatchIds = [
    ...new Set(matches.map((m) => m.source_match_id).filter((v): v is string => Boolean(v))),
  ];

  const sourceCompetitionByMatchId = new Map<string, string>();
  if (sourceMatchIds.length > 0) {
    const { data } = await supabase
      .from("matches")
      .select("id, competition_id")
      .in("id", sourceMatchIds);
    for (const row of data ?? []) {
      sourceCompetitionByMatchId.set(row.id, row.competition_id);
    }
  }

  const effectiveCompetitionByMatchId = new Map<string, string>();
  for (const match of matches) {
    const sourceCompetitionId = match.source_match_id
      ? sourceCompetitionByMatchId.get(match.source_match_id)
      : undefined;
    effectiveCompetitionByMatchId.set(match.id, sourceCompetitionId ?? match.competition_id);
  }

  const competitionIds = [...new Set(effectiveCompetitionByMatchId.values())];
  const { data: logos } =
    competitionIds.length > 0
      ? await supabase
          .from("team_logos")
          .select("competition_id, team_name, logo_url")
          .in("competition_id", competitionIds)
      : { data: [] };

  const logoByCompetitionAndTeam = new Map<string, string>();
  for (const row of logos ?? []) {
    logoByCompetitionAndTeam.set(`${row.competition_id}::${row.team_name}`, row.logo_url);
  }

  const result = new Map<string, MatchLogos>();
  for (const match of matches) {
    const competitionId = effectiveCompetitionByMatchId.get(match.id);
    if (!competitionId) continue;
    result.set(match.id, {
      home: logoByCompetitionAndTeam.get(`${competitionId}::${match.home_team}`),
      away: logoByCompetitionAndTeam.get(`${competitionId}::${match.away_team}`),
    });
  }
  return result;
}
