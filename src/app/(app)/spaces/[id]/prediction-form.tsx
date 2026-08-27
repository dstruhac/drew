"use client";

import { useActionState, useRef } from "react";
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
  const formRef = useRef<HTMLFormElement>(null);
  // Signatura posledně odeslaných hodnot -- zabrání zbytečnému opakovanému
  // ukládání (blur i klik na tlačítko krátce po sobě), když se hodnoty
  // mezitím nezměnily.
  const lastSubmittedRef = useRef<string | null>(null);

  // Auto-save (odsouhlaseno s uživatelem 27.8.2026): tip se uloží sám,
  // jakmile jsou vyplněná OBĚ skóre a uživatel opustí pole -- dokud je
  // vyplněné jen jedno, nic se neděje (žádná chybová hláška, žádné
  // odeslání). Tlačítko "Uložit tip" zůstává jako záložní/explicitní
  // potvrzení, hlavně pro mobil, kde blur nemusí vždy spolehlivě proběhnout.
  function maybeAutoSave() {
    const form = formRef.current;
    if (!form) return;

    const home = form.elements.namedItem(
      "predicted_home_score",
    ) as HTMLInputElement;
    const away = form.elements.namedItem(
      "predicted_away_score",
    ) as HTMLInputElement;
    if (!home.value.trim() || !away.value.trim()) return;
    if (!form.checkValidity()) return;

    const overtimeEl = form.elements.namedItem(
      "predicted_overtime_flag",
    ) as HTMLInputElement | null;
    const signature = `${home.value}:${away.value}:${overtimeEl?.checked ?? false}`;
    if (signature === lastSubmittedRef.current) return;

    lastSubmittedRef.current = signature;
    form.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-3 flex flex-wrap items-center gap-2"
    >
      <input
        type="number"
        inputMode="numeric"
        name="predicted_home_score"
        min={0}
        required
        defaultValue={existing?.predicted_home_score}
        aria-label="Tip skóre domácích"
        onBlur={maybeAutoSave}
        className="w-14 rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1 text-center text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black/30 dark:focus:ring-white/30"
      />
      <span className="text-black/40 dark:text-white/40">:</span>
      <input
        type="number"
        inputMode="numeric"
        name="predicted_away_score"
        min={0}
        required
        defaultValue={existing?.predicted_away_score}
        aria-label="Tip skóre hostů"
        onBlur={maybeAutoSave}
        className="w-14 rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1 text-center text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black/30 dark:focus:ring-white/30"
      />

      {sport === "hockey" && (
        <label className="flex items-center gap-1.5 text-xs text-black/60 dark:text-white/60">
          <input
            type="checkbox"
            name="predicted_overtime_flag"
            defaultChecked={existing?.predicted_overtime_flag ?? false}
            onChange={maybeAutoSave}
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
