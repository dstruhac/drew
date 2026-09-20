"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Sport } from "@/lib/supabase/database.types";

export type SubmitPredictionState = {
  error: string | null;
  /** Primární tip se uložil v pořádku, ale propsání do sourozeneckých
   * kopií zápasu (viz syncPredictionToDuplicateMatches) selhalo na
   * chybě databáze/RLS -- appka o tom hráče musí informovat, ať
   * netuší, že je tip všude stejný, když ve skutečnosti není
   * (nalezeno v review 16.9.2026). */
  syncWarning?: string;
};

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
