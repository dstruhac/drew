import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import type { CompetitionSport } from "@/lib/supabase/database.types";
import { sportAccentStyle } from "@/lib/sport";
import { joinCompetition } from "@/app/(app)/spaces/[id]/actions";

const SPORT_LABELS: Record<CompetitionSport, string> = {
  hockey: "Hokej",
  football: "Fotbal",
  mixed: "Mix",
};

// Sdíleno mezi /spaces (přehled všech soutěží) a Dashboardem
// (dashboard/page.tsx, 29.8.2026) -- původně žilo jen na /spaces,
// stejný vizuál, jen jiný zdrojový seznam soutěží.
//
// Karta samotná byla dřív jeden velký <Link> -- kvůli tlačítku "Chci
// hrát" přímo na kartě (6.9.2026, na žádost uživatele: appka dřív
// nutila nejdřív otevřít detail soutěže) je teď <Link> jen kolem
// klikatelného obsahu (logo/název/pozice), tlačítko je vedle něj jako
// samostatný <form> -- vnořit <form> do <a> není platné HTML a
// v prohlížeči by se rozjelo nepředvídatelně.
export function CompetitionCard({
  competition,
  rank,
  allCaughtUp = false,
  isJoined,
  linkToDetail = true,
  showLogo = true,
}: {
  competition: {
    id: string;
    name: string;
    sport: CompetitionSport;
    logo_url: string | null;
    description: string | null;
  };
  rank: { rank: number; total: number } | null;
  /** Hráč má natipováno úplně vše, co jde aktuálně (v okně
   * nadcházejících zápasů) natipovat -- viz UPCOMING_WINDOW_DAYS.
   * Nastavuje se jen pro soutěže, které hráč hraje (viz volající). */
  allCaughtUp?: boolean;
  /** `false` zobrazí tlačítko "Chci hrát" přímo na kartě. `undefined`
   * (výchozí, používá Dashboard) tlačítko nikdy nezobrazí -- Dashboard
   * posílá jen soutěže, které hráč už hraje, takže se tam nehodí. */
  isJoined?: boolean;
  /** `false` vypne proklik na detail soutěže i odkaz "Otevřít" --
   * použito v JoinCompetitionsModal (10.9.2026), kde je jedinou
   * nabízenou akcí "Chci hrát" a proklik pryč by modal jen opustil. */
  linkToDetail?: boolean;
  /** `false` skryje logo (chip nahoře) -- použito v
   * JoinCompetitionsModal (11.9.2026, na žádost uživatele), kde je
   * kartiček víc vedle sebe v mřížce a logo je zbytečně zvyšovalo. */
  showLogo?: boolean;
}) {
  const content = (
    <>
      {showLogo && (
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white">
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
      )}

      <div className="flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="font-bold">{competition.name}</span>
          <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {SPORT_LABELS[competition.sport]}
          </span>
        </div>
        {rank ? (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
            {rank.rank === 1 && <Trophy className="h-3.5 w-3.5" strokeWidth={2} />}
            {rank.rank}. místo z {rank.total}
          </p>
        ) : (
          <p className="mt-2 text-[13px] font-semibold text-faint-foreground">
            Ještě nehraješ
          </p>
        )}
        {allCaughtUp && (
          <span className="mt-1.5 inline-block rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">
            Vše natipováno
          </span>
        )}
        {competition.description && (
          <p className="mt-1 text-xs text-faint-foreground">{competition.description}</p>
        )}
      </div>

      {linkToDetail && (
        <div className="flex items-center justify-between text-xs font-bold text-accent">
          Otevřít
          <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
        </div>
      )}
    </>
  );

  return (
    <div
      style={sportAccentStyle(competition.sport)}
      className="card-lift flex h-full flex-col gap-4 rounded-[22px] border border-border-subtle bg-surface p-5 shadow-[var(--shadow-card)]"
    >
      {linkToDetail ? (
        <Link href={`/spaces/${competition.id}`} className="flex flex-1 flex-col gap-4">
          {content}
        </Link>
      ) : (
        <div className="flex flex-1 flex-col gap-4">{content}</div>
      )}

      {isJoined === false && (
        <form action={joinCompetition.bind(null, competition.id)}>
          <button
            type="submit"
            className="btn-press w-full rounded-full bg-accent px-4 py-2 text-xs font-bold text-accent-foreground hover:opacity-90"
          >
            Chci hrát
          </button>
        </form>
      )}
    </div>
  );
}
