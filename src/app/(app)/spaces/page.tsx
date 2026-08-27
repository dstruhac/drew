import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Sport } from "@/lib/supabase/database.types";

const SPORT_LABELS: Record<Sport, string> = {
  hockey: "Hokej",
  football: "Fotbal",
};

export default async function SpacesPage() {
  const supabase = await createClient();

  // user a competitions na sobě nezávisí, stejně tak participants a matches
  // (obě jen filtrují podle competitionIds) -- souběžné dotazy místo
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
  const [{ data: participants }, { data: matches }] = await Promise.all([
    competitionIds.length
      ? supabase
          .from("competition_participants")
          .select("competition_id, user_id, profiles(display_name)")
          .in("competition_id", competitionIds)
      : Promise.resolve({ data: [] }),
    competitionIds.length
      ? supabase.from("matches").select("id, competition_id").in("competition_id", competitionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const competitionIdByMatchId = new Map(
    matches?.map((m) => [m.id, m.competition_id]),
  );
  const matchIds = matches?.map((m) => m.id) ?? [];

  const { data: predictions } = matchIds.length
    ? await supabase
        .from("predictions")
        .select("user_id, points, match_id")
        .in("match_id", matchIds)
    : { data: [] };

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
    const competitionId = competitionIdByMatchId.get(prediction.match_id);
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-xl font-semibold">Soutěže</h1>
      </header>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Soutěže se nepodařilo načíst: {error.message}
        </p>
      )}

      {!error && competitions?.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Zatím žádná soutěž nebyla založena.
        </p>
      )}

      {competitions && competitions.length > 0 && (
        <ul className="flex flex-col gap-3">
          {competitions.map((competition) => {
            const rank = rankByCompetition.get(competition.id);
            return (
              <li key={competition.id}>
                <Link
                  href={`/spaces/${competition.id}`}
                  className="card-lift block rounded-lg border border-black/10 dark:border-white/15 p-4 hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 font-medium">
                      {competition.logo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={competition.logo_url}
                          alt=""
                          className="h-6 w-6 rounded bg-white object-contain p-0.5"
                        />
                      )}
                      {competition.name}
                    </span>
                    <span className="text-xs rounded-full border border-black/10 dark:border-white/15 px-2 py-0.5 text-black/60 dark:text-white/60">
                      {SPORT_LABELS[competition.sport]}
                    </span>
                  </div>
                  {rank && (
                    <p className="mt-1 text-xs font-medium text-black/70 dark:text-white/70">
                      🏆 Tvoje pozice: {rank.rank}. místo z {rank.total}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                    Body za přesný tip {competition.points_exact} · za vítěze{" "}
                    {competition.points_winner} · za góly celkem{" "}
                    {competition.points_total_goals}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
