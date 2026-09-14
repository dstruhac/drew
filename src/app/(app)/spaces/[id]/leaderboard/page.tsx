import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Crown, Medal } from "lucide-react";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getCurrentWeekRange, computeWeeklyPoints } from "@/lib/week";
import { sportAccentStyle } from "@/lib/sport";
import { throwIfSupabaseError } from "@/lib/supabase/errors";

// Vzhled prvních tří míst (12.9.2026, na žádost uživatele "at ho chci
// vyhrat, at ho potrebuju vyhrat") -- zlatá/stříbrná/bronzová jsou
// zavedená barva "medaile" nezávislá na zbytku appky (--accent apod.),
// proto natvrdo Tailwind odstíny jen tady, ne jako nový design token.
const MEDAL_STYLES: Record<number, { badge: string; row: string }> = {
  1: {
    badge: "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-[0_0_0_3px_rgba(251,191,36,0.35)]",
    row: "border-amber-400/50 bg-gradient-to-br from-amber-400/[0.12] to-transparent",
  },
  2: {
    badge: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900",
    row: "border-slate-400/40 bg-slate-400/[0.07]",
  },
  3: {
    badge: "bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950",
    row: "border-orange-500/40 bg-orange-500/[0.08]",
  },
};

function RankBadge({ rank }: { rank: number }) {
  const medal = MEDAL_STYLES[rank];
  if (!medal) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-sm font-bold text-faint-foreground">
        {rank}.
      </span>
    );
  }
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${medal.badge}`}
    >
      {rank === 1 ? <Crown className="h-3.5 w-3.5" strokeWidth={2.6} /> : rank}
    </span>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-surface-hover text-xs font-bold text-muted-foreground">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        name.trim().charAt(0).toUpperCase() || "?"
      )}
    </span>
  );
}

// Vlastní řádek uživatele je vždy zvýrazněný (rámeček + jemný podklad
// v --accent) bez ohledu na umístění -- ať hráč hned vidí, kde v
// žebříčku stojí, i uprostřed dlouhého seznamu.
function rowToneClassName(rank: number, isYou: boolean) {
  if (isYou) {
    return "border-accent/60 bg-accent/[0.07] ring-1 ring-accent/30";
  }
  const medal = MEDAL_STYLES[rank];
  return medal ? medal.row : "border-border-subtle bg-surface";
}

export default async function LeaderboardPage({
  params,
  searchParams,
}: PageProps<"/spaces/[id]/leaderboard">) {
  const { id } = await params;
  const sp = await searchParams;
  // Přepínač řazení celkového žebříčku (14.9.2026, na žádost uživatele)
  // -- čte se z URL (?sort=avg), ne z klientského stavu, ať appka
  // zůstane server-rendered a řazení jde poslat/uložit jako odkaz.
  // Výchozí (bez parametru, nebo cokoliv jiného než "avg") je řazení
  // podle celkových bodů beze změny -- to je pořád "hlavní" žebříček
  // sezóny, průměr je jen doplňkový pohled.
  const sortMode: "total" | "avg" = sp?.sort === "avg" ? "avg" : "total";
  const supabase = await createClient();

  // Šest nezávislých dotazů v JEDNÉ vlně -- všechny filtrují rovnou podle
  // `id` z route parametru, žádný nepotřebuje výsledek jiného.
  // getCurrentUser() není síťový dotaz (viz komentář u něj v server.ts),
  // takže tahle závislost nic nestojí navíc.
  //
  // Tipy (predictions) se dřív načítaly až v druhé vlně, protože se
  // filtrovaly seznamem ID zápasů z první -- teď se filtrují přes
  // napojenou tabulku zápasů, takže na nic čekat nemusí a ušetří se celé
  // jedno kolo čekání na databázi (perf analýza 28.8.2026).
  const [
    currentUser,
    competitionResult,
    participantsResult,
    matchesResult,
    badgesResult,
    predictionsResult,
  ] = await Promise.all([
    getCurrentUser(),
    supabase.from("competitions").select("id, name, sport").eq("id", id).single(),
    supabase
      .from("competition_participants")
      .select("user_id, profiles(display_name, avatar_url)")
      .eq("competition_id", id),
    supabase
      .from("matches")
      .select("id, kickoff_at, home_score, away_score")
      .eq("competition_id", id),
    supabase.from("weekly_badges").select("user_id").eq("competition_id", id),
    supabase
      .from("predictions")
      .select(
        "match_id, user_id, points, predicted_home_score, predicted_away_score, profiles(display_name, avatar_url), matches!inner(competition_id)",
      )
      .eq("matches.competition_id", id),
  ]);

  throwIfSupabaseError(competitionResult.error, "Načtení soutěže", ["PGRST116"]);
  throwIfSupabaseError(participantsResult.error, "Načtení účastníků žebříčku");
  throwIfSupabaseError(matchesResult.error, "Načtení zápasů pro žebříček");
  throwIfSupabaseError(badgesResult.error, "Načtení medailí");
  throwIfSupabaseError(predictionsResult.error, "Načtení tipů pro žebříček");
  const competition = competitionResult.data;
  const participants = participantsResult.data;
  const matches = matchesResult.data;
  const badges = badgesResult.data;
  const predictions = predictionsResult.data;

  if (!competition) {
    notFound();
  }

  const matchById = new Map((matches ?? []).map((m) => [m.id, m]));

  const badgeCountByUser = new Map<string, number>();
  for (const badge of badges ?? []) {
    badgeCountByUser.set(
      badge.user_id,
      (badgeCountByUser.get(badge.user_id) ?? 0) + 1,
    );
  }

  type Totals = {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    totalPoints: number;
    scoredCount: number;
    predictionCount: number;
    exactCount: number;
  };

  const totalsByUser = new Map<string, Totals>();

  // Základ žebříčku jsou všichni, kdo se do soutěže přihlásili -- i s
  // nulou tipů/bodů, ať jsou vidět jako "hraje, zatím bez skóre".
  for (const participant of participants ?? []) {
    const displayName = participant.profiles?.display_name ?? "Neznámý hráč";
    totalsByUser.set(participant.user_id, {
      userId: participant.user_id,
      displayName,
      avatarUrl: participant.profiles?.avatar_url ?? null,
      totalPoints: 0,
      scoredCount: 0,
      predictionCount: 0,
      exactCount: 0,
    });
  }

  for (const prediction of predictions ?? []) {
    const displayName = prediction.profiles?.display_name ?? "Neznámý hráč";
    const entry = totalsByUser.get(prediction.user_id) ?? {
      userId: prediction.user_id,
      displayName,
      avatarUrl: prediction.profiles?.avatar_url ?? null,
      totalPoints: 0,
      scoredCount: 0,
      predictionCount: 0,
      exactCount: 0,
    };
    entry.predictionCount += 1;
    if (prediction.points !== null) {
      entry.totalPoints += prediction.points;
      entry.scoredCount += 1;
    }
    const match = matchById.get(prediction.match_id);
    if (
      match &&
      match.home_score !== null &&
      match.away_score !== null &&
      prediction.predicted_home_score === match.home_score &&
      prediction.predicted_away_score === match.away_score
    ) {
      entry.exactCount += 1;
    }
    totalsByUser.set(prediction.user_id, entry);
  }

  // Řazení celkového žebříčku podle přepínače nahoře (14.9.2026) --
  // "avg" řadí podle průměru bodů na VYHODNOCENÝ zápas (`scoredCount`,
  // ne `predictionCount` -- appka nepočítá nevyhodnocené zápasy jako
  // 0 bodů, stejná logika jako u zobrazeného "Ø X,XX b./zápas" od
  // 6.9.2026). Hráč bez jediného vyhodnoceného zápasu (scoredCount 0)
  // dostane sentinelovou hodnotu -1, ať se zařadí až za všechny se
  // skutečným (i nulovým) průměrem, ne mezi ně podle náhodného pořadí.
  const standings = [...totalsByUser.values()].sort((a, b) => {
    if (sortMode === "avg") {
      const avgA = a.scoredCount > 0 ? a.totalPoints / a.scoredCount : -1;
      const avgB = b.scoredCount > 0 ? b.totalPoints / b.scoredCount : -1;
      return (
        avgB - avgA ||
        b.totalPoints - a.totalPoints ||
        a.displayName.localeCompare(b.displayName, "cs")
      );
    }
    return (
      b.totalPoints - a.totalPoints ||
      a.displayName.localeCompare(b.displayName, "cs")
    );
  });

  const weekly = computeWeeklyPoints(matches ?? [], predictions ?? []);
  const weeklyStandings = [...weekly.participantIds]
    .map((userId) => ({
      userId,
      displayName: totalsByUser.get(userId)?.displayName ?? "Neznámý hráč",
      avatarUrl: totalsByUser.get(userId)?.avatarUrl ?? null,
      points: weekly.pointsByUser.get(userId) ?? 0,
      scoredCount: weekly.scoredCountByUser.get(userId) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.points - a.points || a.displayName.localeCompare(b.displayName, "cs"),
    );

  const { weekStart, weekEnd } = getCurrentWeekRange();
  const weekRangeLabel = formatWeekRange(weekStart, weekEnd);

  return (
    <main
      style={sportAccentStyle(competition.sport)}
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:max-w-3xl sm:px-10"
    >
      <header>
        <div className="flex items-center gap-2 text-xs font-bold text-faint-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">
            Dashboard
          </Link>
          <span>·</span>
          <Link
            href={`/spaces/${id}`}
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
            {competition.name}
          </Link>
        </div>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-extrabold tracking-tight">
          <Crown className="h-6 w-6 text-amber-500" strokeWidth={2.2} />
          Žebříček
        </h1>
      </header>

      {/* Týdenní žebříček nahoře -- na žádost uživatele 12.9.2026 ("at je
       * vikendovy nahore"): tenhle je "živý" a nejrelevantnější k
       * aktuálnímu dění, celkový žebříček za celou sezónu je níž. */}
      <section className="flex flex-col gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-muted-foreground">
              Týdenní žebříček
            </h2>
            <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[10px] font-bold text-faint-foreground">
              {weekRangeLabel}
            </span>
          </div>
          {/* Textace (14.9.2026, na žádost uživatele "neco vic
           * vyzivaveho" -- dřív tu bylo jen suché datum + vysvětlení,
           * kdy se žebříček vynuluje; datum se přesunulo do labelu
           * vedle nadpisu výše). */}
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            🏅 Získávej medaile, dokud jsou žhavé!
          </p>
        </div>

        {weekly.weekMatchCount === 0 ? (
          <p className="text-sm font-medium text-muted-foreground">
            V tomhle týdnu se zatím nehrálo.
          </p>
        ) : weeklyStandings.length === 0 ? (
          <p className="text-sm font-medium text-muted-foreground">
            V tomhle týdnu zatím nikdo netipoval.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {weeklyStandings.map((entry, index) => {
              const rank = index + 1;
              const isYou = entry.userId === currentUser?.id;
              return (
                <li
                  key={entry.userId}
                  className={`flex flex-col gap-1 rounded-2xl border p-4 transition-colors ${rowToneClassName(rank, isYou)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <RankBadge rank={rank} />
                      <Avatar url={entry.avatarUrl} name={entry.displayName} />
                      <div className="flex min-w-0 items-center gap-1.5">
                        <Link
                          href={`/profil/${entry.userId}`}
                          className="truncate font-bold hover:underline"
                        >
                          {entry.displayName}
                        </Link>
                        {isYou && (
                          <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                            Ty
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-extrabold">{entry.points} b.</span>
                  </div>
                  <p className="pl-[88px] text-xs font-semibold text-faint-foreground">
                    {entry.scoredCount > 0
                      ? `Ø ${formatAvg(entry.points / entry.scoredCount)} b./zápas`
                      : "Zatím bez odehraného zápasu"}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-muted-foreground">
            Celkový žebříček
          </h2>
          {/* Přepínač řazení (14.9.2026, na žádost uživatele) -- odkazy,
           * ne klientský přepínač, appka zůstává server-rendered a
           * zvolené řazení jde poslat/uložit jako odkaz. Výchozí
           * (bez parametru) zůstává "Celkem", to je pořád hlavní
           * pohled na sezónu -- "Průměr" je doplňkový, na žádost
           * uživatele nechává vidět, kdo boduje nejstabilněji i s
           * kratší historií tipů. */}
          <div className="inline-flex items-center gap-0.5 rounded-full border border-border-subtle bg-surface-hover p-0.5 text-[11px] font-bold">
            <Link
              href={`/spaces/${id}/leaderboard`}
              className={`rounded-full px-3 py-1 transition-colors ${
                sortMode === "total"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Celkem
            </Link>
            <Link
              href={`/spaces/${id}/leaderboard?sort=avg`}
              className={`rounded-full px-3 py-1 transition-colors ${
                sortMode === "avg"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Průměr
            </Link>
          </div>
        </div>

        {standings.length === 0 && (
          <p className="text-sm font-medium text-muted-foreground">
            Zatím se do soutěže nikdo nepřihlásil.
          </p>
        )}

        {standings.length > 0 && (
          <ol className="flex flex-col gap-2">
            {standings.map((entry, index) => {
              const rank = index + 1;
              const isYou = entry.userId === currentUser?.id;
              return (
                <li
                  key={entry.userId}
                  className={`flex flex-col gap-1 rounded-2xl border p-4 transition-colors ${rowToneClassName(rank, isYou)}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <RankBadge rank={rank} />
                      <Avatar url={entry.avatarUrl} name={entry.displayName} />
                      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <Link
                          href={`/profil/${entry.userId}`}
                          className="truncate font-bold hover:underline"
                        >
                          {entry.displayName}
                        </Link>
                        {isYou && (
                          <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                            Ty
                          </span>
                        )}
                        {(badgeCountByUser.get(entry.userId) ?? 0) > 0 && (
                          <span
                            title={`${badgeCountByUser.get(entry.userId)}× vítěz týdne`}
                            className="flex shrink-0 items-center gap-1 text-xs font-bold text-accent"
                          >
                            <Medal className="h-3.5 w-3.5" strokeWidth={2.2} />
                            {badgeCountByUser.get(entry.userId)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-extrabold">
                      {sortMode === "avg"
                        ? entry.scoredCount > 0
                          ? `Ø ${formatAvg(entry.totalPoints / entry.scoredCount)}`
                          : "–"
                        : `${entry.totalPoints} b.`}
                    </span>
                  </div>
                  <p className="pl-[88px] text-xs font-semibold text-faint-foreground">
                    {sortMode === "avg"
                      ? `${entry.totalPoints} b. celkem`
                      : entry.scoredCount > 0
                        ? `Ø ${formatAvg(entry.totalPoints / entry.scoredCount)} b./zápas`
                        : "Zatím bez odehraného zápasu"}
                    {" · "}
                    {entry.exactCount}× přesně
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}

function formatAvg(avg: number): string {
  return avg.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatWeekRange(weekStartIso: string, weekEndIso: string) {
  const format = (date: Date) =>
    date.toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      timeZone: "Europe/Prague",
    });
  const start = new Date(weekStartIso);
  // weekEnd je exkluzivní (příští pondělí 00:00) -- poslední den týdne je
  // o den dřív.
  const end = new Date(new Date(weekEndIso).getTime() - 24 * 60 * 60 * 1000);
  return `${format(start)} – ${format(end)}`;
}
