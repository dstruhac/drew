import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { PredictionForm } from "../../prediction-form";

export default async function MatchDetailPage({
  params,
}: PageProps<"/spaces/[id]/matches/[matchId]">) {
  const { id, matchId } = await params;
  const supabase = await createClient();

  // Pět nezávislých dotazů najednou -- všechny filtrují rovnou podle `id`/
  // `matchId` z route parametrů, žádný nepotřebuje výsledek jiného (perf
  // review 27.8.2026). Před výkopem vrátí RLS
  // (predictions_select_own_or_locked) u predictions jen vlastní řádek
  // přihlášeného uživatele, cizí tipy prostě nepřijdou -- odemčení po
  // výkopu je tak vynucené v databázi, ne jen skrytím v UI.
  const [
    user,
    { data: competition },
    { data: match },
    { data: participants },
    { data: predictions },
    { data: teamLogos },
  ] = await Promise.all([
    getCurrentUser(),
    supabase.from("competitions").select("id, name, sport").eq("id", id).single(),
    supabase
      .from("matches")
      .select(
        "id, home_team, away_team, kickoff_at, status, home_score, away_score",
      )
      .eq("id", matchId)
      .eq("competition_id", id)
      .single(),
    supabase
      .from("competition_participants")
      .select("user_id, profiles(display_name)")
      .eq("competition_id", id),
    supabase
      .from("predictions")
      .select(
        "user_id, predicted_home_score, predicted_away_score, predicted_overtime_flag, points, profiles(display_name)",
      )
      .eq("match_id", matchId),
    supabase.from("team_logos").select("team_name, logo_url").eq("competition_id", id),
  ]);

  if (!competition) {
    notFound();
  }

  if (!match) {
    notFound();
  }

  const logoUrlByTeam = new Map(teamLogos?.map((t) => [t.team_name, t.logo_url]));

  const isLocked =
    match.status !== "scheduled" || new Date(match.kickoff_at) <= new Date();

  const isJoined = participants?.some((p) => p.user_id === user?.id) ?? false;

  const ownPrediction =
    predictions?.find((p) => p.user_id === user?.id) ?? null;

  const standings = (participants ?? [])
    .map((participant) => {
      const prediction = predictions?.find(
        (p) => p.user_id === participant.user_id,
      );
      return {
        userId: participant.user_id,
        displayName: participant.profiles?.display_name ?? "Neznámý hráč",
        homeScore: prediction?.predicted_home_score ?? null,
        awayScore: prediction?.predicted_away_score ?? null,
        points: prediction?.points ?? null,
        hasPrediction: prediction !== undefined,
      };
    })
    .sort(
      (a, b) =>
        (b.points ?? 0) - (a.points ?? 0) ||
        a.displayName.localeCompare(b.displayName, "cs"),
    );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <Link
          href={`/spaces/${competition.id}`}
          className="text-xs text-black/40 dark:text-white/40 transition-colors hover:text-black/70 hover:underline dark:hover:text-white/70"
        >
          ← {competition.name}
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">
          {logoUrlByTeam.get(match.home_team) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrlByTeam.get(match.home_team)}
              alt=""
              className="h-6 w-6 rounded bg-white object-contain p-0.5"
            />
          )}
          {match.home_team} – {match.away_team}
          {logoUrlByTeam.get(match.away_team) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrlByTeam.get(match.away_team)}
              alt=""
              className="h-6 w-6 rounded bg-white object-contain p-0.5"
            />
          )}
        </h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          {new Date(match.kickoff_at).toLocaleString("cs-CZ", {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: "Europe/Prague",
          })}
        </p>
        {match.status === "finished" && (
          <p className="mt-2 text-lg font-semibold">
            Konečný výsledek: {match.home_score}:{match.away_score}
          </p>
        )}
      </header>

      <section>
        <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">
          Váš tip
        </h2>
        {isLocked ? (
          ownPrediction ? (
            <p className="mt-2 text-sm">
              {ownPrediction.predicted_home_score}:
              {ownPrediction.predicted_away_score}
              {ownPrediction.points !== null &&
                ` — získal(a) jste ${ownPrediction.points} b.`}
            </p>
          ) : (
            <p className="mt-2 text-sm text-black/40 dark:text-white/40">
              Nestihl(a) jste tip, zápas je zamčený.
            </p>
          )
        ) : isJoined ? (
          <PredictionForm
            sport={competition.sport}
            competitionId={competition.id}
            matchId={match.id}
            existing={ownPrediction}
          />
        ) : (
          <p className="mt-2 text-sm text-black/40 dark:text-white/40">
            Nejdřív se do soutěže musíte přihlásit tlačítkem „Chci hrát“ v
            detailu soutěže.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">
          Tipy hráčů
        </h2>
        {isLocked ? (
          standings.length === 0 ? (
            <p className="mt-2 text-sm text-black/40 dark:text-white/40">
              Do soutěže se zatím nikdo nepřihlásil.
            </p>
          ) : (
            <ol className="mt-2 flex flex-col gap-2">
              {standings.map((entry, index) => (
                <li
                  key={entry.userId}
                  className="flex items-center justify-between rounded-lg border border-black/10 dark:border-white/15 p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-sm text-black/40 dark:text-white/40">
                      {index + 1}.
                    </span>
                    <Link
                      href={`/profil/${entry.userId}`}
                      className="font-medium hover:underline"
                    >
                      {entry.displayName}
                    </Link>
                  </div>
                  <div className="text-right text-sm">
                    {entry.hasPrediction ? (
                      <>
                        <span>
                          {entry.homeScore}:{entry.awayScore}
                        </span>
                        <span className="ml-2 text-black/40 dark:text-white/40">
                          {entry.points ?? 0} b.
                        </span>
                      </>
                    ) : (
                      <span className="text-black/40 dark:text-white/40">
                        bez tipu
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )
        ) : (
          <p className="mt-2 text-sm text-black/40 dark:text-white/40">
            Tipy ostatních hráčů se odemknou po výkopu zápasu.
          </p>
        )}
      </section>
    </main>
  );
}
