import Link from "next/link";
import { Clock } from "lucide-react";
import { PredictionForm } from "@/app/(app)/spaces/[id]/prediction-form";
import { formatRelativeKickoff } from "@/lib/format-kickoff";

// Sdíleno mezi detailem soutěže (spaces/[id]/page.tsx) a Dashboardem
// (dashboard/page.tsx, 29.8.2026) -- původně žilo jen v detailu
// soutěže, přesunuto sem, aby ho Dashboard mohl použít napříč všemi
// soutěžemi hráče, ne jen jednou.

export type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: "scheduled" | "live" | "finished" | "postponed";
  home_score: number | null;
  away_score: number | null;
};

export function TeamLogo({ url }: { url: string | undefined }) {
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-4 w-4 shrink-0 rounded-sm bg-white object-contain p-0.5" />
  );
}

export function TeamBadge({ url, name }: { url: string | undefined; name: string }) {
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
export function SpotlightMatchCard({
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
          })}
          {" · "}
          <span className="font-bold text-accent">
            {formatRelativeKickoff(match.kickoff_at)}
          </span>
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
