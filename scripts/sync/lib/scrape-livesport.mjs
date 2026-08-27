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

export function parseScore(text) {
  const t = (text || "").trim();
  if (!t || t === "-") return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

// Převede "wall clock" čas v Europe/Prague na správný UTC ISO řetězec —
// počítá s letním/zimním časem přes vestavěný Intl (formatToParts trik),
// bez závislosti na externí knihovně na časová pásma.
//
// Offset se zjišťuje z POLEDNE daného kalendářního dne, ne z přesné
// zadané hodiny — jinak by šel o hodinu vedle přesně v ranních hodinách
// dne přechodu na letní/zimní čas (kdy naivní odhad zjišťovaný přímo z
// hour/minute může spadnout na druhou stranu přechodu). Přechody v
// Evropě jsou vždy brzy ráno (1–3h), poledne je od nich vždy bezpečně
// mimo — a sportovní zápasy se v tu dobu nehrají, takže tohle appce
// pro reálná data stačí.
export function pragueWallTimeToUtcIso(year, month, day, hour, minute) {
  const noonUtcMs = Date.UTC(year, month - 1, day, 12, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(noonUtcMs).map((p) => [p.type, p.value]));
  const offsetMinutes = Number(parts.hour) * 60 + Number(parts.minute) - 12 * 60;
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  return new Date(naiveUtcMs - offsetMinutes * 60 * 1000).toISOString();
}

// "29.08. 15:00" neobsahuje rok — dopočítá se podle dnešního data: když
// by vyšlo datum víc než ~2 měsíce v minulosti, jde o zápas dalšího
// roku (řeší přechod sezóny přes Nový rok, např. leden 2027).
export function inferYear(month, day, hour, minute, referenceDate) {
  let year = referenceDate.getUTCFullYear();
  const candidateMs = Date.UTC(year, month - 1, day, hour, minute);
  const twoMonthsMs = 60 * 24 * 60 * 60 * 1000;
  if (candidateMs < referenceDate.getTime() - twoMonthsMs) year += 1;
  return year;
}

// Sdílené jádro pro obě stránky livesport.cz (rozpis "/program/" i
// výsledky "/vysledky/") — obě mají stejné selektory, liší se jen URL a
// tím, co je pro danou stránku "platný" záznam (rozpis potřebuje platné
// datum výkopu, výsledky potřebují jen skóre — viz volající funkce níže).
async function scrapeLivesportRaw(scrapePath, urlSuffix) {
  const url = `https://www.livesport.cz/${scrapePath}/${urlSuffix}/`;
  const browser = await chromium.launch();

  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
      // livesport.cz zobrazuje čas výkopu podle časového pásma
      // PROHLÍŽEČE (auto-detekce), ne pevně podle Prahy -- bez tohohle
      // by na GitHub Actions runneru (běží v UTC) web ukazoval časy v
      // UTC, ale pragueWallTimeToUtcIso níže by je stejně převáděl,
      // jako by šlo o pražský čas. Výsledek: uložený kickoff_at byl
      // systematicky o 2h posunutý (a zobrazení v appce bez explicitní
      // časové zóny přidalo další 2h -- dohromady 4h chyba, reálně
      // objeveno 27.8.2026 po prvním ostrém importu hokejových zápasů).
      timezoneId: "Europe/Prague",
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    return await page.$$eval(".event__match", (els) =>
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
  } finally {
    await browser.close();
  }
}

function parseKickoffAt(dateTimeText, referenceDate) {
  if (!dateTimeText) return null;
  const m = dateTimeText.match(/^(\d{1,2})\.(\d{1,2})\.\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null; // nerozpoznaný formát (např. běžící minuta u živého zápasu)
  const [, dayStr, monthStr, hourStr, minuteStr] = m;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const year = inferYear(month, day, hour, minute, referenceDate);
  return pragueWallTimeToUtcIso(year, month, day, hour, minute);
}

export async function scrapeLivesportFixtures(scrapePath, { referenceDate = new Date() } = {}) {
  const raw = await scrapeLivesportRaw(scrapePath, "program");

  return raw
    .filter((r) => r.externalId && r.dateTimeText && r.homeTeam && r.awayTeam)
    .map((r) => ({
      externalId: r.externalId,
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      // Nerozpoznané datum necháme jako null — validace to odchytí
      // místo tichého zapsání špatného data.
      kickoffAt: parseKickoffAt(r.dateTimeText, referenceDate),
      homeScore: parseScore(r.homeScoreText),
      awayScore: parseScore(r.awayScoreText),
    }));
}

// Stránka "/vysledky/" — na rozdíl od rozpisu nepotřebujeme platné datum
// výkopu (sync-results zápas jen dohledá podle external_id a doplní
// skóre), takže se tu datum nevyžaduje. Díky tomu nevadí ani živě
// probíhající zápas, u kterého livesport místo data zobrazuje běžící
// minutu — takový záznam prostě projde s kickoffAt: null a bez skóre se
// stejně nepoužije (viz results.mjs, který bere jen záznamy s vyplněným
// skóre obou týmů).
export async function scrapeLivesportResults(scrapePath, { referenceDate = new Date() } = {}) {
  const raw = await scrapeLivesportRaw(scrapePath, "vysledky");

  return raw
    .filter((r) => r.externalId && r.homeTeam && r.awayTeam)
    .map((r) => ({
      externalId: r.externalId,
      homeTeam: r.homeTeam,
      awayTeam: r.awayTeam,
      kickoffAt: parseKickoffAt(r.dateTimeText, referenceDate),
      homeScore: parseScore(r.homeScoreText),
      awayScore: parseScore(r.awayScoreText),
    }));
}
