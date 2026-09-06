// Kolik dní dopředu appka ukazuje nadcházející zápasy (6.9.2026, na
// žádost uživatele -- appka jich předtím měla najednou příliš mnoho a
// mátlo ho to). Musí sedět s WINDOW_DAYS ve scripts/sync/fixtures.mjs.
// Sdíleno mezi /spaces/[id] (kde se limit vynucuje), /spaces a
// dashboard (kde se stejný limit používá jen k výpočtu, jestli má
// hráč u dané soutěže "vše natipováno" -- viz CompetitionCard).
export const UPCOMING_WINDOW_DAYS = 7;

export function upcomingWindowEndIso(): string {
  return new Date(Date.now() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
