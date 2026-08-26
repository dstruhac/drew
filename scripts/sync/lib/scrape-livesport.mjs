// Scraper pro livesport.cz (Flashscore) — /program/ stránka ligy.
// Struktura jednoho zápasu ověřená ručně přes playwright-probe:
//
// <div id="g_1_<id>" class="event__match ...">
//   <span class="event__stageTime ..."><span class="... wcl-dateContent_eEChT">29.08. 15:00</span></span>
//   <div class="... event__homeParticipant ..."><span class="... wcl-name_jjfMf">Bohemians</span></div>
//   <div class="... event__awayParticipant ..."><span class="... wcl-name_jjfMf">Mladá Boleslav</span></div>
//   <span class="... event__score--home ...">-</span>
//   <span class="... event__score--away ...">-</span>
// </div>
//
// Pokud livesport.cz předělá layout, tyhle selektory přestanou sedět a
// $$eval prostě nic (nebo nesmysl) nenajde — proto validate-fixtures.mjs
// kontroluje počet/tvar výsledků, než se cokoliv zapíše do databáze.

import { chromium } from "playwright";

function parseScore(text) {
  const t = (text || "").trim();
  if (!t || t === "-") return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

// Převede "wall clock" čas v Europe/Prague na správný UTC ISO řetězec —
// počítá s letním/zimním časem přes vestavěný Intl (formatToParts trik),
// bez závislosti na externí knihovně na časová pásma.
function pragueWallTimeToUtcIso(year, month, day, hour, minute) {
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(naiveUtcMs).map((p) => [p.type, p.value]));
  const asIfUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  const offsetMs = asIfUtcMs - naiveUtcMs;
  return new Date(naiveUtcMs - offsetMs).toISOString();
}

// "29.08. 15:00" neobsahuje rok — dopočítá se podle dnešního data: když
// by vyšlo datum víc než ~2 měsíce v minulosti, jde o zápas dalšího
// roku (řeší přechod sezóny přes Nový rok, např. leden 2027).
function inferYear(month, day, hour, minute, referenceDate) {
  let year = referenceDate.getUTCFullYear();
  const candidateMs = Date.UTC(year, month - 1, day, hour, minute);
  const twoMonthsMs = 60 * 24 * 60 * 60 * 1000;
  if (candidateMs < referenceDate.getTime() - twoMonthsMs) year += 1;
  return year;
}

export async function scrapeLivesportFixtures(scrapePath, { referenceDate = new Date() } = {}) {
  const url = `https://www.livesport.cz/${scrapePath}/program/`;
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    const raw = await page.$$eval(".event__match", (els) =>
      els.map((el) => ({
        externalId: el.id || null,
        dateTimeText:
          el.querySelector(".event__stageTime .wcl-dateContent_eEChT")?.textContent.trim() || null,
        homeTeam:
          el.querySelector(".event__homeParticipant .wcl-name_jjfMf")?.textContent.trim() || null,
        awayTeam:
          el.querySelector(".event__awayParticipant .wcl-name_jjfMf")?.textContent.trim() || null,
        homeScoreText: el.querySelector(".event__score--home")?.textContent.trim() || null,
        awayScoreText: el.querySelector(".event__score--away")?.textContent.trim() || null,
      })),
    );

    return raw
      .filter((r) => r.externalId && r.dateTimeText && r.homeTeam && r.awayTeam)
      .map((r) => {
        const m = r.dateTimeText.match(/^(\d{1,2})\.(\d{1,2})\.\s+(\d{1,2}):(\d{2})$/);
        if (!m) {
          // Nerozpoznaný formát data — necháme kickoffAt null, validace
          // to odchytí místo tichého zapsání špatného data.
          return { externalId: r.externalId, homeTeam: r.homeTeam, awayTeam: r.awayTeam, kickoffAt: null, homeScore: null, awayScore: null };
        }
        const [, dayStr, monthStr, hourStr, minuteStr] = m;
        const day = Number(dayStr);
        const month = Number(monthStr);
        const hour = Number(hourStr);
        const minute = Number(minuteStr);
        const year = inferYear(month, day, hour, minute, referenceDate);
        return {
          externalId: r.externalId,
          homeTeam: r.homeTeam,
          awayTeam: r.awayTeam,
          kickoffAt: pragueWallTimeToUtcIso(year, month, day, hour, minute),
          homeScore: parseScore(r.homeScoreText),
          awayScore: parseScore(r.awayScoreText),
        };
      });
  } finally {
    await browser.close();
  }
}
