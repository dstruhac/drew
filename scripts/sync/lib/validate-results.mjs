// Kontrola rozumnosti výsledků, než se zapíšou do databáze — stejný
// důvod jako u validate-fixtures.mjs (web může kdykoliv změnit layout).
// Na rozdíl od rozpisu se neřeší min/max počet: volající už předem
// vybírá jen zápasy se skóre, takže "0 nalezeno" jen znamená "zatím
// žádný z nich nemá výsledek" a není to chyba.
//
// kickoff_at SE kontroluje (na rozdíl od dřívější verze) — results.mjs
// teď umí i zakládat úplně nové řádky (zápas, který v databázi ještě
// vůbec neexistuje, typicky zpětné dotažení zápasů z doby předtím, než
// appka danou soutěž začala sledovat), a nový řádek bez kickoff_at by
// spadl na NOT NULL constraint v databázi.
//
// requireKickoffAt: false se používá pro živě probíhající zápasy
// (scrapeLivesportLiveMatches) — ty se v databázi jen UPDATEují podle
// external_id (nikdy nezakládají nový řádek, viz results.mjs), takže
// kickoff_at u nich validovat nemá smysl -- livesport.cz ho navíc u
// živého zápasu vůbec nevrací (místo data ukazuje běžící minutu).

export function validateResults(matches, { requireKickoffAt = true } = {}) {
  const errors = [];

  const seenIds = new Set();
  for (const [i, m] of matches.entries()) {
    const where = `zápas #${i + 1} (${m.externalId ?? "bez id"})`;
    if (!m.externalId) errors.push(`${where}: chybí external_id`);
    else if (seenIds.has(m.externalId)) errors.push(`${where}: duplicitní external_id`);
    else seenIds.add(m.externalId);

    if (!m.homeTeam || !m.homeTeam.trim()) errors.push(`${where}: chybí jméno domácího týmu`);
    if (!m.awayTeam || !m.awayTeam.trim()) errors.push(`${where}: chybí jméno hostujícího týmu`);
    if (m.homeTeam && m.awayTeam && m.homeTeam === m.awayTeam) {
      errors.push(`${where}: domácí a hosté vyšli stejně ("${m.homeTeam}") — parser je asi rozbitý`);
    }

    if (requireKickoffAt && (!m.kickoffAt || Number.isNaN(new Date(m.kickoffAt).getTime()))) {
      errors.push(`${where}: neplatný kickoff_at ("${m.kickoffAt}")`);
    }

    if (!Number.isInteger(m.homeScore) || m.homeScore < 0) {
      errors.push(`${where}: neplatné skóre domácích (${m.homeScore})`);
    }
    if (!Number.isInteger(m.awayScore) || m.awayScore < 0) {
      errors.push(`${where}: neplatné skóre hostů (${m.awayScore})`);
    }
  }

  return { ok: errors.length === 0, errors };
}
