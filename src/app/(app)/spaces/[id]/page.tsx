import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Trophy,
  Users,
  Bell,
  BellOff,
  Clock,
  CircleCheck,
  Circle,
  Radio,
} from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { ExpandableList } from "@/components/expandable-list";
import { PredictionForm } from "./prediction-form";
import { ExactScoreCelebration } from "./exact-score-celebration";
import { joinCompetition, leaveCompetition, setEmailReminders } from "./actions";
import { formatRelativeKickoff } from "@/lib/format-kickoff";

const SPORT_LABELS = { hockey: "Hokej", football: "Fotbal" } as const;

// Výchozí počet zobrazených zápasů, než se musí kliknout na "Zobrazit
// všechny" (odsouhlaseno s uživatelem 27.8.2026).
//
// "Nadcházející" se dál dělí na netipované (vždy VŠECHNY, bez limitu --
// to jsou zápasy, které hráč potřebuje vyplnit) a už tipnuté (sbalené
// jako "Proběhlé", limit níže) -- odsouhlaseno s uživatelem 28.8.2026,
// protože pevný limit (dřív 8) míchal obojí dohromady a u anglických
// lig s 10 zápasy za víkend uřezával i netipované zápasy z pohledu.
const PAST_VISIBLE_COUNT = 5;
const UPCOMING_PREDICTED_VISIBLE_COUNT = 5;

// Sekce zápasů se na širších obrazovkách zobrazují jako mřížka místo
// jednoho úzkého sloupce -- redesign 29.8.2026, řeší reálný problém
// nahlášený uživatelem ("hodně zápasů zabírá hodně místa").
const MATCH_GRID_CLASSNAME = "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3";

export default async function CompetitionDetailPage({
  params,
}: PageProps<"/spaces/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  // Všech šest dotazů najednou v JEDNÉ vlně.
  //
  // Tipy (predictions) se dřív načítaly až v druhé vlně, protože se
  // filtrovaly seznamem ID zápasů z předchozího dotazu -- appka tedy
  // musela počkat na jedno kolo navíc. Teď se filtrují přes napojenou
  // tabulku zápasů (`matches!inner(...)` = jen tipy, jejichž zápas patří
  // do téhle soutěže), takže na nic čekat nemusí. Ušetří to celé jedno
  // kolo čekání na databázi při každém načtení stránky (perf analýza
  // 28.8.2026 -- jedno kolo stálo ~0,38 s).
  const [
    user,
    { data: competition },
    { data: participants },
    { data: matches },
    { data: teamLogos },
    { data: predictions },
  ] = await Promise.all([
    getCurrentUser(),
    supabase.from("competitions").select("id, name, sport, logo_url").eq("id", id).single(),
    supabase
      .from("competition_participants")
      .select("user_id, profiles(display_name), email_reminders_enabled")
      .eq("competition_id", id),
    supabase
      .from("matches")
      .select(
        "id, home_team, away_team, kickoff_at, status, home_score, away_score",
      )
      .eq("competition_id", id)
      .order("kickoff_at", { ascending: true }),
    supabase.from("team_logos").select("team_name, logo_url").eq("competition_id", id),
    supabase
      .from("predictions")
      .select(
        "match_id, user_id, predicted_home_score, predicted_away_score, predicted_overtime_flag, points, matches!inner(competition_id)",
      )
      .eq("matches.competition_id", id),
  ]);

  if (!competition) {
    notFound();
  }

  const logoUrlByTeam = new Map(teamLogos?.map((t) => [t.team_name, t.logo_url]));

  const ownParticipant = participants?.find((p) => p.user_id === user?.id);
  const isJoined = ownParticipant !== undefined;
  const emailRemindersEnabled = ownParticipant?.email_reminders_enabled ?? false;

  const ownPredictionByMatch = new Map(
    predictions
      ?.filter((p) => p.user_id === user?.id)
      .map((p) => [p.match_id, p]),
  );

  // Výchozí počet zobrazených netipovaných zápasů = jedno kolo. Kolo
  // odehraje každý tým jednou, takže počet zápasů v kole je polovina
  // počtu týmů v soutěži -- počítáno z reálných dat (ne natvrdo podle
  // názvu soutěže), ať to funguje i pro budoucí ligy bez zásahu do kódu.
  // Ověřeno 28.8.2026 přes db-probe.yml: Chance Liga 16 týmů (8
  // zápasů/kolo), Premier League 20 týmů (10), hokejová extraliga 14
  // týmů (7).
  const teamCount = new Set(
    (matches ?? []).flatMap((m) => [m.home_team, m.away_team]),
  ).size;
  const roundSize = teamCount > 1 ? Math.round(teamCount / 2) : UPCOMING_PREDICTED_VISIBLE_COUNT;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 sm:max-w-5xl sm:px-10">
      <header>
        <Link
          href="/spaces"
          className="inline-flex items-center gap-1 text-xs font-bold text-faint-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
          Soutěže
        </Link>

        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10">
            {competition.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={competition.logo_url}
                alt=""
                className="h-7 w-7 object-contain"
              />
            ) : (
              <Trophy className="h-5 w-5 text-accent" strokeWidth={2} />
            )}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{competition.name}</h1>
        </div>

        <div className="mt-2 flex items-center gap-4 pl-[52px] text-xs font-semibold text-muted-foreground">
          <span className="rounded-full border border-border-subtle px-2 py-0.5">
            {SPORT_LABELS[competition.sport]}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" strokeWidth={2.2} />
            {participants?.length ?? 0} hráč
            {(participants?.length ?? 0) === 1 ? "" : "ů"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link
            href={`/spaces/${competition.id}/leaderboard`}
            className="btn-press rounded-full border border-border-subtle px-4 py-2 text-xs font-bold hover:bg-surface-hover"
          >
            Žebříček →
          </Link>

          {isJoined ? (
            <form action={leaveCompetition.bind(null, competition.id)}>
              <button
                type="submit"
                className="btn-press rounded-full border border-border-subtle px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-surface-hover"
              >
                Opustit soutěž
              </button>
            </form>
          ) : (
            <form action={joinCompetition.bind(null, competition.id)}>
              <button
                type="submit"
                className="btn-press rounded-full bg-accent px-4 py-2 text-xs font-bold text-accent-foreground hover:opacity-90"
              >
                Chci hrát
              </button>
            </form>
          )}

          {isJoined && (
            <form action={setEmailReminders.bind(null, competition.id, !emailRemindersEnabled)}>
              <button
                type="submit"
                className="btn-press flex items-center gap-1.5 rounded-full border border-border-subtle px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-surface-hover"
              >
                {emailRemindersEnabled ? (
                  <BellOff className="h-3.5 w-3.5" strokeWidth={2.2} />
                ) : (
                  <Bell className="h-3.5 w-3.5" strokeWidth={2.2} />
                )}
                {emailRemindersEnabled ? "Nechci upozornit" : "Chci upozornit"}
              </button>
            </form>
          )}
        </div>
      </header>

      {!isJoined && (
        <div className="rounded-2xl border border-border-subtle bg-surface-hover px-4 py-3 text-sm font-medium">
          👋 Ještě nehraješ tuhle soutěž. Klikni na „Chci hrát“ výše a začni
          tipovat zápasy!
        </div>
      )}

      {!matches?.length && (
        <p className="text-sm text-muted-foreground">
          Zatím tu nejsou žádné zápasy.
        </p>
      )}

      {(() => {
        const upcomingMissing: Match[] = [];
        const upcomingPredicted: Match[] = [];
        const live: Match[] = [];
        const past: Match[] = [];
        for (const match of matches ?? []) {
          const isLocked =
            match.status !== "scheduled" ||
            new Date(match.kickoff_at) <= new Date();
          if (match.status === "finished") {
            past.push(match);
          } else if (isLocked) {
            // Buď appka výslovně ví, že zápas právě běží
            // (status === "live", viz sync-results.mjs), nebo jen uplynul
            // výkop a ještě nemáme čerstvá data (sync běží jednou za
            // 30 minut) -- v obou případech patří do "Probíhající", ne
            // do "Proběhlé" (tam by bez skóre a bez tipu ostatních
            // vypadal jako chyba).
            live.push(match);
          } else if (ownPredictionByMatch.has(match.id)) {
            upcomingPredicted.push(match);
          } else {
            upcomingMissing.push(match);
          }
        }
        // Nejbližší zápas nahoře ve všech sekcích: nadcházející a
        // probíhající vzestupně (jak přišly z DB), proběhlé sestupně
        // (nejnovější výsledek první).
        past.reverse();

        // "Vysvícený" nejbližší zápas (odsouhlaseno s uživatelem
        // 29.8.2026, viz vizuální návrh): vždy chronologicky nejbližší
        // netipovaný zápas, zvýrazněný jako velká karta nahoře -- po
        // zadání tipu se sám přesune do "Už tipnuto" a vysvítí se
        // další, protože je to prostě první položka už seřazeného
        // seznamu "Ještě netipováno". Při shodě přesného času výkopu
        // (víc zápasů začíná úplně stejně) se vybírá náhodně -- appka
        // je server-rendered, náhoda se tedy spočítá jednou na serveru
        // při načtení stránky, ne opakovaně v prohlížeči.
        let spotlight: Match | null = null;
        let restMissing = upcomingMissing;
        if (upcomingMissing.length > 0) {
          const earliestKickoff = upcomingMissing[0].kickoff_at;
          const candidates = upcomingMissing.filter(
            (m) => m.kickoff_at === earliestKickoff,
          );
          spotlight = candidates[Math.floor(Math.random() * candidates.length)];
          restMissing = upcomingMissing.filter((m) => m.id !== spotlight!.id);
        }

        const hasUpcoming = upcomingMissing.length > 0 || upcomingPredicted.length > 0;

        return (
          <>
            {hasUpcoming && (
              <section className="flex flex-col gap-4">
                <h2 className="text-sm font-bold text-muted-foreground">
                  Nadcházející
                </h2>

                {spotlight ? (
                  <>
                    <SpotlightMatchCard
                      match={spotlight}
                      isJoined={isJoined}
                      sport={competition.sport}
                      competitionId={competition.id}
                      logoUrlByTeam={logoUrlByTeam}
                    />
                    {restMissing.length > 0 && (
                      <ExpandableList
                        initialCount={Math.max(roundSize - 1, 1)}
                        listClassName={MATCH_GRID_CLASSNAME}
                        items={restMissing.map((match) => (
                          <MatchCard
                            key={match.id}
                            match={match}
                            isLocked={false}
                            isJoined={isJoined}
                            existing={null}
                            sport={competition.sport}
                            competitionId={competition.id}
                            logoUrlByTeam={logoUrlByTeam}
                          />
                        ))}
                      />
                    )}
                  </>
                ) : (
                  isJoined && (
                    <p className="text-sm font-medium text-muted-foreground">
                      ✅ Máš vyplněné tipy na všechny nadcházející zápasy.
                    </p>
                  )
                )}

                {upcomingPredicted.length > 0 && (
                  <div className="mt-1 flex flex-col gap-3">
                    <h3 className="text-xs font-bold text-faint-foreground">
                      Už tipnuto
                    </h3>
                    <ExpandableList
                      initialCount={UPCOMING_PREDICTED_VISIBLE_COUNT}
                      listClassName={MATCH_GRID_CLASSNAME}
                      items={upcomingPredicted.map((match) => (
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
                  </div>
                )}
              </section>
            )}

            {live.length > 0 && (
              <section className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger/[0.06] p-4">
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-danger">
                  <Radio className="h-4 w-4" strokeWidth={2.4} />
                  Probíhající
                </h2>
                <ul className={MATCH_GRID_CLASSNAME}>
                  {live.map((match) => (
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
                </ul>
              </section>
            )}

            {past.length > 0 && (
              <section className="mt-2 flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-hover p-4">
                <h2 className="text-sm font-bold text-muted-foreground">
                  Proběhlé
                </h2>
                <ExpandableList
                  initialCount={PAST_VISIBLE_COUNT}
                  listClassName={MATCH_GRID_CLASSNAME}
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

// Krok 8 (odsouhlaseno 28.8.2026): barva kartičky ukazuje úspěšnost
// VLASTNÍHO tipu, ne výsledek zápasu -- zelená = přesné skóre, žlutá =
// aspoň výherce/remíza nebo součet gólů sedí, šedá = netrefil nic.
// Stejná pravidla jako `calculate_match_points()`
// (supabase/migrations/20260825100000_scoring_trigger.sql), jen bez
// závislosti na bodové hodnotě (ta je per-competition nastavitelná).
function getResultTone(
  match: Match,
  existing: Prediction,
): "exact" | "partial" | "miss" | null {
  if (
    match.status !== "finished" ||
    match.home_score === null ||
    match.away_score === null ||
    !existing
  ) {
    return null;
  }

  if (
    existing.predicted_home_score === match.home_score &&
    existing.predicted_away_score === match.away_score
  ) {
    return "exact";
  }

  const actualOutcome =
    match.home_score > match.away_score
      ? "home"
      : match.away_score > match.home_score
        ? "away"
        : "draw";
  const predictedOutcome =
    existing.predicted_home_score > existing.predicted_away_score
      ? "home"
      : existing.predicted_away_score > existing.predicted_home_score
        ? "away"
        : "draw";

  const winnerMatches = predictedOutcome === actualOutcome;
  const goalsMatch =
    existing.predicted_home_score + existing.predicted_away_score ===
    match.home_score + match.away_score;

  return winnerMatches || goalsMatch ? "partial" : "miss";
}

const RESULT_TONE_CLASSES = {
  exact: "border-success/40 bg-success/10",
  partial: "border-warning/40 bg-warning/10",
  miss: "border-border-subtle bg-surface",
} as const;

function TeamLogo({ url }: { url: string | undefined }) {
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-4 w-4 shrink-0 rounded-sm bg-white object-contain p-0.5" />
  );
}

function TeamBadge({ url, name }: { url: string | undefined; name: string }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 text-sm font-extrabold text-white">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-8 w-8 object-contain" />
      ) : (
        initials
      )}
    </span>
  );
}

// Vysvícená karta pro chronologicky nejbližší netipovaný zápas --
// vždy nápadně tmavá bez ohledu na světlý/tmavý režim appky (stejný
// princip jako červeně laděná sekce "Probíhající"), ať vždy vynikne
// nad zbytkem stránky.
function SpotlightMatchCard({
  match,
  isJoined,
  sport,
  competitionId,
  logoUrlByTeam,
}: {
  match: Match;
  isJoined: boolean;
  sport: "hockey" | "football";
  competitionId: string;
  logoUrlByTeam: Map<string, string>;
}) {
  return (
    <div className="relative overflow-hidden rounded-[26px] bg-[#15171c] p-6 sm:p-8">
      <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-accent/25" />

      <div className="relative flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] font-extrabold tracking-wide text-accent uppercase sm:justify-between">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" strokeWidth={2.4} />
          Nejbližší zápas
        </span>
        <span className="font-semibold text-white/40 normal-case">
          {new Date(match.kickoff_at).toLocaleString("cs-CZ", {
            weekday: "short",
            day: "numeric",
            month: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Europe/Prague",
          })}{" "}
          · {formatRelativeKickoff(match.kickoff_at)}
        </span>
      </div>

      <Link
        href={`/spaces/${competitionId}/matches/${match.id}`}
        className="relative mt-5 flex items-center justify-center gap-4 sm:gap-10"
      >
        <div className="flex flex-col items-center gap-2">
          <TeamBadge url={logoUrlByTeam.get(match.home_team)} name={match.home_team} />
          <span className="max-w-[92px] text-center text-[13px] font-bold text-white sm:max-w-none">
            {match.home_team}
          </span>
        </div>
        <span className="text-sm font-bold text-white/30">vs</span>
        <div className="flex flex-col items-center gap-2">
          <TeamBadge url={logoUrlByTeam.get(match.away_team)} name={match.away_team} />
          <span className="max-w-[92px] text-center text-[13px] font-bold text-white sm:max-w-none">
            {match.away_team}
          </span>
        </div>
      </Link>

      <div className="relative mt-6">
        {isJoined ? (
          <PredictionForm
            variant="spotlight"
            sport={sport}
            competitionId={competitionId}
            matchId={match.id}
            existing={null}
          />
        ) : (
          <p className="text-center text-xs font-semibold text-white/50">
            Nejdřív se do soutěže musíš přihlásit tlačítkem „Chci hrát“ nahoře.
          </p>
        )}
      </div>
    </div>
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
  const tone = getResultTone(match, existing);
  const cardToneClass = tone ? RESULT_TONE_CLASSES[tone] : "border-border-subtle bg-surface";

  const pointsToneClass =
    tone === "exact" ? "text-success" : tone === "partial" ? "text-warning" : "text-muted-foreground";

  return (
    <li className={`rounded-[18px] border p-4 ${cardToneClass}`}>
      <Link
        href={`/spaces/${competitionId}/matches/${match.id}`}
        className="btn-press -mx-2 -my-1 flex items-center justify-between gap-3 rounded-[12px] px-2 py-1 transition-colors hover:bg-surface-hover"
      >
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <TeamLogo url={logoUrlByTeam.get(match.home_team)} />
          {match.home_team} – {match.away_team}
          <TeamLogo url={logoUrlByTeam.get(match.away_team)} />
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          {isLocked
            ? existing?.points !== null &&
              existing?.points !== undefined &&
              (tone === "exact" ? (
                <ExactScoreCelebration matchId={match.id} points={existing.points} />
              ) : (
                <span
                  className={`text-lg font-extrabold leading-none ${pointsToneClass}`}
                >
                  {existing.points} b.
                </span>
              ))
            : existing ? (
                <CircleCheck className="h-[18px] w-[18px] text-success" strokeWidth={2.2} />
              ) : (
                <Circle className="h-[18px] w-[18px] text-border-strong" strokeWidth={2.2} />
              )}
          <span className="text-[11px] font-semibold text-faint-foreground">
            {new Date(match.kickoff_at).toLocaleString("cs-CZ", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "Europe/Prague",
            })}
            {!isLocked && (
              <>
                {" · "}
                <span className="font-bold text-accent">
                  {formatRelativeKickoff(match.kickoff_at)}
                </span>
              </>
            )}
          </span>
        </span>
      </Link>

      {isLocked ? (
        <div className="mt-2 text-xs font-semibold text-faint-foreground">
          {match.status === "finished" && (
            <p>
              Konečný výsledek: {match.home_score}:{match.away_score}
            </p>
          )}
          {match.status === "live" && (
            <p className="font-bold text-danger">
              {match.home_score !== null && match.away_score !== null
                ? `Právě se hraje: ${match.home_score}:${match.away_score}`
                : "Právě se hraje"}
            </p>
          )}
          {match.status === "scheduled" && new Date(match.kickoff_at) <= new Date() && (
            <p className="font-bold text-danger">
              Zápas právě začal, čekáme na aktuální skóre
            </p>
          )}
          {existing ? (
            <p>
              Váš tip: {existing.predicted_home_score}:
              {existing.predicted_away_score}
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
        <p className="mt-2 text-xs font-semibold text-faint-foreground">
          Nejdřív se do soutěže musíte přihlásit tlačítkem „Chci hrát“
          nahoře.
        </p>
      )}
    </li>
  );
}
