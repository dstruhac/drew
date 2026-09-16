import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { CompetitionCard } from "@/components/competition-card";
import { throwIfSupabaseError } from "@/lib/supabase/errors";

// Přehled hecovaček (soukromých soutěží) -- RLS (competitions_select_visible,
// viz 20260914090000_competitions_hecovacky.sql) sama zaručuje, že se
// tu ukážou jen ty, co uživatel založil nebo do kterých byl pozván;
// appka proto nemusí filtr opakovat, jen se ptá na visibility='private'
// jako doplňkový popisek dotazu.
export default async function HecovackyPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const { data: competitions, error } = await supabase
    .from("competitions")
    .select("id, name, sport, logo_url, description")
    .eq("visibility", "private")
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error, "Načtení hecovaček");

  const competitionIds = competitions?.map((c) => c.id) ?? [];

  const [participantsResult, predictionsResult] = await Promise.all([
    competitionIds.length
      ? supabase
          .from("competition_participants")
          .select("competition_id, user_id, profiles!user_id(display_name)")
          .in("competition_id", competitionIds)
      : Promise.resolve({ data: [], error: null }),
    competitionIds.length
      ? supabase
          .from("predictions")
          .select("user_id, points, matches!inner(competition_id)")
          .in("matches.competition_id", competitionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  throwIfSupabaseError(participantsResult.error ?? null, "Načtení hráčů hecovaček");
  throwIfSupabaseError(predictionsResult.error ?? null, "Načtení tipů pro žebříčky hecovaček");

  // Stejný výpočet celkového pořadí jako na /spaces (jen zúžený na
  // soukromé soutěže) -- viz spaces/page.tsx pro vysvětlení.
  const standingsByCompetition = new Map<
    string,
    { userId: string; displayName: string; totalPoints: number }[]
  >();
  for (const participant of participantsResult.data ?? []) {
    const list = standingsByCompetition.get(participant.competition_id) ?? [];
    list.push({
      userId: participant.user_id,
      displayName: participant.profiles?.display_name ?? "Neznámý hráč",
      totalPoints: 0,
    });
    standingsByCompetition.set(participant.competition_id, list);
  }
  for (const prediction of predictionsResult.data ?? []) {
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
      rankByCompetition.set(competitionId, { rank: index + 1, total: standings.length });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 sm:max-w-5xl sm:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="text-xs font-bold text-faint-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Hecovačky</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Soukromé sázky mezi kamarády -- vidí je jen ti, koho pozveš.
          </p>
        </div>
        <Link
          href="/hecovacky/nova"
          className="btn-press h-fit rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90"
        >
          + Založit hecovačku
        </Link>
      </header>

      {competitions?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Zatím žádnou hecovačku nemáš. Založ první, nebo počkej na pozvánku od kamaráda.
        </p>
      )}

      {competitions && competitions.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitions.map((competition) => (
            <li key={competition.id}>
              <CompetitionCard
                competition={competition}
                rank={rankByCompetition.get(competition.id) ?? null}
                isStake
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
