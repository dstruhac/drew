// Kontrola rozumnosti nascrapovaných zápasů, než se cokoliv zapíše do
// databáze. Cíl: když se web (layout, třídy, cokoliv) změní tak, že
// parser vrátí nesmysl nebo prázdno, chceme to hlasitě zjistit — ne
// tiše zapsat špatná/chybějící data. Když validace neprojde, volající
// nic nezapíše do databáze a zavolá notify-issue.

export function validateFixtures(matches, { minExpected, maxExpected }) {
  const errors = [];

  if (matches.length < minExpected) {
    errors.push(
      `Nalezeno jen ${matches.length} zápasů, očekáváno aspoň ${minExpected} — web možná změnil layout nebo selektor nic nenašel.`,
    );
  }
  if (matches.length > maxExpected) {
    errors.push(
      `Nalezeno ${matches.length} zápasů, což je víc než očekávaných ${maxExpected} — podezřele hodně, možná se do výběru dostalo něco navíc.`,
    );
  }

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

    if (!m.kickoffAt || Number.isNaN(new Date(m.kickoffAt).getTime())) {
      errors.push(`${where}: neplatný kickoff_at ("${m.kickoffAt}")`);
    }

    if (m.homeScore != null && (!Number.isInteger(m.homeScore) || m.homeScore < 0)) {
      errors.push(`${where}: neplatné skóre domácích (${m.homeScore})`);
    }
    if (m.awayScore != null && (!Number.isInteger(m.awayScore) || m.awayScore < 0)) {
      errors.push(`${where}: neplatné skóre hostů (${m.awayScore})`);
    }
  }

  return { ok: errors.length === 0, errors };
}
