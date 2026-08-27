import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { ExpandableList } from "@/components/expandable-list";
import { PredictionForm } from "./prediction-form";
import { joinCompetition, leaveCompetition } from "./actions";

const SPORT_LABELS = { hockey: "Hokej", football: "Fotbal" } as const;

// Výchozí počet zobrazených zápasů, než se musí kliknout na "Zobrazit
// všechny" (odsouhlaseno s uživatelem 27.8.2026, počet nadcházejících
// upraven na 8 dne 27.8.2026 -- původní okno 7 dní uměl zobrazit i přes 10
// zápasů najednou, což bylo moc).
const PAST_VISIBLE_COUNT = 5;
const UPCOMING_VISIBLE_COUNT = 8;

export default async function CompetitionDetailPage({
  params,
}: PageProps<"/spaces/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  // Pět nezávislých dotazů najednou -- žádný z nich nepotřebuje výsledek
  // dalšího (competition/participants/matches/team_logos filtrují rovnou
  // podle `id` z route parametru, ne podle competition.id z předchozího
  // dotazu), takže souběžně ušetří tolik síťových cest, kolik jich je
  // (perf review 27.8.2026).
  const [
    user,
    { data: competition },
    { data: participants },
    { data: matches },
    { data: teamLogos },
  ] = await Promise.all([
    getCurrentUser(),
    supabase.from("competitions").select("id, name, sport, logo_url").eq("id", id).single(),
    supabase
      .from("competition_participants")
      .select("user_id, profiles(display_name)")
      .eq("competition_id", id),
    supabase
      .from("matches")
      .select(
        "id, home_team, away_team, kickoff_at, status, home_score, away_score",
      )
      .eq("competition_id", id)
      .order("kickoff_at", { ascending: true }),
    supabase.from("team_logos").select("team_name, logo_url").eq("competition_id", id),
  ]);

  if (!competition) {
    notFound();
  }

  const logoUrlByTeam = new Map(teamLogos?.map((t) => [t.team_name, t.logo_url]));

  const isJoined = participants?.some((p) => p.user_id === user?.id) ?? false;

  const matchIds = matches?.map((m) => m.id) ?? [];
  const { data: predictions } = matchIds.length
    ? await supabase
        .from("predictions")
        .select(
          "match_id, user_id, predicted_home_score, predicted_away_score, predicted_overtime_flag, points",
        )
        .in("match_id", matchIds)
    : { data: [] };

  const ownPredictionByMatch = new Map(
    predictions
      ?.filter((p) => p.user_id === user?.id)
      .map((p) => [p.match_id, p]),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <Link
          href="/spaces"
          className="text-xs text-black/40 dark:text-white/40 transition-colors hover:text-black/70 hover:underline dark:hover:text-white/70"
        >
          ← Soutěže
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {competition.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={competition.logo_url}
                alt=""
                className="h-8 w-8 rounded bg-white object-contain p-1"
              />
            )}
            {competition.name}
          </h1>
          <span className="text-xs rounded-full border border-black/10 dark:border-white/15 px-2 py-0.5 text-black/60 dark:text-white/60">
            {SPORT_LABELS[competition.sport]}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href={`/spaces/${competition.id}/leaderboard`}
            className="btn-press inline-block rounded-lg border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10"
          >
            Žebříček →
          </Link>

          <span className="text-xs text-black/40 dark:text-white/40">
            {participants?.length ?? 0} hráč
            {(participants?.length ?? 0) === 1 ? "" : "ů"} v soutěži
          </span>

          {isJoined ? (
            <form action={leaveCompetition.bind(null, competition.id)}>
              <button
                type="submit"
                className="btn-press rounded-lg border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm font-medium text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10"
              >
                Opustit soutěž
              </button>
            </form>
          ) : (
            <form action={joinCompetition.bind(null, competition.id)}>
              <button
                type="submit"
                className="btn-press rounded-lg bg-black dark:bg-white px-3 py-1.5 text-sm font-medium text-white dark:text-black hover:opacity-90"
              >
                Chci hrát
              </button>
            </form>
          )}
        </div>
      </header>

      {!isJoined && (
        <div className="rounded-lg border border-black/10 dark:border-white/15 bg-black/5 dark:bg-white/5 px-4 py-3 text-sm">
          👋 Ještě nehraješ tuhle soutěž. Klikni na „Chci hrát“ výše a začni
          tipovat zápasy!
        </div>
      )}

      {!matches?.length && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Zatím tu nejsou žádné zápasy.
        </p>
      )}

      {(() => {
        const upcoming: Match[] = [];
        const past: Match[] = [];
        for (const match of matches ?? []) {
          const isLocked =
            match.status !== "scheduled" ||
            new Date(match.kickoff_at) <= new Date();
          (isLocked ? past : upcoming).push(match);
        }
        // Nejbližší zápas nahoře v obou sekcích: nadcházející vzestupně
        // (jak přišly z DB), proběhlé sestupně (nejnovější výsledek první).
        past.reverse();

        return (
          <>
            {upcoming.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">
                  Nadcházející
                </h2>
                <ExpandableList
                  initialCount={UPCOMING_VISIBLE_COUNT}
                  items={upcoming.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isLocked={false}
                      isJoined={isJoined}
                      existing={ownPredictionByMatch.get(match.id) ?? null}
                      sport={competition.sport}
                      competitionId={competition.id}
                      logoUrlByTeam={logoUrlByTeam}
                    />
                  ))}
                />
              </section>
            )}

            {past.length > 0 && (
              <section className="mt-2 flex flex-col gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] p-4">
                <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">
                  Proběhlé
                </h2>
                <ExpandableList
                  initialCount={PAST_VISIBLE_COUNT}
                  items={past.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isLocked={true}
                      isJoined={isJoined}
                      existing={ownPredictionByMatch.get(match.id) ?? null}
                      sport={competition.sport}
                      competitionId={competition.id}
                      logoUrlByTeam={logoUrlByTeam}
                    />
                  ))}
                />
              </section>
            )}
          </>
        );
      })()}
    </main>
  );
}

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: "scheduled" | "live" | "finished";
  home_score: number | null;
  away_score: number | null;
};

type Prediction = {
  predicted_home_score: number;
  predicted_away_score: number;
  predicted_overtime_flag: boolean | null;
  points: number | null;
} | null;

function TeamLogo({ url }: { url: string | undefined }) {
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-4 w-4 shrink-0 rounded-sm bg-white object-contain p-0.5" />
  );
}

function MatchCard({
  match,
  isLocked,
  isJoined,
  existing,
  sport,
  competitionId,
  logoUrlByTeam,
}: {
  match: Match;
  isLocked: boolean;
  isJoined: boolean;
  existing: Prediction;
  sport: "hockey" | "football";
  competitionId: string;
  logoUrlByTeam: Map<string, string>;
}) {
  return (
    <li
      className={`rounded-lg border border-black/10 dark:border-white/15 p-4 ${
        isLocked ? "bg-white/70 dark:bg-white/[0.02]" : ""
      }`}
    >
      <Link
        href={`/spaces/${competitionId}/matches/${match.id}`}
        className="btn-press -mx-2 -my-1 flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <TeamLogo url={logoUrlByTeam.get(match.home_team)} />
          {match.home_team} – {match.away_team}
          <TeamLogo url={logoUrlByTeam.get(match.away_team)} />
        </span>
        <span className="text-xs text-black/40 dark:text-white/40">
          {new Date(match.kickoff_at).toLocaleString("cs-CZ", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "Europe/Prague",
          })}
        </span>
      </Link>

      {isLocked ? (
        <div className="mt-2 text-xs text-black/40 dark:text-white/40">
          {match.status === "finished" && (
            <p>
              Konečný výsledek: {match.home_score}:{match.away_score}
            </p>
          )}
          {existing ? (
            <p>
              Váš tip: {existing.predicted_home_score}:
              {existing.predicted_away_score}
              {existing.points !== null &&
                ` — získal(a) jste ${existing.points} b.`}
            </p>
          ) : (
            <p>Nestihl(a) jste tip, zápas je zamčený.</p>
          )}
        </div>
      ) : isJoined ? (
        <PredictionForm
          sport={sport}
          competitionId={competitionId}
          matchId={match.id}
          existing={existing}
        />
      ) : (
        <p className="mt-2 text-xs text-black/40 dark:text-white/40">
          Nejdřív se do soutěže musíte přihlásit tlačítkem „Chci hrát“
          nahoře.
        </p>
      )}
    </li>
  );
}
