"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Sport } from "@/lib/supabase/database.types";

export type SubmitPredictionState = { error: string | null };

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
  return { error: null };
}
