"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Sport } from "@/lib/supabase/database.types";

export type SubmitPredictionState = { error: string | null };

export async function submitPrediction(
  sport: Sport,
  competitionId: string,
  matchId: string,
  _prevState: SubmitPredictionState,
  formData: FormData,
): Promise<SubmitPredictionState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
