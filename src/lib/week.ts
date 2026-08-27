// Hranice AKTUÁLNÍHO (rozpracovaného) kalendářního týdne (pondělí 00:00 --
// příští pondělí 00:00, pražský čas) vzhledem k referenceDate. Používá se
// pro "živý" týdenní žebříček na /spaces/[id]/leaderboard, který se sám
// vynuluje, jakmile začne nový týden -- na rozdíl od
// scripts/sync/lib/week-range.mjs (getPreviousWeekRange), která počítá
// PŘEDCHOZÍ dokončený týden pro účely udělení medaile.
//
// pragueWallTimeToUtcIso je záměrně zkopírovaná (ne importovaná) z
// scripts/sync/lib/scrape-livesport.mjs -- ten balíček má vlastní
// package.json/závislosti (Playwright, Vitest) určené jen pro GitHub
// Actions, ne pro nasazenou Next.js appku.
function pragueWallTimeToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  const noonUtcMs = Date.UTC(year, month - 1, day, 12, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(noonUtcMs).map((p) => [p.type, p.value]),
  );
  const offsetMinutes = Number(parts.hour) * 60 + Number(parts.minute) - 12 * 60;
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(naiveUtcMs - offsetMinutes * 60 * 1000).toISOString();
}

export function getCurrentWeekRange(referenceDate: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");

  // Den v týdnu je čistě kalendářní údaj (nezávisí na čase ani pásmu) --
  // 0 = neděle .. 6 = sobota.
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;

  const thisMondayMs = Date.UTC(year, month - 1, day) - daysSinceMonday * 86400000;
  const nextMondayMs = thisMondayMs + 7 * 86400000;

  const thisMonday = new Date(thisMondayMs);
  const nextMonday = new Date(nextMondayMs);

  return {
    weekStart: pragueWallTimeToUtcIso(
      thisMonday.getUTCFullYear(),
      thisMonday.getUTCMonth() + 1,
      thisMonday.getUTCDate(),
      0,
      0,
    ),
    // Exkluzivní horní mez (pro `.lt("kickoff_at", weekEnd)`).
    weekEnd: pragueWallTimeToUtcIso(
      nextMonday.getUTCFullYear(),
      nextMonday.getUTCMonth() + 1,
      nextMonday.getUTCDate(),
      0,
      0,
    ),
  };
}
