export type StandingEntry = { userId: string; displayName: string; totalPoints: number };

// Standardní "sportovní" řazení s remízami (1, 1, 3 -- ne 1, 1, 2): dva
// hráči se stejným počtem bodů sdílí stejné umístění, další hráč pak
// přeskakuje o tolik míst, kolik jich zabrali. Stejný princip appka už
// používá u weekly_badges ("remíza = víc vítězů"). `standings` musí být
// předem seřazené sestupně podle totalPoints.
//
// Sdíleno mezi HecovackaResultsCard (pódium 1.-3. místa na /spaces/[id])
// a kartičkami na /hecovacky + Dashboardu (jen jméno vítěze, uživatel
// 21.9.2026 chtěl vítěze vidět i tam, ne až po prokliknutí).
export function groupStandingsByRank(standings: StandingEntry[]) {
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

// Jména hráčů na 1. místě -- víc jmen při remíze. Appka je používá na
// kartičce skončené hecovačky (/hecovacky, Dashboard).
export function topWinnerNames(standings: StandingEntry[]): string[] {
  const groups = groupStandingsByRank(standings);
  return groups[0]?.players.map((p) => p.displayName) ?? [];
}
