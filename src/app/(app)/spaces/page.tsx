import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { CompetitionCard } from "@/components/competition-card";

export default async function SpacesPage() {
  const supabase = await createClient();

  // user a competitions na sobě nezávisí -- souběžné dotazy místo
  // sekvenčních čekání, ať appka nesčítá zbytečné síťové round-tripy do
  // Supabase (perf review 27.8.2026).
  const [user, { data: competitions, error }] = await Promise.all([
    getCurrentUser(),
    supabase
      .from("competitions")
      .select("id, name, sport, status, points_exact, points_winner, points_total_goals, logo_url")
      .order("created_at", { ascending: false }),
  ]);

  const competitionIds = competitions?.map((c) => c.id) ?? [];

  // Stejný výpočet jako na /spaces/[id]/leaderboard, jen hromadně přes
  // všechny soutěže najednou (ne dotaz po dotazu) -- viz vlastní pozice
  // v žebříčku u každé karty níže.
  //
  // Tipy se dřív načítaly až ve třetí vlně (filtrovaly se seznamem ID
  // zápasů z druhé vlny) a kvůli tomu se musely nejdřív načíst všechny
  // zápasy jen proto, aby se zjistilo, do které soutěže tip patří. Teď
  // si tip tuhle informaci nese s sebou z napojené tabulky zápasů, takže
  // vlna i celý dotaz na zápasy odpadly (perf analýza 28.8.2026).
  const [{ data: participants }, { data: predictions }] = await Promise.all([
    competitionIds.length
      ? supabase
          .from("competition_participants")
          .select("competition_id, user_id, profiles(display_name)")
          .in("competition_id", competitionIds)
      : Promise.resolve({ data: [] }),
    competitionIds.length
      ? supabase
          .from("predictions")
          .select("user_id, points, matches!inner(competition_id)")
          .in("matches.competition_id", competitionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const standingsByCompetition = new Map<
    string,
    { userId: string; displayName: string; totalPoints: number }[]
  >();

  for (const participant of participants ?? []) {
    const list = standingsByCompetition.get(participant.competition_id) ?? [];
    list.push({
      userId: participant.user_id,
      displayName: participant.profiles?.display_name ?? "Neznámý hráč",
      totalPoints: 0,
    });
    standingsByCompetition.set(participant.competition_id, list);
  }

  for (const prediction of predictions ?? []) {
    if (prediction.points === null) continue;
    const competitionId = prediction.matches?.competition_id;
    if (!competitionId) continue;
    const entry = standingsByCompetition
      .get(competitionId)
      ?.find((e) => e.userId === prediction.user_id);
    if (entry) entry.totalPoints += prediction.points;
  }

  const rankByCompetition = new Map<string, { rank: number; total: number }>();
  for (const [competitionId, standings] of standingsByCompetition) {
    standings.sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        a.displayName.localeCompare(b.displayName, "cs"),
    );
    const index = standings.findIndex((e) => e.userId === user?.id);
    if (index !== -1) {
      rankByCompetition.set(competitionId, {
        rank: index + 1,
        total: standings.length,
      });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 sm:max-w-5xl sm:px-10">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Všechny soutěže</h1>
      </header>

      {error && (
        <p className="text-sm text-danger">
          Soutěže se nepodařilo načíst: {error.message}
        </p>
      )}

      {!error && competitions?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Zatím žádná soutěž nebyla založena.
        </p>
      )}

      {competitions && competitions.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitions.map((competition) => (
            <li key={competition.id}>
              <CompetitionCard
                competition={competition}
                rank={rankByCompetition.get(competition.id) ?? null}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
