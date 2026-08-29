import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import type { Sport } from "@/lib/supabase/database.types";

const SPORT_LABELS: Record<Sport, string> = {
  hockey: "Hokej",
  football: "Fotbal",
};

// Sdíleno mezi /spaces (přehled všech soutěží) a Dashboardem
// (dashboard/page.tsx, 29.8.2026) -- původně žilo jen na /spaces,
// stejný vizuál, jen jiný zdrojový seznam soutěží.
export function CompetitionCard({
  competition,
  rank,
}: {
  competition: {
    id: string;
    name: string;
    sport: Sport;
    logo_url: string | null;
    points_exact: number;
    points_winner: number;
    points_total_goals: number;
  };
  rank: { rank: number; total: number } | null;
}) {
  return (
    <Link
      href={`/spaces/${competition.id}`}
      className="card-lift flex h-full flex-col gap-4 rounded-[22px] border border-border-subtle bg-surface p-5 shadow-[var(--shadow-card)]"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10">
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

      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="font-bold">{competition.name}</span>
          <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {SPORT_LABELS[competition.sport]}
          </span>
        </div>
        {rank ? (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
            <Trophy className="h-3.5 w-3.5" strokeWidth={2} />
            {rank.rank}. místo z {rank.total}
          </p>
        ) : (
          <p className="mt-2 text-[13px] font-semibold text-faint-foreground">
            Ještě nehraješ
          </p>
        )}
        <p className="mt-1 text-xs text-faint-foreground">
          Body za přesný tip {competition.points_exact} · za vítěze{" "}
          {competition.points_winner} · za góly celkem{" "}
          {competition.points_total_goals}
        </p>
      </div>

      <div className="flex items-center justify-between text-xs font-bold text-accent">
        Otevřít
        <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
      </div>
    </Link>
  );
}
