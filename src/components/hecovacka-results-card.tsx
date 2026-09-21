import Link from "next/link";
import { Trophy, Crown } from "lucide-react";
import { sportAccentStyle } from "@/lib/sport";

export type StandingEntry = { userId: string; displayName: string; totalPoints: number };

const MEDAL_BADGE: Record<number, string> = {
  1: "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-[0_0_0_3px_rgba(251,191,36,0.35)]",
  2: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900",
  3: "bg-gradient-to-br from-orange-300 to-orange-600 text-orange-950",
};

// Standardní "sportovní" řazení s remízami (1, 1, 3 -- ne 1, 1, 2): dva
// hráči se stejným počtem bodů sdílí stejné umístění, další hráč pak
// přeskakuje o tolik míst, kolik jich zabrali. Stejný princip appka už
// používá u weekly_badges ("remíza = víc vítězů").
function groupByRank(standings: StandingEntry[]) {
  const groups: { rank: number; points: number; players: StandingEntry[] }[] = [];
  let i = 0;
  while (i < standings.length) {
    const points = standings[i].totalPoints;
    const players: StandingEntry[] = [];
    while (i < standings.length && standings[i].totalPoints === points) {
      players.push(standings[i]);
      i++;
    }
    const rank = groups.reduce((sum, g) => sum + g.players.length, 0) + 1;
    groups.push({ rank, points, players });
  }
  return groups;
}

// Vyhodnocení skončené hecovačky (visibility='private', status='archived')
// -- nahrazuje na /spaces/[id] týdenní žebříček a sekci "Nadcházející",
// obě pro jednorázovou uzavřenou soutěž beze smyslu (uživatel 21.9.2026:
// appka po konci hecovačky nedělala vůbec nic jinak -- chtěl ji
// "zakonzervovat" a vítěze pěkně vyhodnotit). Vizuál recykluje "hero"
// tmavou kartu ze SpotlightMatchCard -- appka na týhle stránce už tenhle
// vzhled používá pro nejdůležitější obsah, ať zůstává konzistentní.
export function HecovackaResultsCard({
  standings,
  sport,
  competitionId,
}: {
  standings: StandingEntry[];
  sport: "hockey" | "football";
  competitionId: string;
}) {
  const podium = groupByRank(standings).filter((g) => g.rank <= 3);

  return (
    <div
      style={sportAccentStyle(sport)}
      className="relative overflow-hidden rounded-[26px] bg-[#15171c] p-6 sm:p-8"
    >
      <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-accent/25" />

      <div className="relative flex flex-col items-center gap-1.5 text-center">
        <Trophy className="h-8 w-8 text-amber-400" strokeWidth={2} />
        <h2 className="text-lg font-extrabold text-white">Hecovačka skončila!</h2>
        <p className="text-xs font-semibold text-white/50">Konečné pořadí</p>
      </div>

      {podium.length === 0 ? (
        <p className="relative mt-6 text-center text-sm font-semibold text-white/60">
          Nikdo se do hecovačky nezapojil.
        </p>
      ) : (
        <div className="relative mt-6 flex flex-col gap-2.5">
          {podium.flatMap((group) =>
            group.players.map((player) => (
              <div
                key={player.userId}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${MEDAL_BADGE[group.rank]}`}
                  >
                    {group.rank === 1 ? (
                      <Crown className="h-4 w-4" strokeWidth={2.6} />
                    ) : (
                      group.rank
                    )}
                  </span>
                  <Link
                    href={`/profil/${player.userId}`}
                    className="truncate font-bold text-white hover:underline"
                  >
                    {player.displayName}
                  </Link>
                </div>
                <span className="shrink-0 font-extrabold text-white">
                  {player.totalPoints} b.
                </span>
              </div>
            )),
          )}
        </div>
      )}

      <Link
        href={`/spaces/${competitionId}/leaderboard`}
        className="btn-press relative mt-5 flex items-center justify-center gap-1.5 text-xs font-bold text-accent hover:underline"
      >
        Zobrazit celý žebříček →
      </Link>
    </div>
  );
}
