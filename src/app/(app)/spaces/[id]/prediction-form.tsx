"use client";

import { useActionState } from "react";
import { submitPrediction, type SubmitPredictionState } from "./actions";
import type { Sport } from "@/lib/supabase/database.types";

const initialState: SubmitPredictionState = { error: null };

export function PredictionForm({
  sport,
  competitionId,
  matchId,
  existing,
}: {
  sport: Sport;
  competitionId: string;
  matchId: string;
  existing: {
    predicted_home_score: number;
    predicted_away_score: number;
    predicted_overtime_flag: boolean | null;
  } | null;
}) {
  const action = submitPrediction.bind(null, sport, competitionId, matchId);
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
      <input
        type="number"
        name="predicted_home_score"
        min={0}
        required
        defaultValue={existing?.predicted_home_score}
        aria-label="Tip skóre domácích"
        className="w-14 rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1 text-center text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black/30 dark:focus:ring-white/30"
      />
      <span className="text-black/40 dark:text-white/40">:</span>
      <input
        type="number"
        name="predicted_away_score"
        min={0}
        required
        defaultValue={existing?.predicted_away_score}
        aria-label="Tip skóre hostů"
        className="w-14 rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1 text-center text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black/30 dark:focus:ring-white/30"
      />

      {sport === "hockey" && (
        <label className="flex items-center gap-1.5 text-xs text-black/60 dark:text-white/60">
          <input
            type="checkbox"
            name="predicted_overtime_flag"
            defaultChecked={existing?.predicted_overtime_flag ?? false}
          />
          prodloužení/nájezdy
        </label>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn-press rounded-md border border-black/10 dark:border-white/15 px-3 py-1 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:active:scale-100"
      >
        {isPending ? "Ukládám…" : existing ? "Upravit tip" : "Uložit tip"}
      </button>

      {state.error && (
        <span className="w-full text-xs text-red-600 dark:text-red-400">
          {state.error}
        </span>
      )}
    </form>
  );
}
