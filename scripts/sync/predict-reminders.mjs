// Entrypoint pro predict-reminders.yml. Běží po hodině a pro každého
// hráče, kterému chybí tip na dnešní zápas, pošle e-mailem souhrnné
// upozornění -- ale teprve 2 hodiny před PRVNÍM chybějícím zápasem
// dne, ne hned ráno (odsouhlaseno s uživatelem 28.8.2026).
//
// Upozornění je OPT-IN za každou soutěž zvlášť -- hráč si ho zapíná
// tlačítkem "🔔 Chci upozornit" na stránce soutěže
// (competition_participants.email_reminders_enabled, výchozí false).
// Skript proto rovnou čte jen participanty, kteří mají zapnuto, a
// zápasy z nezapnutých soutěží mu do souhrnu vůbec nepřijdou.
//
// I když hráč hraje víc soutěží najednou a chybí mu víc tipů, pošle se
// jen JEDEN souhrnný e-mail za den -- hlídá prediction_reminders_sent
// (viz supabase/migrations/20260828150000_prediction_reminders_sent.sql).
//
// Posílá se přes Gmail SMTP (GMAIL_USER/GMAIL_APP_PASSWORD) z vlastního
// účtu uživatele -- žádná placená e-mailová služba, žádná vlastní
// doména k ověření (Resend by bez vlastní domény uměl posílat jen
// zpátky na účet, kterým se appka u něj zaregistrovala, ne kamarádům --
// ověřeno webovým vyhledáváním 28.8.2026). Osobní Gmail účet zvládne
// až 500 e-mailů denně, na hrstku hráčů appky bohatě stačí.
//
// Adresu hráče appka nikde v databázi neukládá (profiles má jen
// display_name/avatar_url) -- čte se přes Supabase Admin API
// (auth.admin.listUsers), které funguje se stejným service role
// klíčem jako zbytek sync skriptů.

import nodemailer from "nodemailer";
import { createSupabaseClient } from "./lib/supabase-client.mjs";
import { getTodayRange } from "./lib/week-range.mjs";
import { computeMissingByUser, shouldSendNow, buildReminderEmail } from "./lib/reminder-logic.mjs";
import { reportFailure, reportRecovery } from "./lib/notify-issue.mjs";

const HOURS_BEFORE = 2;
const LABEL = "predict-reminders";

function createMailer() {
  const user = process.env.GMAIL_USER;
  // Google zobrazuje heslo pro aplikace s mezerami ("abcd efgh ijkl
  // mnop") jen kvůli čitelnosti -- řada SMTP klientů heslo s mezerami
  // odmítne, takže je tu odstraňujeme bez ohledu na to, jestli je
  // uživatel do GitHub secretu zkopíroval s nimi, nebo bez nich.
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
  // Admin API nejde filtrovat podle konkrétních ID -- appka má jen
  // hrstku uživatelů, takže se prostě projde celý seznam (stránkovaně,
  // pro jistotu do budoucna, ne natvrdo na jednu stránku).
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

async function main() {
  const supabase = createSupabaseClient();
  const appBaseUrl = process.env.APP_BASE_URL || "https://drew-pink.vercel.app";
  const now = new Date();
  const { dateString, todayStart, todayEnd } = getTodayRange(now);

  const [
    { data: participants, error: participantsError },
    { data: matches, error: matchesError },
    { data: alreadySent, error: alreadySentError },
  ] = await Promise.all([
    supabase
      .from("competition_participants")
      .select("user_id, competition_id")
      .eq("email_reminders_enabled", true),
    supabase
      .from("matches")
      .select("id, competition_id, home_team, away_team, kickoff_at")
      .eq("status", "scheduled")
      .gte("kickoff_at", todayStart)
      .lt("kickoff_at", todayEnd)
      .gt("kickoff_at", now.toISOString()),
    supabase.from("prediction_reminders_sent").select("user_id").eq("reminder_date", dateString),
  ]);

  if (participantsError) throw new Error(`Nepodařilo se načíst participanty: ${participantsError.message}`);
  if (matchesError) throw new Error(`Nepodařilo se načíst zápasy: ${matchesError.message}`);
  if (alreadySentError) throw new Error(`Nepodařilo se načíst evidenci odeslaných upozornění: ${alreadySentError.message}`);

  if (!matches || matches.length === 0) {
    console.log(`${dateString}: dnes už žádné budoucí zápasy nejsou, není co hlídat.`);
    return;
  }

  const matchIds = matches.map((m) => m.id);
  const { data: predictions, error: predictionsError } = await supabase
    .from("predictions")
    .select("match_id, user_id")
    .in("match_id", matchIds);

  if (predictionsError) throw new Error(`Nepodařilo se načíst tipy: ${predictionsError.message}`);

  const alreadySentUserIds = new Set((alreadySent ?? []).map((r) => r.user_id));
  const missingByUser = computeMissingByUser(participants ?? [], matches, predictions ?? []);

  const toNotify = [...missingByUser.entries()].filter(
    ([userId, { earliestKickoffAt }]) =>
      !alreadySentUserIds.has(userId) && shouldSendNow(earliestKickoffAt, now, HOURS_BEFORE),
  );

  if (toNotify.length === 0) {
    console.log(`${dateString}: nikomu teď nemá přijít upozornění (buď nikomu nic nechybí, nebo ještě není čas).`);
    return;
  }

  const emailById = await loadEmailsByUserId(
    supabase,
    toNotify.map(([userId]) => userId),
  );

  const mailer = createMailer();
  const fromAddress = process.env.GMAIL_USER;

  let hadFailure = false;
  let sentCount = 0;

  for (const [userId, { matches: userMatches }] of toNotify) {
    const email = emailById.get(userId);
    if (!email) {
      console.log(`::warning::Uživatel ${userId} nemá dohledatelný e-mail, přeskakuji.`);
      continue;
    }

    try {
      const { subject, text } = buildReminderEmail(userMatches, appBaseUrl);
      await mailer.sendMail({ from: fromAddress, to: email, subject, text });

      const { error: insertError } = await supabase
        .from("prediction_reminders_sent")
        .insert({ user_id: userId, reminder_date: dateString });
      if (insertError) throw new Error(`Zápis evidence selhal: ${insertError.message}`);

      sentCount += 1;
      console.log(`Odesláno upozornění uživateli ${userId} (${userMatches.length} zápasů).`);
    } catch (err) {
      hadFailure = true;
      console.log(`::error::Odeslání uživateli ${userId} selhalo: ${err.message}`);
    }
  }

  if (hadFailure) {
    process.exitCode = 1;
    await reportFailure({
      title: "⚠️ predict-reminders: odeslání některých upozornění selhalo",
      body: `Běh ${dateString} odeslal ${sentCount} z ${toNotify.length} upozornění -- zbytek selhal, viz log běhu.`,
      label: LABEL,
    });
  } else {
    await reportRecovery({ label: LABEL, summary: `Poslední běh v pořádku, odesláno ${sentCount} upozornění.` });
  }
}

await main();
