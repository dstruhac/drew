import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PredictionForm } from "./prediction-form";

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
      </header>

      {!matches?.length && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Zatím tu nejsou žádné zápasy.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {matches?.map((match) => {
          const isLocked =
            match.status !== "scheduled" ||
            new Date(match.kickoff_at) <= new Date();
          const existing = ownPredictionByMatch.get(match.id) ?? null;

          return (
            <li
              key={match.id}
              className="rounded-lg border border-black/10 dark:border-white/15 p-4"
            >
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
              ) : (
                <PredictionForm
                  sport={competition.sport}
                  competitionId={competition.id}
                  matchId={match.id}
                  existing={existing}
                />
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
