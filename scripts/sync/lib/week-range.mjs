// Hranice PŘEDCHOZÍHO úplného kalendářního týdne (pondělí 00:00 --
// následující pondělí 00:00, pražský čas) vzhledem k referenceDate.
//
// Úloha award-weekly-badges běží v pondělí ráno a má vyhodnotit týden,
// který právě skončil -- ne rozpracovaný aktuální týden. Díky tomu, že
// se počítá "předchozí" týden vůči libovolnému referenceDate, dává
// správný (o týden starší) výsledek i při ručním spuštění uprostřed
// týdne, ne jen v pondělí.
//
// Sdílí pragueWallTimeToUtcIso ze scrape-livesport.mjs, aby se stejná
// (už otestovaná) logika letního/zimního času neduplikovala.

import { pragueWallTimeToUtcIso } from "./scrape-livesport.mjs";

// Hranice kalendářního dne (00:00 -- příští den 00:00, pražský čas)
// vzhledem k referenceDate, posunutého o `dayOffset` kalendářních dní.
// Používá predict-reminders pro "zápasy dnešního dne, na které ještě
// nemám tip" (dayOffset 0, výchozí) a random-league pro "zápasy
// ZÍTŘEJŠÍHO dne" (dayOffset 1 -- úloha běží večer předchozího dne, ať
// jde zápasy Náhodné ligy tipovat dopředu). Stejný Intl trik jako
// getPreviousWeekRange výše, jen pro den místo týdne.
export function getTodayRange(referenceDate = new Date(), dayOffset = 0) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const baseYear = get("year");
  const baseMonth = get("month");
  const baseDay = get("day");

  // Posun o celé kalendářní dny (ne o čas) -- počítáno na UTC datu bez
  // hodiny, ať to nezávisí na tom, v kolik hodin referenceDate je.
  const target = new Date(Date.UTC(baseYear, baseMonth - 1, baseDay) + dayOffset * 86400000);
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  const day = target.getUTCDate();

  const todayStart = pragueWallTimeToUtcIso(year, month, day, 0, 0);

  const tomorrowMidnightUtcCalendar = new Date(Date.UTC(year, month - 1, day) + 86400000);
  const todayEnd = pragueWallTimeToUtcIso(
    tomorrowMidnightUtcCalendar.getUTCFullYear(),
    tomorrowMidnightUtcCalendar.getUTCMonth() + 1,
    tomorrowMidnightUtcCalendar.getUTCDate(),
    0,
    0,
  );

  const dateString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { dateString, todayStart, todayEnd };
}

export function getPreviousWeekRange(referenceDate = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(referenceDate);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const year = get("year");
  const month = get("month");
  const day = get("day");

  // Den v týdnu je čistě kalendářní údaj (nezávisí na čase ani pásmu) --
  // 0 = neděle .. 6 = sobota.
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;

  const thisMondayMs = Date.UTC(year, month - 1, day) - daysSinceMonday * 86400000;
  const prevMondayMs = thisMondayMs - 7 * 86400000;

  const thisMonday = new Date(thisMondayMs);
  const prevMonday = new Date(prevMondayMs);

  const weekStartDate = prevMonday.toISOString().slice(0, 10);

  return {
    // Kalendářní datum pondělí (pro unikátní klíč weekly_badges.week_start).
    weekStartDate,
    // Skutečné hranice (UTC, pro dotaz na kickoff_at) -- weekEnd je
    // vyloučený konec (exkluzivní horní mez).
    weekStart: pragueWallTimeToUtcIso(
      prevMonday.getUTCFullYear(),
      prevMonday.getUTCMonth() + 1,
      prevMonday.getUTCDate(),
      0,
      0,
    ),
    weekEnd: pragueWallTimeToUtcIso(
      thisMonday.getUTCFullYear(),
      thisMonday.getUTCMonth() + 1,
      thisMonday.getUTCDate(),
      0,
      0,
    ),
  };
}
