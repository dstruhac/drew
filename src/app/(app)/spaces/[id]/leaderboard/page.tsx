import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWeekRange } from "@/lib/week";

export default async function LeaderboardPage({
  params,
}: PageProps<"/spaces/[id]/leaderboard">) {
  const { id } = await params;
  const supabase = await createClient();

  // Pět nezávislých dotazů v JEDNÉ vlně -- všechny filtrují rovnou podle
  // `id` z route parametru, žádný nepotřebuje výsledek jiného.
  //
  // Tipy (predictions) se dřív načítaly až v druhé vlně, protože se
  // filtrovaly seznamem ID zápasů z první -- teď se filtrují přes
  // napojenou tabulku zápasů, takže na nic čekat nemusí a ušetří se celé
  // jedno kolo čekání na databázi (perf analýza 28.8.2026).
  const [
    { data: competition },
    { data: participants },
    { data: matches },
    { data: badges },
    { data: predictions },
  ] = await Promise.all([
    supabase.from("competitions").select("id, name").eq("id", id).single(),
    supabase
      .from("competition_participants")
      .select("user_id, profiles(display_name)")
      .eq("competition_id", id),
    supabase
      .from("matches")
      .select("id, kickoff_at, home_score, away_score")
      .eq("competition_id", id),
    supabase.from("weekly_badges").select("user_id").eq("competition_id", id),
    supabase
      .from("predictions")
      .select(
        "match_id, user_id, points, predicted_home_score, predicted_away_score, profiles(display_name), matches!inner(competition_id)",
      )
      .eq("matches.competition_id", id),
  ]);

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
      totalPoints: 0,
      scoredCount: 0,
      predictionCount: 0,
      exactCount: 0,
    });
  }

  // Živý týdenní žebříček (rozpracovaný aktuální týden, po-ne pražského
  // času) -- žádná nová tabulka, jen filtr zápasů podle kickoff_at. Sám se
  // "vynuluje" v pondělí, protože se pak počítá z nového (prázdného) okna
  // -- odsouhlaseno s uživatelem 27.8.2026.
  const { weekStart, weekEnd } = getCurrentWeekRange();
  const weekMatchIds = new Set(
    (matches ?? [])
      .filter((m) => m.kickoff_at >= weekStart && m.kickoff_at < weekEnd)
      .map((m) => m.id),
  );
  const weeklyPointsByUser = new Map<string, number>();
  for (const participant of participants ?? []) {
    weeklyPointsByUser.set(participant.user_id, 0);
  }

  for (const prediction of predictions ?? []) {
    const displayName = prediction.profiles?.display_name ?? "Neznámý hráč";
    const entry = totalsByUser.get(prediction.user_id) ?? {
      userId: prediction.user_id,
      displayName,
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

    if (prediction.points !== null && weekMatchIds.has(prediction.match_id)) {
      weeklyPointsByUser.set(
        prediction.user_id,
        (weeklyPointsByUser.get(prediction.user_id) ?? 0) + prediction.points,
      );
    }
  }

  const standings = [...totalsByUser.values()].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      a.displayName.localeCompare(b.displayName, "cs"),
  );

  const weeklyStandings = [...weeklyPointsByUser.entries()]
    .map(([userId, points]) => ({
      userId,
      displayName: totalsByUser.get(userId)?.displayName ?? "Neznámý hráč",
      points,
    }))
    .sort(
      (a, b) =>
        b.points - a.points || a.displayName.localeCompare(b.displayName, "cs"),
    );

  const weekRangeLabel = formatWeekRange(weekStart, weekEnd);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <header>
        <Link
          href={`/spaces/${id}`}
          className="text-xs text-black/40 dark:text-white/40 transition-colors hover:text-black/70 hover:underline dark:hover:text-white/70"
        >
          ← {competition.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Žebříček</h1>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">
          Celkový žebříček
        </h2>

        {standings.length === 0 && (
          <p className="text-sm text-black/60 dark:text-white/60">
            Zatím se do soutěže nikdo nepřihlásil.
          </p>
        )}

        {standings.length > 0 && (
          <ol className="flex flex-col gap-2">
            {standings.map((entry, index) => (
              <li
                key={entry.userId}
                className="flex items-center justify-between rounded-lg border border-black/10 dark:border-white/15 p-4"
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
                  {(badgeCountByUser.get(entry.userId) ?? 0) > 0 && (
                    <span
                      title={`${badgeCountByUser.get(entry.userId)}× vítěz týdne`}
                      className="text-xs text-black/60 dark:text-white/60"
                    >
                      🏅 {badgeCountByUser.get(entry.userId)}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-semibold">{entry.totalPoints} b.</span>
                  <p className="text-xs text-black/40 dark:text-white/40">
                    {entry.scoredCount} z {entry.predictionCount} zápasů vyhodnoceno
                    {" · "}
                    {entry.exactCount}× přesně
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">
            Týdenní žebříček
          </h2>
          <p className="text-xs text-black/40 dark:text-white/40">
            {weekRangeLabel} — vynuluje se po předání medaile na začátku dalšího týdne
          </p>
        </div>

        {weekMatchIds.size === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            V tomhle týdnu se zatím nehrálo.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {weeklyStandings.map((entry, index) => (
              <li
                key={entry.userId}
                className="flex items-center justify-between rounded-lg border border-black/10 dark:border-white/15 p-4"
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
                <span className="font-semibold">{entry.points} b.</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
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
