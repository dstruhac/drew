import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PredictionForm } from "./prediction-form";
import { joinCompetition, leaveCompetition } from "./actions";

const SPORT_LABELS = { hockey: "Hokej", football: "Fotbal" } as const;

export default async function CompetitionDetailPage({
  params,
}: PageProps<"/spaces/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: competition } = await supabase
    .from("competitions")
    .select("id, name, sport")
    .eq("id", id)
    .single();

  if (!competition) {
    notFound();
  }

  const { data: participants } = await supabase
    .from("competition_participants")
    .select("user_id, profiles(display_name)")
    .eq("competition_id", id);

  const isJoined = participants?.some((p) => p.user_id === user?.id) ?? false;

  const { data: matches } = await supabase
    .from("matches")
    .select(
      "id, home_team, away_team, kickoff_at, status, home_score, away_score",
    )
    .eq("competition_id", id)
    .order("kickoff_at", { ascending: true });

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
          className="text-xs text-black/40 dark:text-white/40 hover:underline"
        >
          ← Soutěže
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <h1 className="text-xl font-semibold">{competition.name}</h1>
          <span className="text-xs rounded-full border border-black/10 dark:border-white/15 px-2 py-0.5 text-black/60 dark:text-white/60">
            {SPORT_LABELS[competition.sport]}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href={`/spaces/${competition.id}/leaderboard`}
            className="inline-block rounded-lg border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
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
                className="rounded-lg border border-black/10 dark:border-white/15 px-3 py-1.5 text-sm font-medium text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                Opustit soutěž
              </button>
            </form>
          ) : (
            <form action={joinCompetition.bind(null, competition.id)}>
              <button
                type="submit"
                className="rounded-lg bg-black dark:bg-white px-3 py-1.5 text-sm font-medium text-white dark:text-black hover:opacity-90 transition-opacity"
              >
                Chci hrát
              </button>
            </form>
          )}
        </div>
      </header>

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
                <ul className="flex flex-col gap-3">
                  {upcoming.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isLocked={false}
                      isJoined={isJoined}
                      existing={ownPredictionByMatch.get(match.id) ?? null}
                      sport={competition.sport}
                      competitionId={competition.id}
                    />
                  ))}
                </ul>
              </section>
            )}

            {past.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">
                  Proběhlé
                </h2>
                <ul className="flex flex-col gap-3">
                  {past.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      isLocked={true}
                      isJoined={isJoined}
                      existing={ownPredictionByMatch.get(match.id) ?? null}
                      sport={competition.sport}
                      competitionId={competition.id}
                    />
                  ))}
                </ul>
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

function MatchCard({
  match,
  isLocked,
  isJoined,
  existing,
  sport,
  competitionId,
}: {
  match: Match;
  isLocked: boolean;
  isJoined: boolean;
  existing: Prediction;
  sport: "hockey" | "football";
  competitionId: string;
}) {
  return (
    <li className="rounded-lg border border-black/10 dark:border-white/15 p-4">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {match.home_team} – {match.away_team}
        </span>
        <span className="text-xs text-black/40 dark:text-white/40">
          {new Date(match.kickoff_at).toLocaleString("cs-CZ", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </span>
      </div>

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
