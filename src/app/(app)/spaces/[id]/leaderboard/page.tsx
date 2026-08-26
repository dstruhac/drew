import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LeaderboardPage({
  params,
}: PageProps<"/spaces/[id]/leaderboard">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: competition } = await supabase
    .from("competitions")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!competition) {
    notFound();
  }

  const { data: matches } = await supabase
    .from("matches")
    .select("id")
    .eq("competition_id", id);

  const matchIds = matches?.map((m) => m.id) ?? [];
  const { data: predictions } = matchIds.length
    ? await supabase
        .from("predictions")
        .select("user_id, points, profiles(display_name)")
        .in("match_id", matchIds)
    : { data: [] };

  const totalsByUser = new Map<
    string,
    {
      userId: string;
      displayName: string;
      totalPoints: number;
      scoredCount: number;
      predictionCount: number;
    }
  >();

  for (const prediction of predictions ?? []) {
    const displayName = prediction.profiles?.display_name ?? "Neznámý hráč";
    const entry = totalsByUser.get(prediction.user_id) ?? {
      userId: prediction.user_id,
      displayName,
      totalPoints: 0,
      scoredCount: 0,
      predictionCount: 0,
    };
    entry.predictionCount += 1;
    if (prediction.points !== null) {
      entry.totalPoints += prediction.points;
      entry.scoredCount += 1;
    }
    totalsByUser.set(prediction.user_id, entry);
  }

  const standings = [...totalsByUser.values()].sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      a.displayName.localeCompare(b.displayName, "cs"),
  );

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <Link
          href={`/spaces/${id}`}
          className="text-xs text-black/40 dark:text-white/40 hover:underline"
        >
          ← {competition.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Žebříček</h1>
      </header>

      {standings.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Zatím tu nejsou žádné tipy.
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
                <span className="font-medium">{entry.displayName}</span>
              </div>
              <div className="text-right">
                <span className="font-semibold">{entry.totalPoints} b.</span>
                <p className="text-xs text-black/40 dark:text-white/40">
                  {entry.scoredCount} z {entry.predictionCount} zápasů vyhodnoceno
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
