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
  variant = "default",
}: {
  sport: Sport;
  competitionId: string;
  matchId: string;
  existing: {
    predicted_home_score: number;
    predicted_away_score: number;
    predicted_overtime_flag: boolean | null;
  } | null;
  /** "spotlight" = větší formulář pro vysvícený nejbližší zápas (na
   * tmavé kartě, viz MatchesSpotlightCard v page.tsx) -- stejná akce
   * a auto-save logika, jen jiný vzhled. */
  variant?: "default" | "spotlight";
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

  // Auto-přeskok na pole hostů (odsouhlaseno s uživatelem 29.8.2026):
  // hned po zadání PRVNÍ číslice do pole domácích se fokus přesune na
  // pole hostů -- na mobilu tak jde zadat celý tip bez jediného ťuknutí
  // navíc. Vědomý kompromis: u vzácného dvouciferného skóre (10+) je
  // potřeba se po přeskoku ťuknutím vrátit zpátky a dopsat druhou
  // číslici -- pole hostů samo nikam dál needskakuje.
  function focusAwayOnFirstDigit(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.value.length !== 1) return;
    const away = e.target.form?.elements.namedItem(
      "predicted_away_score",
    ) as HTMLInputElement | null;
    away?.focus();
  }

  if (variant === "spotlight") {
    return (
      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col items-center gap-4"
      >
        <div className="flex items-center gap-3">
          <input
            type="number"
            inputMode="numeric"
            name="predicted_home_score"
            min={0}
            required
            defaultValue={existing?.predicted_home_score}
            aria-label="Tip skóre domácích"
            onChange={focusAwayOnFirstDigit}
            onBlur={maybeAutoSave}
            className="h-14 w-16 rounded-2xl border-2 border-white/15 bg-white/5 text-center text-2xl font-extrabold text-white transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <span className="text-2xl font-extrabold text-white/30">:</span>
          <input
            type="number"
            inputMode="numeric"
            name="predicted_away_score"
            min={0}
            required
            defaultValue={existing?.predicted_away_score}
            aria-label="Tip skóre hostů"
            onBlur={maybeAutoSave}
            className="h-14 w-16 rounded-2xl border-2 border-white/15 bg-white/5 text-center text-2xl font-extrabold text-white transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {sport === "hockey" && (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-white/60">
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
          className="btn-press w-full max-w-[220px] rounded-full bg-accent px-6 py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50 disabled:active:scale-100"
        >
          {isPending ? "Ukládám…" : existing ? "Upravit tip" : "Uložit tip"}
        </button>

        {state.error && (
          <span className="text-center text-xs font-semibold text-red-300">
            {state.error}
          </span>
        )}
      </form>
    );
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
        onChange={focusAwayOnFirstDigit}
        onBlur={maybeAutoSave}
        className="w-14 rounded-[10px] border border-border-subtle bg-transparent px-2 py-1 text-center text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <span className="text-faint-foreground">:</span>
      <input
        type="number"
        inputMode="numeric"
        name="predicted_away_score"
        min={0}
        required
        defaultValue={existing?.predicted_away_score}
        aria-label="Tip skóre hostů"
        onBlur={maybeAutoSave}
        className="w-14 rounded-[10px] border border-border-subtle bg-transparent px-2 py-1 text-center text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40"
      />

      {sport === "hockey" && (
        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
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
        className="btn-press rounded-[10px] border border-border-subtle px-3 py-1 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50 disabled:active:scale-100"
      >
        {isPending ? "Ukládám…" : existing ? "Upravit tip" : "Uložit tip"}
      </button>

      {state.error && (
        <span className="w-full text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
    </form>
  );
}
