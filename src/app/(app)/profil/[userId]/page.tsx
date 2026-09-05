import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Trophy, Medal } from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { CompetitionSport } from "@/lib/supabase/database.types";

const SPORT_LABELS: Record<CompetitionSport, string> = {
  hockey: "Hokej",
  football: "Fotbal",
  mixed: "Mix",
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 sm:max-w-3xl sm:px-10">
      <header>
        <Link
          href="/spaces"
          className="inline-flex items-center gap-1 text-xs font-bold text-faint-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
          Soutěže
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border-subtle">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-surface-hover text-lg font-bold text-muted-foreground">
                {profile.display_name.trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{profile.display_name}</h1>
            {isOwnProfile && (
              <Link href="/profil" className="text-xs font-bold text-accent hover:underline">
                Upravit profil
              </Link>
            )}
          </div>
        </div>
      </header>

      {rows.length === 0 && (
        <p className="text-sm font-medium text-muted-foreground">
          {isOwnProfile
            ? "Zatím nehraješ žádnou soutěž. Přihlas se do některé na přehledu soutěží."
            : "Tenhle hráč zatím nehraje žádnou soutěž."}
        </p>
      )}

      {rows.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map(({ competition, standings }) => {
            const rankIndex = standings.findIndex(([uid]) => uid === userId);
            const totals = rankIndex !== -1 ? standings[rankIndex][1] : emptyTotals();
            const badgeCount = badgeCountByCompetition.get(competition.id) ?? 0;

            return (
              <li key={competition.id}>
                <Link
                  href={`/spaces/${competition.id}`}
                  className="card-lift flex h-full flex-col gap-3 rounded-[22px] border border-border-subtle bg-surface p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-bold">
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
                    <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {SPORT_LABELS[competition.sport]}
                    </span>
                  </div>

                  <div className="flex flex-1 items-end justify-between gap-2">
                    <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      {rankIndex !== -1 ? (
                        <span className="flex items-center gap-1">
                          <Trophy className="h-3.5 w-3.5" strokeWidth={2.2} />
                          {rankIndex + 1}. místo z {standings.length}
                        </span>
                      ) : (
                        "Zatím bez pozice v žebříčku"
                      )}
                      {badgeCount > 0 && (
                        <span
                          title={`${badgeCount}× vítěz týdne`}
                          className="flex items-center gap-1 text-accent"
                        >
                          <Medal className="h-3.5 w-3.5" strokeWidth={2.2} />
                          {badgeCount}
                        </span>
                      )}
                    </p>
                    <div className="shrink-0 text-right">
                      <span className="font-extrabold">{totals.totalPoints} b.</span>
                      <p className="text-xs font-semibold text-faint-foreground">
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
