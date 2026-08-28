// Čistá logika pro predict-reminders (upozornění e-mailem na
// nevyplněný tip) -- žádné I/O, snadno testovatelné.
//
// Pravidla (odsouhlaseno s uživatelem 28.8.2026):
// - e-mail se posílá 2 hodiny před PRVNÍM zápasem dne, na který hráč
//   ještě nemá tip -- napříč VŠEMI soutěžemi, které hraje, ne zvlášť
//   za každou
// - i když chybí tip na víc zápasů/soutěží najednou, pošle se jen
//   JEDEN souhrnný e-mail (dedup přes prediction_reminders_sent řeší
//   volající skript, ne tenhle modul)

// Pro každého hráče spočítá zápasy "dnešního dne" (matches už předem
// filtrované volajícím na dnešek + kickoff_at v budoucnosti), na které
// nemá tip -- napříč soutěžemi, ve kterých je participant.
//
// participants: [{ user_id, competition_id }]
// matches: [{ id, competition_id, home_team, away_team, kickoff_at }]
// predictions: [{ match_id, user_id }] (existující tipy, bez ohledu na obsah)
//
// Vrací Map<user_id, { matches: [...seřazeno podle kickoff_at], earliestKickoffAt }>
export function computeMissingByUser(participants, matches, predictions) {
  const matchesByCompetition = new Map();
  for (const match of matches) {
    const list = matchesByCompetition.get(match.competition_id) ?? [];
    list.push(match);
    matchesByCompetition.set(match.competition_id, list);
  }

  const predictedKeys = new Set(predictions.map((p) => `${p.match_id}:${p.user_id}`));

  const missingByUser = new Map();
  for (const participant of participants) {
    const competitionMatches = matchesByCompetition.get(participant.competition_id) ?? [];
    for (const match of competitionMatches) {
      if (predictedKeys.has(`${match.id}:${participant.user_id}`)) continue;

      const list = missingByUser.get(participant.user_id) ?? [];
      list.push(match);
      missingByUser.set(participant.user_id, list);
    }
  }

  const result = new Map();
  for (const [userId, userMatches] of missingByUser) {
    const sorted = [...userMatches].sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
    result.set(userId, { matches: sorted, earliestKickoffAt: sorted[0].kickoff_at });
  }
  return result;
}

// Je čas poslat upozornění? Ano, jakmile "teď" dosáhlo (nebo přesáhlo)
// hranici "kickoff prvního chybějícího zápasu mínus hoursBefore hodin".
// Hodinové/půlhodinové rozlišení GitHub Actions cronu znamená, že se
// pošle o něco málo POZDĚJI než přesně za hoursBefore hodin, nikdy dřív
// -- stejný kompromis jako u ostatních naplánovaných úloh v repu.
export function shouldSendNow(earliestKickoffAt, now, hoursBefore = 2) {
  const triggerAtMs = new Date(earliestKickoffAt).getTime() - hoursBefore * 60 * 60 * 1000;
  return now.getTime() >= triggerAtMs;
}

// Sestaví obsah e-mailu -- prostý text (žádné HTML), ať je to co
// nejjednodušší a čitelné i bez podpory HTML e-mailů. Odkaz vede rovnou
// na detail konkrétního zápasu, ne jen na soutěž -- o jeden klik míň.
export function buildReminderEmail(matches, appBaseUrl) {
  const lines = matches.map((m) => {
    const time = new Date(m.kickoff_at).toLocaleString("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Prague",
    });
    return `- ${time} ${m.home_team} – ${m.away_team}: ${appBaseUrl}/spaces/${m.competition_id}/matches/${m.id}`;
  });

  const subject =
    matches.length === 1
      ? "Chybí ti tip na dnešní zápas"
      : `Chybí ti tip na ${matches.length} dnešní zápasy`;

  const text = [
    "Ahoj,",
    "",
    matches.length === 1
      ? "dnes tě čeká zápas, na který ještě nemáš tip:"
      : "dnes tě čekají zápasy, na které ještě nemáš tip:",
    "",
    ...lines,
    "",
    "Ať se daří!",
  ].join("\n");

  return { subject, text };
}
