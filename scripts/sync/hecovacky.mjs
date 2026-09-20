// Entrypoint pro hecovacky.yml. Pro každou aktivní soukromou soutěž
// (hecovačku, competitions.visibility = 'private'):
//
// 1. Vybere zápasy pro dny v klouzavém okně 7 dní dopředu (stejné
//    okno jako zbytek appky, viz UPCOMING_WINDOW_DAYS) -- appka je
//    NESCRAPUJE, jen zkopíruje z už sledovaných veřejných soutěží
//    (matches.source_match_id pamatuje originál, viz
//    20260914090100_matches_source_match_id.sql). Na rozdíl od
//    random-league.mjs appka tu proto nepotřebuje Playwright vůbec --
//    všechna data už má ve vlastní databázi. Participantovi hecovačky,
//    co na daný zápas (external_id) UŽ dřív tipoval jinde, appka rovnou
//    propíše i jeho existující tip (viz copyExistingPredictionsToNewMatches,
//    19.9.2026).
// 2. Archivuje hecovačky, kterým uplynulo end_date.
// 3. Pošle e-mail hráčům, které do hecovačky přidal někdo jiný přímo
//    (ne přes pozvánkový odkaz, tam se hráč přidává sám a vidí to
//    rovnou na obrazovce) -- "X tě přidal(a) do hecovačky Y".
//
// Kopírování SKÓRE ze zdrojových zápasů appka dřív dělala taky tady,
// ale přesunula to do sync-results.mjs (19.9.2026) -- tenhle skript
// běží jen na vlastní cron-job.org budík, který se ukázal nespolehlivý
// (přestal se spouštět 2 dny bez povšimnutí, uživatel nahlásil "výsledky
// v hecovačce se nepropisují"), zatímco sync-results.mjs běží spolehlivě
// každých 30 minut. Výběr NOVÝCH zápasů (bod 1 výše) na rychlosti
// nezáleží, tak zůstává tady na jednou denně. Viz
// lib/propagate-source-scores.mjs pro samotnou propagaci.
//
// Idempotence výběru zápasů: pokud hecovačka pro daný den v okně už
// nějaký zápas má, den se přeskočí -- výběr při překročení denního
// limitu je náhodný (odsouhlaseno s uživatelem 14.9.2026), takže
// opakované spuštění stejný den by jinak přidalo jiné zápasy navíc.
//
// Datum od (start_date, nepovinné): appka pro hecovačku nevybere
// žádný zápas dřív, než tohle datum nastane -- řeší případ, kdy si
// hráč hecovačku připraví dopředu, ale má reálně začít až později.

import nodemailer from "nodemailer";
import { createSupabaseClient } from "./lib/supabase-client.mjs";
import { getTodayRange } from "./lib/week-range.mjs";
import { reportFailure, reportRecovery } from "./lib/notify-issue.mjs";

const LABEL = "hecovacky";
const WINDOW_DAYS = 7; // stejné okno jako UPCOMING_WINDOW_DAYS ve zbytku appky

// Fisher-Yates -- appka nepotřebuje kryptografickou náhodnost, jen
// rovnoměrné rozložení mezi kandidáty (stejný vzor jako random-league.mjs).
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Stejný Gmail SMTP mechanismus jako predict-reminders.mjs -- duplikováno
// místo sdíleného modulu, protože appka v tomhle repu duplikuje i
// podobně malé pomocníky jinde (např. withJwtRetry/withTransientRetry
// v predict-reminders.mjs/results.mjs), ne že by to nikoho nenapadlo.
function createMailer() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) {
    throw new Error("Chybí GMAIL_USER nebo GMAIL_APP_PASSWORD v prostředí -- nastav je jako GitHub secrets.");
  }
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
}

async function loadEmailsByUserId(supabase, userIds) {
  const emailById = new Map();
  if (userIds.length === 0) return emailById;

  const wanted = new Set(userIds);
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Nepodařilo se načíst uživatele: ${error.message}`);

    for (const user of data.users) {
      if (wanted.has(user.id) && user.email) emailById.set(user.id, user.email);
    }

    if (data.users.length < perPage) break;
    page += 1;
  }
  return emailById;
}

async function pickMatchesForHecovacky(supabase, hecovacky, sourcesByHecovacka, sportBySourceCompetition) {
  const now = new Date();
  let totalPicked = 0;

  for (const hecovacka of hecovacky) {
    const sourceIds = sourcesByHecovacka.get(hecovacka.id) ?? [];
    if (sourceIds.length === 0) continue;

    const { data: existingMatches, error: existingError } = await supabase
      .from("matches")
      .select("external_id, kickoff_at")
      .eq("competition_id", hecovacka.id)
      .not("source_match_id", "is", null);
    if (existingError) {
      throw new Error(`${hecovacka.name}: nepodařilo se ověřit už vybrané zápasy: ${existingError.message}`);
    }

    for (let offset = 0; offset < WINDOW_DAYS; offset += 1) {
      const { dateString, todayStart: dayStart, todayEnd: dayEnd } = getTodayRange(now, offset);

      // end_date je poslední den, kdy appka ještě smí vybírat -- dny
      // za ním jsou mimo okno úplně (ne jen "zatím ne").
      if (hecovacka.end_date && dateString > hecovacka.end_date) break;
      // start_date ještě nenastalo -- appka pro tenhle den nic
      // nevybírá, ale pokračuje dál dny v okně (start_date může
      // padnout i později v týdnu).
      if (hecovacka.start_date && dateString < hecovacka.start_date) continue;

      const dayStartMs = new Date(dayStart).getTime();
      const dayEndMs = new Date(dayEnd).getTime();
      // Kolik zápasů appka pro tenhle den UŽ vybrala (podle
      // external_id, ne jen "má den nějaký zápas") -- oprava reálného
      // nálezu z review (15.9.2026): dřívější verze den označila za
      // "hotový", jakmile měl JEDEN vybraný zápas, takže když zdrojová
      // soutěž v době prvního běhu měla rozpis ještě neúplný (typicky
      // sync-fixtures zdrojové soutěže ještě nedoběhl), appka později
      // dorazivší zápasy toho dne už nikdy nedoplnila, ani v režimu
      // "všechny zápasy" (max_matches_per_day = null).
      const alreadyPickedExternalIds = new Set(
        (existingMatches ?? [])
          .filter((m) => {
            const t = new Date(m.kickoff_at).getTime();
            return t >= dayStartMs && t < dayEndMs;
          })
          .map((m) => m.external_id),
      );

      const limit = hecovacka.max_matches_per_day;
      // Den je plný -- appka do něj nikdy nic dalšího nepřidává (limit
      // je limit), takže rovnou přeskočit bez zbytečného dotazu.
      if (limit && alreadyPickedExternalIds.size >= limit) continue;

      // `.gt("kickoff_at", now)` navíc k dennímu oknu -- u DNEŠNÍHO dne
      // (offset 0) by bez tohohle appka mezi kandidáty klidně měla i
      // zápas, co dnes už začal/skončil (probíhající/dohraný před tím,
      // než appka hecovačku poprvé zpracovala). U limitovaného denního
      // počtu by tak náhodný výběr mohl den zaplnit zápasy, na které se
      // vůbec nedalo tipovat. U budoucích dnů (offset >= 1) tenhle
      // filtr nic nemění, protože dayStart je tam vždycky až v
      // budoucnu. Nalezeno Codex review 15.9.2026.
      const { data: candidates, error: candidatesError } = await supabase
        .from("matches")
        .select(
          "id, external_id, home_team, away_team, kickoff_at, status, home_score, away_score, overtime_flag, sport, competition_id",
        )
        .in("competition_id", sourceIds)
        .gte("kickoff_at", dayStart)
        .lt("kickoff_at", dayEnd)
        .gt("kickoff_at", now.toISOString());
      if (candidatesError) {
        throw new Error(`${hecovacka.name}: nepodařilo se najít kandidáty na ${dateString}: ${candidatesError.message}`);
      }

      if (!candidates || candidates.length === 0) {
        console.log(`${hecovacka.name} (${dateString}): žádný zápas ve vybraných soutěžích, appka nic nevybírá.`);
        continue;
      }

      // Jen zápasy, co appka pro tenhle den ještě nemá -- zbytek už je
      // vybraný z dřívějška a appka do něj nesahá (jinak by re-běh u
      // limitovaného režimu mohl nahradit už zobrazený/tipnutý zápas
      // jiným náhodným výběrem).
      const newCandidates = candidates.filter((m) => !alreadyPickedExternalIds.has(m.external_id));
      if (newCandidates.length === 0) continue;

      // Bez limitu appka doplní ÚPLNĚ VŠECHNY nové kandidáty (žádná
      // náhoda, žádný důvod něco škrtat). S limitem doplní jen tolik,
      // kolik ještě chybí do stropu.
      const picked = limit
        ? shuffle(newCandidates).slice(0, limit - alreadyPickedExternalIds.size)
        : newCandidates;

      const rows = picked.map((m) => ({
        competition_id: hecovacka.id,
        external_id: m.external_id,
        home_team: m.home_team,
        away_team: m.away_team,
        kickoff_at: m.kickoff_at,
        status: m.status,
        home_score: m.home_score,
        away_score: m.away_score,
        overtime_flag: m.overtime_flag,
        sport: m.sport ?? sportBySourceCompetition.get(m.competition_id) ?? null,
        source_match_id: m.id,
      }));

      const { data: insertedRows, error: upsertError } = await supabase
        .from("matches")
        .upsert(rows, { onConflict: "competition_id,external_id" })
        .select("id, external_id");
      if (upsertError) {
        throw new Error(`${hecovacka.name}: zápis vybraných zápasů na ${dateString} selhal: ${upsertError.message}`);
      }

      totalPicked += rows.length;
      console.log(
        `${hecovacka.name} (${dateString}): vybráno ${rows.length} z ${newCandidates.length} nových kandidátů (${alreadyPickedExternalIds.size} už vybráno dřív): ${rows
          .map((r) => `${r.home_team}-${r.away_team}`)
          .join(", ")}`,
      );

      await copyExistingPredictionsToNewMatches(supabase, hecovacka.id, insertedRows ?? []);
    }
  }

  return totalPicked;
}

// Když appka do hecovačky zkopíruje zápas, na který hráč (participant
// dané hecovačky) UŽ dřív tipoval ve zdrojové soutěži (stejný
// external_id), appka mu ten tip rovnou propíše -- stejné pravidlo
// jako opačný směr (syncPredictionToDuplicateMatches v
// src/app/(app)/spaces/[id]/actions.ts: ulož tip → propiš do UŽ
// EXISTUJÍCÍCH sourozenců), jen naopak: sourozenec vznikne AŽ TEĎ,
// appka mu propíše UŽ EXISTUJÍCÍ tip. Bez tohohle appka nový tip
// nikdy nedostala, pokud hráč zápas natipoval dřív, než ho appka do
// hecovačky zkopírovala -- nahlášeno uživatelem 19.9.2026 ("čekal
// jsem, že se mi přenese můj tip"). Stejná oprava i v SQL funkci
// sync_hecovacka_matches_initial() pro založení hecovačky, viz
// 20260919110000_hecovacky_copy_existing_predictions.sql -- tahle
// verze řeší ZBYTEK zápasů, co appka doplní později (den 3, den 4...).
//
// Propisuje se JEN participantům hecovačky (appka ho nikam sama
// nepřihlašuje) a appka nikdy nepřepíše existující tip (`ignoreDuplicates`).
async function copyExistingPredictionsToNewMatches(supabase, hecovackaId, newMatches) {
  if (newMatches.length === 0) return;

  // Znovu ověřit zámek TĚSNĚ před zápisem -- appka mezi výběrem
  // kandidátů (.gt("kickoff_at", now)) výše a tímhle místem stihne
  // několik dalších dotazů/awaitů, takže zápas mezitím teoreticky mohl
  // začít. Zápis dole jde přes service role klíč (obchází RLS), takže
  // bez týhle pojistky by appka mohla založit "platný" tip i na už
  // zamčený zápas -- nalezeno v code review PR #224 (Codex, 20.9.2026).
  const { data: currentState, error: currentStateError } = await supabase
    .from("matches")
    .select("id, status, kickoff_at")
    .in(
      "id",
      newMatches.map((m) => m.id),
    );
  if (currentStateError) {
    throw new Error(`Nepodařilo se ověřit stav nově vybraných zápasů: ${currentStateError.message}`);
  }
  const now = Date.now();
  const stillOpenIds = new Set(
    (currentState ?? [])
      .filter((m) => m.status === "scheduled" && new Date(m.kickoff_at).getTime() > now)
      .map((m) => m.id),
  );
  newMatches = newMatches.filter((m) => stillOpenIds.has(m.id));
  if (newMatches.length === 0) return;

  const externalIds = [...new Set(newMatches.map((m) => m.external_id).filter(Boolean))];
  if (externalIds.length === 0) return;

  const { data: participants, error: participantsError } = await supabase
    .from("competition_participants")
    .select("user_id")
    .eq("competition_id", hecovackaId);
  if (participantsError) {
    throw new Error(`Nepodařilo se načíst participanty hecovačky: ${participantsError.message}`);
  }
  const participantIds = new Set((participants ?? []).map((p) => p.user_id));
  if (participantIds.size === 0) return;

  const { data: siblings, error: siblingsError } = await supabase
    .from("matches")
    .select("id, external_id")
    .in("external_id", externalIds);
  if (siblingsError) {
    throw new Error(`Nepodařilo se najít sourozenecké zápasy: ${siblingsError.message}`);
  }
  if (!siblings || siblings.length === 0) return;

  const { data: siblingPredictions, error: predictionsError } = await supabase
    .from("predictions")
    .select("match_id, user_id, predicted_home_score, predicted_away_score, predicted_overtime_flag, updated_at")
    .in(
      "match_id",
      siblings.map((s) => s.id),
    )
    .in("user_id", [...participantIds]);
  if (predictionsError) {
    throw new Error(`Nepodařilo se načíst existující tipy: ${predictionsError.message}`);
  }
  if (!siblingPredictions || siblingPredictions.length === 0) return;

  const externalIdByMatchId = new Map(siblings.map((s) => [s.id, s.external_id]));

  // Pro každou dvojici (external_id, user_id) appka vezme nejnovější
  // tip -- sourozenecké tipy jsou normálně stejné (drží je v souladu
  // syncPredictionToDuplicateMatches), tohle je jen pojistka pro
  // nepravděpodobný rozjetý stav.
  const latestByExternalIdAndUser = new Map();
  for (const p of siblingPredictions) {
    const externalId = externalIdByMatchId.get(p.match_id);
    if (!externalId) continue;
    const key = `${externalId}::${p.user_id}`;
    const existing = latestByExternalIdAndUser.get(key);
    if (!existing || new Date(p.updated_at).getTime() > new Date(existing.updated_at).getTime()) {
      latestByExternalIdAndUser.set(key, p);
    }
  }

  const rows = [];
  for (const m of newMatches) {
    if (!m.external_id) continue;
    for (const userId of participantIds) {
      const source = latestByExternalIdAndUser.get(`${m.external_id}::${userId}`);
      if (!source) continue;
      rows.push({
        match_id: m.id,
        user_id: userId,
        predicted_home_score: source.predicted_home_score,
        predicted_away_score: source.predicted_away_score,
        predicted_overtime_flag: source.predicted_overtime_flag,
      });
    }
  }
  if (rows.length === 0) return;

  const { error: insertError } = await supabase
    .from("predictions")
    .upsert(rows, { onConflict: "match_id,user_id", ignoreDuplicates: true });
  if (insertError) {
    throw new Error(`Propsání existujících tipů do nových zápasů selhalo: ${insertError.message}`);
  }
  console.log(`Propsáno ${rows.length} existujících tipů do nově vybraných zápasů.`);
}

async function archiveFinishedHecovacky(supabase, hecovacky) {
  const { dateString: todayString } = getTodayRange(new Date());
  const toArchive = hecovacky.filter((h) => h.status === "active" && h.end_date && h.end_date < todayString);
  if (toArchive.length === 0) return 0;

  const { error } = await supabase
    .from("competitions")
    .update({ status: "archived" })
    .in(
      "id",
      toArchive.map((h) => h.id),
    );
  if (error) throw new Error(`Archivace hecovaček selhala: ${error.message}`);

  console.log(`Archivováno ${toArchive.length} hecovaček po uplynutí data konce.`);
  return toArchive.length;
}

async function sendAddedNotifications(supabase) {
  const { data: pending, error } = await supabase
    .from("competition_participants")
    .select("user_id, competitions(id, name), profiles!added_by(display_name)")
    .not("added_by", "is", null)
    .is("notified_at", null);
  if (error) throw new Error(`Nepodařilo se najít nové hráče k upozornění: ${error.message}`);
  if (!pending || pending.length === 0) return { sent: 0, failed: 0 };

  const appBaseUrl = process.env.APP_BASE_URL || "https://klopi.cz";
  const emailById = await loadEmailsByUserId(
    supabase,
    pending.map((p) => p.user_id),
  );
  const mailer = createMailer();
  const fromAddress = process.env.GMAIL_USER;

  let sent = 0;
  let failed = 0;

  for (const row of pending) {
    const email = emailById.get(row.user_id);
    const hecovackaName = row.competitions?.name ?? "hecovačka";
    const hecovackaId = row.competitions?.id;
    const addedByName = row.profiles?.display_name ?? "Někdo";

    if (!email || !hecovackaId) {
      console.log(
        `::warning::Participant ${row.user_id} v "${hecovackaName}" nemá dohledatelný e-mail nebo soutěž, přeskakuji.`,
      );
      continue;
    }

    try {
      await mailer.sendMail({
        from: fromAddress,
        to: email,
        subject: `${addedByName} tě přidal(a) do hecovačky „${hecovackaName}“`,
        text: [
          "Ahoj,",
          "",
          `${addedByName} tě přidal(a) do hecovačky „${hecovackaName}“ na Klopi.`,
          "",
          `${appBaseUrl}/spaces/${hecovackaId}`,
          "",
          "Ať se daří!",
        ].join("\n"),
      });

      const { error: updateError } = await supabase
        .from("competition_participants")
        .update({ notified_at: new Date().toISOString() })
        .eq("competition_id", hecovackaId)
        .eq("user_id", row.user_id);
      if (updateError) throw new Error(`Zápis notified_at selhal: ${updateError.message}`);

      sent += 1;
      console.log(`Odesláno upozornění uživateli ${row.user_id} o přidání do "${hecovackaName}".`);
    } catch (err) {
      failed += 1;
      console.log(`::error::Odeslání uživateli ${row.user_id} selhalo: ${err.message}`);
    }
  }

  return { sent, failed };
}

async function main() {
  const supabase = createSupabaseClient();

  const { data: hecovacky, error: hecovackyError } = await supabase
    .from("competitions")
    .select("id, name, start_date, end_date, max_matches_per_day, status")
    .eq("visibility", "private");
  if (hecovackyError) throw new Error(`Nepodařilo se načíst hecovačky: ${hecovackyError.message}`);

  const activeHecovacky = (hecovacky ?? []).filter((h) => h.status === "active");

  let picked = 0;
  if (activeHecovacky.length > 0) {
    const { data: sources, error: sourcesError } = await supabase
      .from("hecovacka_sources")
      .select("hecovacka_id, source_competition_id")
      .in(
        "hecovacka_id",
        activeHecovacky.map((h) => h.id),
      );
    if (sourcesError) throw new Error(`Nepodařilo se načíst zdrojové soutěže: ${sourcesError.message}`);

    const sourcesByHecovacka = new Map();
    const allSourceCompetitionIds = new Set();
    for (const row of sources ?? []) {
      const list = sourcesByHecovacka.get(row.hecovacka_id) ?? [];
      list.push(row.source_competition_id);
      sourcesByHecovacka.set(row.hecovacka_id, list);
      allSourceCompetitionIds.add(row.source_competition_id);
    }

    const { data: sourceCompetitions, error: sourceCompetitionsError } = allSourceCompetitionIds.size
      ? await supabase
          .from("competitions")
          .select("id, sport")
          .in("id", [...allSourceCompetitionIds])
      : { data: [], error: null };
    if (sourceCompetitionsError) {
      throw new Error(`Nepodařilo se načíst sport zdrojových soutěží: ${sourceCompetitionsError.message}`);
    }
    const sportBySourceCompetition = new Map((sourceCompetitions ?? []).map((c) => [c.id, c.sport]));

    picked = await pickMatchesForHecovacky(supabase, activeHecovacky, sourcesByHecovacka, sportBySourceCompetition);
  }

  const archived = await archiveFinishedHecovacky(supabase, hecovacky ?? []);
  const { sent, failed } = await sendAddedNotifications(supabase);

  const summary = `Vybráno ${picked} nových zápasů, archivováno ${archived} hecovaček, odesláno ${sent} e-mailů o přidání${failed > 0 ? ` (${failed} selhalo)` : ""}.`;
  console.log(summary);

  if (failed > 0) {
    process.exitCode = 1;
    await reportFailure({
      title: "⚠️ hecovacky: odeslání některých upozornění na přidání selhalo",
      body: summary,
      label: LABEL,
    });
  } else {
    await reportRecovery({ label: LABEL, summary });
  }
}

try {
  await main();
} catch (err) {
  // Stejná pojistka jako u predict-reminders.mjs/results.mjs -- bez
  // tohohle by chyba vzniklá mimo dílčí kroky výše jen shodila proces
  // s exit code 1, bez GitHub Issue.
  console.log(`::error::${err.message}`);
  process.exitCode = 1;
  await reportFailure({
    title: "⚠️ hecovacky: běh selhal",
    body: `Běh selhal s chybou: ${err.message}`,
    label: LABEL,
  }).catch((reportErr) => {
    console.log(`::error::Navíc selhalo i nahlášení chyby: ${reportErr.message}`);
  });
}
