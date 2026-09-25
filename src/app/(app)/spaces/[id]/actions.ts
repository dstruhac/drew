"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Sport } from "@/lib/supabase/database.types";
import type { ChatMessage } from "./chat-panel";

export type SubmitPredictionState = {
  error: string | null;
  /** Primární tip se uložil v pořádku, ale propsání do sourozeneckých
   * kopií zápasu (viz syncPredictionToDuplicateMatches) selhalo na
   * chybě databáze/RLS -- appka o tom hráče musí informovat, ať
   * netuší, že je tip všude stejný, když ve skutečnosti není
   * (nalezeno v review 16.9.2026). */
  syncWarning?: string;
};

// Sdílená pojistka pro skončenou hecovačku -- appka "zakonzervuje"
// finální pořadí, jakmile status přejde na 'archived' (hecovacky.mjs).
// Používá leaveCompetition/addHecovackaPlayer/removeHecovackaPlayer,
// ať mimo formulář (přímé volání akce) nejde obejít schované tlačítko
// v UI (nalezeno Codex review na PR #225). joinCompetition ji
// nepotřebuje -- samoobslužné "Chci hrát" u soukromé soutěže RLS
// stejně odmítne (žádná insert policy pro visibility='private').
//
// Fail-closed na chybě dotazu (Codex review): appka dřív při
// přechodné chybě Supabase (appka má na tenhle typ výpadku i vlastní
// retry na fetch úrovni, viz retry-fetch.ts, tohle je poslední
// pojistka) tiše pokračovala, jako by soutěž nebyla archivovaná --
// teď mutaci radši zablokuje, i za cenu chybové hlášky navíc.
async function assertHecovackaNotArchived(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitionId: string,
  message: string,
) {
  const { data: competition, error } = await supabase
    .from("competitions")
    .select("status, visibility")
    .eq("id", competitionId)
    .single();
  if (error) {
    throw new Error(`Nepodařilo se ověřit stav soutěže: ${error.message}`);
  }
  if (competition.visibility === "private" && competition.status === "archived") {
    throw new Error(message);
  }
}

export async function joinCompetition(competitionId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return;

  const { error } = await supabase
    .from("competition_participants")
    .insert({ competition_id: competitionId, user_id: user.id });

  // 23505 = unique_violation (už přihlášen) -- není chyba, jen no-op.
  if (error && error.code !== "23505") {
    throw new Error(`Přihlášení do soutěže se nepodařilo: ${error.message}`);
  }

  revalidatePath(`/spaces/${competitionId}`);
  revalidatePath(`/spaces/${competitionId}/leaderboard`);
  revalidatePath("/spaces");
  revalidatePath("/dashboard");
}

export async function leaveCompetition(competitionId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return;

  // Skončená hecovačka: appka po archivaci nedovolí ani odchod ze
  // soutěže -- pozvánkový token po archivaci appka odmítá
  // (accept_hecovacka_invite vyžaduje status='active'), takže by se
  // hráč nemohl vrátit a "finální" pódium by přišlo o jméno (nalezeno
  // Codex review na PR #225, appka tlačítko v UI schovává, ale mimo
  // formulář by šlo akci zavolat přímo).
  await assertHecovackaNotArchived(
    supabase,
    competitionId,
    "Hecovačka už skončila, ze soutěže nejde odejít.",
  );

  const { error } = await supabase
    .from("competition_participants")
    .delete()
    .eq("competition_id", competitionId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Odhlášení ze soutěže se nepodařilo: ${error.message}`);
  }

  revalidatePath(`/spaces/${competitionId}`);
  revalidatePath(`/spaces/${competitionId}/leaderboard`);
  revalidatePath("/spaces");
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

// Jen pro tvůrce hecovačky (soukromá competition) -- RLS policy
// competition_participants_insert_by_owner (viz
// 20260914090300_competition_participants_hecovacky.sql) dovolí
// insert libovolného user_id, ale jen když je volající tvůrcem dané
// soukromé soutěže, jinak insert selže. added_by appka vyplní, ať jde
// přidanému hráči poslat e-mail (scripts/sync/hecovacky.mjs).
export async function addHecovackaPlayer(competitionId: string, userId: string) {
  const supabase = await createClient();
  const currentUser = await getCurrentUser();

  if (!currentUser) return;

  // Skončená hecovačka se "zakonzervuje" -- appka po archivaci (viz
  // hecovacky.mjs) schová tlačítko v UI (HecovackaPanel), ale kontrola
  // patří i sem, ať to nejde obejít přímým voláním akce mimo formulář
  // (uživatel 21.9.2026 -- appka dřív nechávala přidávání hráčů funkční
  // i po konci hecovačky).
  await assertHecovackaNotArchived(
    supabase,
    competitionId,
    "Hecovačka už skončila, hráče nejde přidat.",
  );

  const { error } = await supabase
    .from("competition_participants")
    .insert({ competition_id: competitionId, user_id: userId, added_by: currentUser.id });

  // 23505 = unique_violation (už přidán) -- není chyba, jen no-op.
  if (error && error.code !== "23505") {
    throw new Error(`Přidání hráče se nepodařilo: ${error.message}`);
  }

  // Nově přidaný hráč mohl už dřív tipovat zápas, který appka do téhle
  // hecovačky zkopírovala předtím, než ho přidala -- propíše se mu
  // rovnou (viz 20260919110200_hecovacky_backfill_predictions_on_join.sql).
  // Chyba se jen zaloguje, ať appka aspoň přidání hráče nezablokuje.
  const { error: backfillError } = await supabase.rpc("backfill_hecovacka_predictions_for_participant", {
    p_hecovacka_id: competitionId,
    p_user_id: userId,
  });
  if (backfillError) {
    console.error("Propsání existujících tipů novému hráči hecovačky selhalo:", backfillError.message);
  }

  revalidatePath(`/spaces/${competitionId}`);
  revalidatePath(`/spaces/${competitionId}/leaderboard`);
  revalidatePath("/hecovacky");
}

// Jen pro tvůrce hecovačky -- oprava omylu při přidávání (RLS policy
// competition_participants_delete_by_owner).
export async function removeHecovackaPlayer(competitionId: string, userId: string) {
  const supabase = await createClient();

  // Stejná pojistka jako addHecovackaPlayer výše -- odebírání hráčů po
  // konci hecovačky nedává smysl (měnilo by to "finální" pořadí).
  await assertHecovackaNotArchived(
    supabase,
    competitionId,
    "Hecovačka už skončila, hráče nejde odebrat.",
  );

  const { error } = await supabase
    .from("competition_participants")
    .delete()
    .eq("competition_id", competitionId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Odebrání hráče se nepodařilo: ${error.message}`);
  }

  revalidatePath(`/spaces/${competitionId}`);
  revalidatePath(`/spaces/${competitionId}/leaderboard`);
  revalidatePath("/hecovacky");
}

const CHAT_MESSAGE_MAX_LENGTH = 500;
const CHAT_GIF_URL_MAX_LENGTH = 500;

// GIFka smí být jen skutečná GIPHY URL (https, host media*.giphy.com) --
// appka `gifUrl` bere z formuláře jako obyčejný string, klientský
// GifPicker sice vždycky pošle jen GIPHY URL, ale appka to i tak
// vynutí i na serveru, ne jen v UI (nalezeno Codex review na PR #231:
// bez týhle kontroly by šlo přes přímé volání akce uložit libovolnou
// URL, kterou appka pak ostatním hráčům vykreslí jako <img src>).
const GIPHY_URL_PATTERN = /^https:\/\/media\d*\.giphy\.com\//;

function isValidGifUrl(url: string) {
  return url.length <= CHAT_GIF_URL_MAX_LENGTH && GIPHY_URL_PATTERN.test(url);
}

// Chat hecovačky (na žádost uživatele 25.9.2026) -- appka nepoužívá
// revalidatePath: ostatním hráčům zprávu doručí Supabase Realtime
// (ChatPanel má vlastní podpisku), plný refetch stránky by chat jen
// zbytečně sekal. Odesílateli appka vrátí uloženou zprávu přímo v
// odpovědi (ne přes vlastní realtime událost, viz komentář v
// chat-panel.tsx -- nalezeno Codex review na PR #231).
export async function sendHecovackaMessage(
  competitionId: string,
  body: string | null,
  gifUrl: string | null,
): Promise<{ error: string | null; message?: ChatMessage }> {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return { error: "Nejste přihlášen." };

  const trimmedBody = body?.trim() || null;
  if (!trimmedBody && !gifUrl) {
    return { error: "Zpráva je prázdná." };
  }
  if (trimmedBody && trimmedBody.length > CHAT_MESSAGE_MAX_LENGTH) {
    return { error: `Zpráva je moc dlouhá (max ${CHAT_MESSAGE_MAX_LENGTH} znaků).` };
  }
  if (gifUrl && !isValidGifUrl(gifUrl)) {
    return { error: "Neplatná URL GIFky." };
  }

  try {
    await assertHecovackaNotArchived(supabase, competitionId, "Hecovačka už skončila, chat je uzavřený.");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Chat je uzavřený." };
  }

  const { data, error } = await supabase
    .from("hecovacka_messages")
    .insert({
      competition_id: competitionId,
      user_id: user.id,
      body: trimmedBody,
      gif_url: gifUrl,
    })
    .select("id, user_id, body, gif_url, created_at")
    .single();

  if (error) {
    return { error: error.message };
  }

  return { error: null, message: data };
}

// Autor smí smazat jen svou vlastní zprávu (odsouhlaseno s uživatelem)
// -- `.eq("user_id", user.id)` je tu jen jako druhá pojistka navíc k
// RLS politice hecovacka_messages_delete_own, appka na to nespoléhá
// jako na jedinou obranu.
export async function deleteHecovackaMessage(messageId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return;

  const { error } = await supabase
    .from("hecovacka_messages")
    .delete()
    .eq("id", messageId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Smazání zprávy se nepodařilo: ${error.message}`);
  }
}

// Appka si pamatuje, dokdy hráč chat naposledy viděl -- podle toho pak
// pozná nepřečtené zprávy (ikonka v horní liště + odznak na kartičce
// Dashboardu, viz src/lib/hecovacka-chat.ts). Volá se, jakmile hráč
// záložku Chat na stránce hecovačky skutečně otevře.
export async function markHecovackaChatRead(competitionId: string) {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) return;

  const { error } = await supabase
    .from("competition_participants")
    .update({ chat_last_read_at: new Date().toISOString() })
    .eq("competition_id", competitionId)
    .eq("user_id", user.id);

  if (error) {
    console.error("Označení chatu jako přečteného selhalo:", error.message);
    return;
  }

  revalidatePath("/dashboard");
}

export async function submitPrediction(
  sport: Sport,
  competitionId: string,
  matchId: string,
  _prevState: SubmitPredictionState,
  formData: FormData,
): Promise<SubmitPredictionState> {
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) {
    return { error: "Nejste přihlášen." };
  }

  const homeScore = Number(formData.get("predicted_home_score"));
  const awayScore = Number(formData.get("predicted_away_score"));
  const overtime =
    sport === "hockey" ? formData.get("predicted_overtime_flag") === "on" : null;

  if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore)) {
    return { error: "Skóre musí být celé číslo." };
  }
  if (homeScore < 0 || awayScore < 0) {
    return { error: "Skóre nemůže být záporné." };
  }
  // Hokej nikdy nekončí remízou (i po prodloužení/nájezdech dostane
  // vítěz rozhodující gól navíc) -- pojistka pro případ, že by klientská
  // kontrola v prediction-form.tsx (živá při psaní) něco nezachytila.
  if (sport === "hockey" && homeScore === awayScore) {
    return {
      error:
        "Hokej nekončí remízou — zadej, kdo nakonec vyhrál. Čekáš prodloužení/nájezdy? Zaškrtni to.",
    };
  }

  const { error } = await supabase.from("predictions").upsert(
    {
      match_id: matchId,
      user_id: user.id,
      predicted_home_score: homeScore,
      predicted_away_score: awayScore,
      predicted_overtime_flag: overtime,
    },
    { onConflict: "match_id,user_id" },
  );

  if (error) {
    return {
      error:
        error.code === "42501"
          ? "Tip už nejde uložit, zápas je zamčený (výkop proběhl)."
          : error.message,
    };
  }

  revalidatePath(`/spaces/${competitionId}`);

  const syncResult = await syncPredictionToDuplicateMatches({
    supabase,
    matchId,
    userId: user.id,
    homeScore,
    awayScore,
    overtime,
  });

  if (!syncResult.ok) {
    return {
      error: null,
      syncWarning:
        "Tip se uložil, ale nepodařilo se ho propsat do ostatních soutěží se stejným zápasem -- zkus prosím tip znovu uložit (např. drobnou úpravou skóre a vrácením zpátky).",
    };
  }

  return { error: null };
}

type SyncOutcome =
  | { ok: true }
  // Skutečná chyba databáze/RLS při hledání/zápisu sourozeneckých kopií
  // zápasu -- odlišeno od "legitimně není co propisovat" (ok: true),
  // ať appka na tenhle stav umí hráče upozornit (viz volání výše).
  | { ok: false };

// Stejný reálný zápas se dokáže objevit ve víc soutěžích najednou --
// typicky "Náhodná liga" nabírá zápasy ze sledovaných domácích lig
// (Chance Liga, Premier League, ...), takže appka pro NĚJ založí druhý
// řádek v `matches` se stejným `external_id`, jen jinou
// `competition_id`. Uživatel 14.9.2026 nahlásil, že mu appka nutí
// zadávat stejný tip dvakrát -- appka teď po každém uložení tipu
// propíše stejné skóre/checkbox i do sourozeneckých kopií zápasu.
//
// Propisuje se JEN do soutěží, kde hráč UŽ hraje (odsouhlaseno
// s uživatelem) -- appka ho nikam sama nepřihlašuje jen kvůli
// propsání tipu, to zůstává jeho vlastní krok ("Chci hrát").
//
// Primární tip (submitPrediction výše) je v tuhle chvíli už bezpečně
// uložený bez ohledu na výsledek týhle funkce -- proto každý dílčí
// dotaz/zápis tady vrací explicitní `error`, ne jen tichou hodnotu
// `undefined`/`null` (nalezeno v review 16.9.2026: appka dřív chybu
// nerozlišila od "není co propisovat" a UI tak tiše předstíralo
// úspěch, i když třeba propsání do jiné soutěže spadlo na dočasné
// chybě databáze).
async function syncPredictionToDuplicateMatches({
  supabase,
  matchId,
  userId,
  homeScore,
  awayScore,
  overtime,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  matchId: string;
  userId: string;
  homeScore: number;
  awayScore: number;
  overtime: boolean | null;
}): Promise<SyncOutcome> {
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("external_id")
    .eq("id", matchId)
    .single();

  if (matchError) return { ok: false };
  if (!match?.external_id) return { ok: true };

  const { data: siblings, error: siblingsError } = await supabase
    .from("matches")
    .select("id, competition_id, kickoff_at, status")
    .eq("external_id", match.external_id)
    .neq("id", matchId);

  if (siblingsError) return { ok: false };
  if (!siblings || siblings.length === 0) return { ok: true };

  const { data: participations, error: participationsError } = await supabase
    .from("competition_participants")
    .select("competition_id")
    .eq("user_id", userId)
    .in(
      "competition_id",
      siblings.map((s) => s.competition_id),
    );

  if (participationsError) return { ok: false };

  const joinedCompetitionIds = new Set(
    (participations ?? []).map((p) => p.competition_id),
  );

  // Jen soutěže, kde hráč hraje A kde zápas ještě není zamčený -- appka
  // je zjišťuje sama předem (ne až přes chybu z RLS), protože jeden
  // hromadný upsert by kvůli JEDNÉ zamčené kopii selhal jako celek a
  // nezapsal by ani ty ostatní, platné.
  const now = Date.now();
  const targets = siblings.filter(
    (s) =>
      joinedCompetitionIds.has(s.competition_id) &&
      s.status === "scheduled" &&
      new Date(s.kickoff_at).getTime() > now,
  );

  if (targets.length === 0) return { ok: true };

  const { error: syncError } = await supabase.from("predictions").upsert(
    targets.map((t) => ({
      match_id: t.id,
      user_id: userId,
      predicted_home_score: homeScore,
      predicted_away_score: awayScore,
      predicted_overtime_flag: overtime,
    })),
    { onConflict: "match_id,user_id" },
  );

  if (syncError) return { ok: false };

  for (const t of targets) {
    revalidatePath(`/spaces/${t.competition_id}`);
  }

  return { ok: true };
}
