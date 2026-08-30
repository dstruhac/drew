import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff, ChevronLeft, Radio } from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { formatRelativeKickoff } from "@/lib/format-kickoff";
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
          className="inline-flex items-center gap-1 text-xs font-bold text-faint-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
          {competition.name}
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-xl font-extrabold tracking-tight">
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
        <p className="mt-1 text-sm font-semibold text-muted-foreground">
          {new Date(match.kickoff_at).toLocaleString("cs-CZ", {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: "Europe/Prague",
          })}
          {!isLocked && (
            <span className="font-bold text-accent">
              {" · "}
              {formatRelativeKickoff(match.kickoff_at)}
            </span>
          )}
        </p>
        {match.status === "finished" && (
          <p className="mt-2 text-lg font-extrabold">
            Konečný výsledek: {match.home_score}:{match.away_score}
          </p>
        )}
        {match.status === "live" && (
          <p className="mt-2 flex items-center gap-1.5 text-lg font-extrabold text-danger">
            <Radio className="h-4 w-4" strokeWidth={2.4} />
            {match.home_score !== null && match.away_score !== null
              ? `Právě se hraje: ${match.home_score}:${match.away_score}`
              : "Právě se hraje"}
          </p>
        )}
        {match.status === "scheduled" && new Date(match.kickoff_at) <= new Date() && (
          <p className="mt-2 flex items-center gap-1.5 text-lg font-extrabold text-danger">
            <Radio className="h-4 w-4" strokeWidth={2.4} />
            Zápas právě začal, čekáme na aktuální skóre
          </p>
        )}
        {match.status === "postponed" && (
          <p className="mt-2 flex items-center gap-1.5 text-lg font-extrabold text-warning">
            <CalendarOff className="h-4 w-4" strokeWidth={2.4} />
            Zápas je odložen, nový termín zatím není znám
          </p>
        )}
      </header>

      <section>
        <h2 className="text-sm font-bold text-muted-foreground">
          Váš tip
        </h2>
        {isLocked ? (
          ownPrediction ? (
            <p className="mt-2 text-sm font-semibold">
              {ownPrediction.predicted_home_score}:
              {ownPrediction.predicted_away_score}
              {ownPrediction.points !== null &&
                ` — získal(a) jste ${ownPrediction.points} b.`}
            </p>
          ) : match.status === "postponed" ? (
            <p className="mt-2 text-sm font-semibold text-faint-foreground">
              Zatím jste nestihl(a) zadat tip — půjde znovu, jakmile appka
              zachytí nový termín.
            </p>
          ) : (
            <p className="mt-2 text-sm font-semibold text-faint-foreground">
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
          <p className="mt-2 text-sm font-semibold text-faint-foreground">
            Nejdřív se do soutěže musíte přihlásit tlačítkem „Chci hrát“ v
            detailu soutěže.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-muted-foreground">
          Tipy hráčů
        </h2>
        {isLocked ? (
          standings.length === 0 ? (
            <p className="mt-2 text-sm font-semibold text-faint-foreground">
              Do soutěže se zatím nikdo nepřihlásil.
            </p>
          ) : (
            <ol className="mt-2 flex flex-col gap-2">
              {standings.map((entry, index) => (
                <li
                  key={entry.userId}
                  className="flex items-center justify-between rounded-2xl border border-border-subtle bg-surface p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-sm font-semibold text-faint-foreground">
                      {index + 1}.
                    </span>
                    <Link
                      href={`/profil/${entry.userId}`}
                      className="font-bold hover:underline"
                    >
                      {entry.displayName}
                    </Link>
                  </div>
                  <div className="text-right text-sm font-semibold">
                    {entry.hasPrediction ? (
                      <>
                        <span>
                          {entry.homeScore}:{entry.awayScore}
                        </span>
                        <span className="ml-2 text-faint-foreground">
                          {entry.points ?? 0} b.
                        </span>
                      </>
                    ) : (
                      <span className="text-faint-foreground">
                        bez tipu
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )
        ) : (
          <p className="mt-2 text-sm font-semibold text-faint-foreground">
            Tipy ostatních hráčů se odemknou po výkopu zápasu.
          </p>
        )}
      </section>
    </main>
  );
}
