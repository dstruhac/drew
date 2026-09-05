import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { CompetitionCard } from "@/components/competition-card";
import { SpotlightMatchCard } from "@/components/spotlight-match-card";
import { BadgeCenter } from "@/components/badge-center";
import { competitionFallbackSport } from "@/lib/sport";
import { throwIfSupabaseError } from "@/lib/supabase/errors";

// Vstupní stránka appky po přihlášení (nahrazuje dřívější /spaces,
// odsouhlaseno s uživatelem 29.8.2026 přes AskUserQuestion). Tři
// sekce: vysvícený nejbližší netipovaný zápas napříč VŠEMI soutěžemi
// hráče (ne jen jednou jako na /spaces/[id]), soutěže, které hráč
// hraje (jen ty, kde je competition_participants -- ne všechny
// soutěže v appce jako dřív), a sbírka medailí za vítězství týdne
// napříč soutěžemi. /spaces (přehled/prokliknutí VŠECH soutěží)
// zůstává dostupné přes odkaz níže.
export default async function DashboardPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();

  // Nejdřív zjistit, které soutěže hráč hraje -- zbytek dotazů na tom
  // závisí (filtrují se podle nich). getCurrentUser() není síťový
  // dotaz (viz komentář u něj v server.ts), takže tahle závislost nic
  // nestojí navíc.
  const { data: participantRows, error: participantRowsError } = await supabase
    .from("competition_participants")
    .select(
      "competitions(id, name, sport, logo_url, points_exact, points_winner, points_total_goals)",
    )
    .eq("user_id", user?.id ?? "");

  throwIfSupabaseError(participantRowsError, "Načtení hráčových soutěží");

  const myCompetitions = (participantRows ?? [])
    .map((row) => row.competitions)
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const competitionIds = myCompetitions.map((c) => c.id);
  const sportByCompetition = new Map(myCompetitions.map((c) => [c.id, c.sport]));

  const [
    allParticipantsResult,
    predictionsResult,
    upcomingMatchesResult,
    teamLogosResult,
    weeklyBadgesResult,
    profileResult,
  ] = await Promise.all([
    competitionIds.length
      ? supabase
          .from("competition_participants")
          .select("competition_id, user_id, profiles(display_name)")
          .in("competition_id", competitionIds)
      : Promise.resolve({ data: [], error: null }),
    competitionIds.length
      ? supabase
          .from("predictions")
          .select("match_id, user_id, points, matches!inner(competition_id)")
          .in("matches.competition_id", competitionIds)
      : Promise.resolve({ data: [], error: null }),
    competitionIds.length
      ? supabase
          .from("matches")
          .select(
            "id, competition_id, home_team, away_team, kickoff_at, status, home_score, away_score, sport",
          )
          .in("competition_id", competitionIds)
          .eq("status", "scheduled")
          .gt("kickoff_at", new Date().toISOString())
          .order("kickoff_at", { ascending: true })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    competitionIds.length
      ? supabase
          .from("team_logos")
          .select("competition_id, team_name, logo_url")
          .in("competition_id", competitionIds)
      : Promise.resolve({ data: [], error: null }),
    // Bez filtru na user_id -- BadgeCenter potřebuje vidět i cizí
    // medaile v soutěžích, které hráč hraje, aby ho o nich mohl
    // informovat (viz níže myBadges/othersNewBadges).
    competitionIds.length
      ? supabase
          .from("weekly_badges")
          .select("competition_id, week_start, user_id, points, competitions(name), profiles(display_name)")
          .in("competition_id", competitionIds)
          .order("week_start", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("profiles")
      .select("badges_seen_through")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
  ]);

  throwIfSupabaseError(allParticipantsResult.error ?? null, "Načtení účastníků soutěží");
  throwIfSupabaseError(predictionsResult.error ?? null, "Načtení tipů");
  throwIfSupabaseError(upcomingMatchesResult.error ?? null, "Načtení nadcházejících zápasů");
  throwIfSupabaseError(teamLogosResult.error ?? null, "Načtení log týmů");
  throwIfSupabaseError(weeklyBadgesResult.error ?? null, "Načtení medailí");
  throwIfSupabaseError(profileResult.error ?? null, "Načtení profilu");

  const allParticipants = allParticipantsResult.data;
  const predictions = predictionsResult.data;
  const upcomingMatches = upcomingMatchesResult.data;
  const teamLogos = teamLogosResult.data;
  const weeklyBadges = weeklyBadgesResult.data;
  const profileRow = profileResult.data;

  // Vysvícený zápas: chronologicky nejbližší (matches jsou už seřazené
  // vzestupně z dotazu výše) zápas napříč soutěžemi hráče, který ještě
  // nemá tip -- stejná technika jako "Ještě netipováno" na
  // /spaces/[id], jen napříč soutěžemi místo v jedné.
  const ownPredictedMatchIds = new Set(
    (predictions ?? [])
      .filter((p) => p.user_id === user?.id)
      .map((p) => p.match_id),
  );
  const spotlightMatch =
    (upcomingMatches ?? []).find((m) => !ownPredictedMatchIds.has(m.id)) ?? null;

  const spotlightLogoMap = new Map(
    (teamLogos ?? [])
      .filter((t) => t.competition_id === spotlightMatch?.competition_id)
      .map((t) => [t.team_name, t.logo_url]),
  );

  // Pozice v žebříčku za soutěž -- stejný výpočet jako na /spaces,
  // jen nad menší množinou (jen soutěže, kde hráč skutečně je).
  const standingsByCompetition = new Map<
    string,
    { userId: string; displayName: string; totalPoints: number }[]
  >();
  for (const participant of allParticipants ?? []) {
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

  // Medaile za vítězství týdne: myBadges je celá historie vlastních
  // medailí (Sbírka artefaktů), myNewBadges/othersNewBadges jsou jen
  // ty udělené PO badges_seen_through -- to řídí, jestli BadgeCenter
  // zobrazí gratulační modal (vyhrál jsem), informační banner (vyhrál
  // někdo jiný), nebo nic (nulový týden / appka to hráč viděl).
  const allBadges = weeklyBadges ?? [];
  const myBadges = allBadges.filter((b) => b.user_id === user?.id);
  const seenThrough = profileRow?.badges_seen_through ?? null;
  const newBadges = seenThrough
    ? allBadges.filter((b) => b.week_start > seenThrough)
    : allBadges;
  const myNewBadges = newBadges.filter((b) => b.user_id === user?.id);
  const othersNewBadges = newBadges.filter((b) => b.user_id !== user?.id);
  // newBadges je seřazené sestupně (viz dotaz výše), takže první
  // položka nese nejnovější week_start -- přesně po tenhle týden se
  // má watermark posunout, až hráč modal/banner zavře.
  const markSeenThrough = newBadges.length > 0 ? newBadges[0].week_start : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:max-w-5xl sm:px-10">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">Dashboard</h1>
      </header>

      <BadgeCenter
        myBadges={myBadges}
        myNewBadges={myNewBadges}
        othersNewBadges={othersNewBadges}
        markSeenThrough={markSeenThrough}
      >
        <section className="flex flex-col gap-3">
          {spotlightMatch ? (
            <SpotlightMatchCard
              match={spotlightMatch}
              isJoined={true}
              sport={competitionFallbackSport(sportByCompetition.get(spotlightMatch.competition_id))}
              competitionId={spotlightMatch.competition_id}
              logoUrlByTeam={spotlightLogoMap}
            />
          ) : myCompetitions.length > 0 ? (
            <p className="rounded-2xl border border-border-subtle bg-surface-hover px-4 py-3 text-sm font-medium">
              ✅ Máš vyplněné tipy na všechno, co se blíží.
            </p>
          ) : (
            <p className="rounded-2xl border border-border-subtle bg-surface-hover px-4 py-3 text-sm font-medium">
              👋 Zatím nehraješ žádnou soutěž. Mrkni na{" "}
              <Link
                href="/spaces"
                className="font-bold text-accent underline underline-offset-2"
              >
                Všechny soutěže
              </Link>{" "}
              a přidej se.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-muted-foreground">
              Tvoje soutěže
            </h2>
            <Link
              href="/spaces"
              className="text-xs font-bold text-accent hover:underline"
            >
              Procházet všechny soutěže →
            </Link>
          </div>

          {myCompetitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Zatím žádná -- vyber si soutěž v seznamu výše.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {myCompetitions.map((competition) => (
                <li key={competition.id}>
                  <CompetitionCard
                    competition={competition}
                    rank={rankByCompetition.get(competition.id) ?? null}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </BadgeCenter>
    </main>
  );
}
