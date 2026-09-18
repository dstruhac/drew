"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitPrediction, type SubmitPredictionState } from "./actions";
import type { Sport } from "@/lib/supabase/database.types";

const initialState: SubmitPredictionState = { error: null };

const TIE_WARNING =
  "Hokej remízou nekončí — zadej, kdo nakonec vyhrál. Čekáš prodloužení/nájezdy? Zaškrtni to dole.";

const SHARED_MATCH_NOTE = "✅ Tip je sdílen do více soutěží (stejný zápas).";

// Prodleva před auto-přeskokem na pole hostů (viz focusAwayOnFirstDigit
// níže) -- uživatel 18.9.2026 nahlásil, že na mobilu nejde v praxi
// zadat dvouciferné skóre (10+), protože appka dřív přeskakovala úplně
// OKAMŽITĚ po první číslici (0 ms, žádná prodleva). 600 ms dá dost
// času napsat druhou číslici, ale u běžného jednociferného skóre
// (drtivá většina zápasů) je pořád nepostřehnutelně rychlé.
const FOCUS_JUMP_DELAY_MS = 600;

export function PredictionForm({
  sport,
  competitionId,
  matchId,
  existing,
  variant = "default",
  isSharedMatch = false,
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
  /** `true`, když appka pro tenhle zápas najde stejný reálný zápas
   * (external_id) i v jiné soutěži, kde hráč taky hraje -- appka tam
   * tip po uložení automaticky propíše (viz
   * syncPredictionToDuplicateMatches v actions.ts). Appka to hráči
   * ukazuje jako TRVALÝ příznak u formuláře (viz
   * src/lib/shared-matches.ts), ne jen jednorázově hned po uložení --
   * uživatel 17.9.2026 nahlásil, že jednorázová hláška po uložení
   * byla matoucí. */
  isSharedMatch?: boolean;
}) {
  const action = submitPrediction.bind(null, sport, competitionId, matchId);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // Signatura posledně odeslaných hodnot -- zabrání zbytečnému opakovanému
  // ukládání (blur i klik na tlačítko krátce po sobě), když se hodnoty
  // mezitím nezměnily.
  const lastSubmittedRef = useRef<string | null>(null);
  // Naplánovaný auto-přeskok na pole hostů (viz focusAwayOnFirstDigit
  // níže) -- potřeba ho umět zrušit, když hráč mezitím napíše druhou
  // číslici nebo komponenta zmizí dřív, než prodleva doběhne.
  const jumpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (jumpTimeoutRef.current) clearTimeout(jumpTimeoutRef.current);
    };
  }, []);

  // Hokej nikdy nekončí remízou -- ani po prodloužení/nájezdech (vítěz
  // vždycky dostane rozhodující gól navíc), takže stejné skóre domácích
  // a hostů je vždycky chyba, bez ohledu na to, jestli je checkbox
  // "prodloužení/nájezdy" zaškrtnutý (uživatel 11.9.2026 nahlásil, že
  // appka zadání remízy u hokeje nijak neřeší). Živá kontrola při psaní
  // (ne až při odeslání), ať appka zafunguje jako okamžitá nápověda, ne
  // až jako chyba po pokusu o uložení.
  const [tieWarning, setTieWarning] = useState(false);

  function checkTie() {
    if (sport !== "hockey") return false;
    const form = formRef.current;
    if (!form) return false;
    const home = form.elements.namedItem(
      "predicted_home_score",
    ) as HTMLInputElement;
    const away = form.elements.namedItem(
      "predicted_away_score",
    ) as HTMLInputElement;
    if (!home.value.trim() || !away.value.trim()) return false;
    return home.value === away.value;
  }

  function recomputeTieWarning() {
    setTieWarning(checkTie());
  }

  // Poslední pojistka -- i kdyby se auto-save/tlačítko dostaly přes
  // recomputeTieWarning výše (např. programové vyplnění pole), formulář
  // se stejně neodešle na server s remízou u hokeje.
  function blockTieSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (checkTie()) {
      e.preventDefault();
      setTieWarning(true);
    }
  }

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
    if (checkTie()) return;

    const overtimeEl = form.elements.namedItem(
      "predicted_overtime_flag",
    ) as HTMLInputElement | null;
    const signature = `${home.value}:${away.value}:${overtimeEl?.checked ?? false}`;
    if (signature === lastSubmittedRef.current) return;

    lastSubmittedRef.current = signature;
    form.requestSubmit();
  }

  // Auto-přeskok na pole hostů (odsouhlaseno s uživatelem 29.8.2026):
  // po zadání PRVNÍ číslice do pole domácích appka počká
  // FOCUS_JUMP_DELAY_MS a pak přesune fokus na pole hostů -- na
  // mobilu tak jde zadat celý tip bez jediného ťuknutí navíc.
  //
  // Přeskok dřív probíhal OKAMŽITĚ (0 ms) -- uživatel 18.9.2026
  // nahlásil, že kvůli tomu nešlo v praxi napsat dvouciferné skóre
  // (10+), protože appka přeskočila dřív, než stihl napsat druhou
  // číslici. Teď appka přeskok jen NAPLÁNUJE a zruší ho, pokud hráč do
  // uplynutí prodlevy napíše druhou číslici (viz jumpTimeoutRef) --
  // druhá kontrola přímo v naplánované funkci (aktuální délka hodnoty
  // + že pole pořád má fokus) je pojistka pro vzácný souběh, kdy by
  // mezi naplánováním a proběhnutím přeskoku hráč stihl přejít jinam
  // sám (např. ťuknutím na jiné pole).
  function focusAwayOnFirstDigit(e: React.ChangeEvent<HTMLInputElement>) {
    recomputeTieWarning();
    if (jumpTimeoutRef.current) {
      clearTimeout(jumpTimeoutRef.current);
      jumpTimeoutRef.current = null;
    }
    if (e.target.value.length !== 1) return;
    const homeInput = e.target;
    jumpTimeoutRef.current = setTimeout(() => {
      jumpTimeoutRef.current = null;
      if (homeInput.value.length !== 1 || document.activeElement !== homeInput) return;
      const away = homeInput.form?.elements.namedItem(
        "predicted_away_score",
      ) as HTMLInputElement | null;
      away?.focus();
    }, FOCUS_JUMP_DELAY_MS);
  }

  // Označení celé hodnoty při vstupu do pole (29.8.2026, na žádost
  // uživatele): u už vyplněného tipu jde tak rovnou přepsat novou
  // hodnotou bez ručního mazání -- platí jak při kliknutí/ťuknutí myší,
  // tak při naskočení fokusu z `focusAwayOnFirstDigit`.
  function selectAllOnFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.select();
  }

  if (variant === "spotlight") {
    return (
      <form
        ref={formRef}
        action={formAction}
        onSubmit={blockTieSubmit}
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
            onFocus={selectAllOnFocus}
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
            onChange={recomputeTieWarning}
            onFocus={selectAllOnFocus}
            onBlur={maybeAutoSave}
            className="h-14 w-16 rounded-2xl border-2 border-white/15 bg-white/5 text-center text-2xl font-extrabold text-white transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {tieWarning && (
          <p className="max-w-[220px] text-center text-xs font-semibold text-warning">
            {TIE_WARNING}
          </p>
        )}

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
          disabled={isPending || tieWarning}
          className="btn-press w-full max-w-[220px] rounded-full bg-accent px-6 py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50 disabled:active:scale-100"
        >
          {isPending ? "Ukládám…" : existing ? "Upravit tip" : "Uložit tip"}
        </button>

        {state.error && (
          <span className="text-center text-xs font-semibold text-red-300">
            {state.error}
          </span>
        )}
        {!state.error && state.syncWarning && (
          <span className="max-w-[220px] text-center text-xs font-semibold text-warning">
            ⚠️ {state.syncWarning}
          </span>
        )}
        {!state.error && !state.syncWarning && isSharedMatch && (
          <span className="max-w-[220px] text-center text-xs font-semibold text-white/60">
            {SHARED_MATCH_NOTE}
          </span>
        )}
      </form>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={blockTieSubmit}
      className="mt-3 flex flex-col items-center gap-2"
    >
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          name="predicted_home_score"
          min={0}
          required
          defaultValue={existing?.predicted_home_score}
          aria-label="Tip skóre domácích"
          onChange={focusAwayOnFirstDigit}
          onFocus={selectAllOnFocus}
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
          onChange={recomputeTieWarning}
          onFocus={selectAllOnFocus}
          onBlur={maybeAutoSave}
          className="w-14 rounded-[10px] border border-border-subtle bg-transparent px-2 py-1 text-center text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      {tieWarning && (
        <p className="max-w-[220px] text-center text-xs font-semibold text-warning">
          {TIE_WARNING}
        </p>
      )}

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
        disabled={isPending || tieWarning}
        className="btn-press rounded-[10px] border border-border-subtle px-3 py-1 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50 disabled:active:scale-100"
      >
        {isPending ? "Ukládám…" : existing ? "Upravit tip" : "Uložit tip"}
      </button>

      {state.error && (
        <span className="text-center text-xs font-semibold text-danger">
          {state.error}
        </span>
      )}
      {!state.error && state.syncWarning && (
        <span className="max-w-[220px] text-center text-xs font-semibold text-warning">
          ⚠️ {state.syncWarning}
        </span>
      )}
      {!state.error && !state.syncWarning && isSharedMatch && (
        <span className="max-w-[220px] text-center text-xs font-semibold text-faint-foreground">
          {SHARED_MATCH_NOTE}
        </span>
      )}
    </form>
  );
}
