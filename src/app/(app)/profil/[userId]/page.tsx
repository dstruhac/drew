import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Sport } from "@/lib/supabase/database.types";

const SPORT_LABELS: Record<Sport, string> = {
  hockey: "Hokej",
  football: "Fotbal",
};

// Veřejný profil hráče (odsouhlaseno s uživatelem 28.8.2026): kdokoliv
// přihlášený si může prokliknout cizí profil (např. ze žebříčku) a
// vidět, které soutěže hraje a jak si v nich vede. Konzistentní
// s tím, jak appka funguje už dnes -- cizí tipy se taky zveřejní po
// výkopu (RLS `predictions_select_own_or_locked`), appka je pro
// uzavřenou partu kamarádů, ne pro cizí lidi.
//
// Odlišné od /profil (vlastní nastavení -- úprava přezdívky): tahle
// stránka je čistě zobrazovací, i pro vlastní profil.
export default async function PublicProfilePage({
  params,
}: PageProps<"/profil/[userId]">) {
  const { userId } = await params;
  const supabase = await createClient();

  // Čtyři nezávislé dotazy v jedné vlně -- žádný nepotřebuje výsledek
  // jiného, všechny filtrují rovnou podle `userId` z route parametru.
  const [
    currentUser,
    { data: profile },
    { data: participations },
    { data: badges },
  ] = await Promise.all([
    getCurrentUser(),
    supabase.from("profiles").select("display_name, avatar_url").eq("id", userId).single(),
    supabase
      .from("competition_participants")
      .select("competition_id, competitions(id, name, sport, logo_url)")
      .eq("user_id", userId),
    supabase.from("weekly_badges").select("competition_id").eq("user_id", userId),
  ]);

  if (!profile) {
    notFound();
  }

  const isOwnProfile = currentUser?.id === userId;
  const badgeCountByCompetition = new Map<string, number>();
  for (const badge of badges ?? []) {
    badgeCountByCompetition.set(
      badge.competition_id,
      (badgeCountByCompetition.get(badge.competition_id) ?? 0) + 1,
    );
  }

  const competitionIds = (participations ?? [])
    .map((p) => p.competitions?.id)
    .filter((id): id is string => Boolean(id));

  // Druhá vlna závisí na tom, které soutěže hráč vůbec hraje (výsledek
  // první vlny) -- proto dvě vlny, ne jedna. Potřebujeme VŠECHNY
  // účastníky a VŠECHNY tipy v těch soutěžích (ne jen tohohle hráče),
  // abychom spočítali jeho pozici v žebříčku stejně jako na
  // /spaces/[id]/leaderboard.
  const [{ data: allParticipants }, { data: allPredictions }] =
    competitionIds.length
      ? await Promise.all([
          supabase
            .from("competition_participants")
            .select("user_id, competition_id")
            .in("competition_id", competitionIds),
          supabase
            .from("predictions")
            .select(
              "user_id, points, predicted_home_score, predicted_away_score, matches!inner(competition_id, home_score, away_score)",
            )
            .in("matches.competition_id", competitionIds),
        ])
      : [{ data: [] }, { data: [] }];

  type Totals = {
    totalPoints: number;
    scoredCount: number;
    predictionCount: number;
    exactCount: number;
  };

  const totalsByCompetitionAndUser = new Map<string, Map<string, Totals>>();
  const emptyTotals = (): Totals => ({
    totalPoints: 0,
    scoredCount: 0,
    predictionCount: 0,
    exactCount: 0,
  });

  for (const participant of allParticipants ?? []) {
    const byUser =
      totalsByCompetitionAndUser.get(participant.competition_id) ?? new Map();
    if (!byUser.has(participant.user_id)) {
      byUser.set(participant.user_id, emptyTotals());
    }
    totalsByCompetitionAndUser.set(participant.competition_id, byUser);
  }

  for (const prediction of allPredictions ?? []) {
    const competitionId = prediction.matches?.competition_id;
    if (!competitionId) continue;
    const byUser =
      totalsByCompetitionAndUser.get(competitionId) ?? new Map();
    const totals = byUser.get(prediction.user_id) ?? emptyTotals();

    totals.predictionCount += 1;
    if (prediction.points !== null) {
      totals.totalPoints += prediction.points;
      totals.scoredCount += 1;
    }
    if (
      prediction.matches?.home_score !== null &&
      prediction.matches?.home_score !== undefined &&
      prediction.matches?.away_score !== null &&
      prediction.matches?.away_score !== undefined &&
      prediction.predicted_home_score === prediction.matches.home_score &&
      prediction.predicted_away_score === prediction.matches.away_score
    ) {
      totals.exactCount += 1;
    }

    byUser.set(prediction.user_id, totals);
    totalsByCompetitionAndUser.set(competitionId, byUser);
  }

  const rows = (participations ?? [])
    .map((p) => p.competitions)
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((competition) => {
      const byUser = totalsByCompetitionAndUser.get(competition.id) ?? new Map();
      const standings = [...byUser.entries()].sort(
        (a, b) => b[1].totalPoints - a[1].totalPoints,
      );
      return { competition, standings };
    });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <Link
          href="/spaces"
          className="text-xs text-black/40 dark:text-white/40 transition-colors hover:text-black/70 hover:underline dark:hover:text-white/70"
        >
          ← Soutěže
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-black/10 dark:border-white/15">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-black/5 text-lg font-medium dark:bg-white/10">
                {profile.display_name.trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{profile.display_name}</h1>
            {isOwnProfile && (
              <Link
                href="/profil"
                className="text-xs text-black/40 underline underline-offset-2 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
              >
                Upravit profil
              </Link>
            )}
          </div>
        </div>
      </header>

      {rows.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          {isOwnProfile
            ? "Zatím nehraješ žádnou soutěž. Přihlas se do některé na přehledu soutěží."
            : "Tenhle hráč zatím nehraje žádnou soutěž."}
        </p>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map(({ competition, standings }) => {
            const rankIndex = standings.findIndex(([uid]) => uid === userId);
            const totals = rankIndex !== -1 ? standings[rankIndex][1] : emptyTotals();
            const badgeCount = badgeCountByCompetition.get(competition.id) ?? 0;

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

                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-black/40 dark:text-white/40">
                      {rankIndex !== -1 ? (
                        <>
                          🏆 {rankIndex + 1}. místo z {standings.length}
                        </>
                      ) : (
                        "Zatím bez pozice v žebříčku"
                      )}
                      {badgeCount > 0 && (
                        <span title={`${badgeCount}× vítěz týdne`}>
                          {" · "}🏅 {badgeCount}
                        </span>
                      )}
                    </p>
                    <div className="text-right">
                      <span className="font-semibold">{totals.totalPoints} b.</span>
                      <p className="text-xs text-black/40 dark:text-white/40">
                        {totals.scoredCount} z {totals.predictionCount} zápasů
                        {" · "}
                        {totals.exactCount}× přesně
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
