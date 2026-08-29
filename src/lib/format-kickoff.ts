// Krátký, hrubý odhad "za jak dlouho" se zápas hraje -- appka záměrně
// neřeší přesné české skloňování ("den"/"dny"/"dní"), stačí orientační
// odhad. Sdílené mezi kartičkami zápasů (spaces/[id]/page.tsx) i detailem
// zápasu (spaces/[id]/matches/[matchId]/page.tsx).
export function formatRelativeKickoff(kickoffAt: string): string {
  const diffMs = new Date(kickoffAt).getTime() - Date.now();
  const diffMinutes = diffMs / 60_000;
  if (diffMinutes < 1) return "za chvíli";
  if (diffMinutes < 60) return `za ${Math.round(diffMinutes)} min`;
  const diffHours = diffMinutes / 60;
  if (diffHours < 24) return `za ${Math.round(diffHours)} h`;
  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1 ? "zítra" : `za ${diffDays} dní`;
}
