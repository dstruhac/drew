"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { toggleEmailReminders, type ToggleRemindersState } from "./app-header-actions";

// Přepínač e-mailových upozornění v hlavičce appky. Barevné vyplnění
// (11.9.2026) samo o sobě řešilo "je to zapnuté, nebo se to zapne
// kliknutím", ale uživatel chtěl navíc explicitní potvrzení PO
// kliknutí ("ať na mě vyskočí tooltipek, že upozornění zapnuto") --
// samotná barva se dá přehlídnout, věta ne. Krátce se objevující
// bublina pod tlačítkem, sama zmizí po ~2,5 s.
export function EmailRemindersToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [state, formAction, isPending] = useActionState<ToggleRemindersState, FormData>(
    toggleEmailReminders,
    { enabled: initialEnabled },
  );
  const [toastText, setToastText] = useState<string | null>(null);
  // Toast se má ukázat jen po SKUTEČNÉ změně stavu (klik), ne při
  // počátečním vykreslení. Neřešit to příznakem "už proběhl první
  // render" -- React ve vývoji (Strict Mode) efekt při mountu spustí
  // dvakrát (mount → cleanup → mount znovu, kvůli odhalení chybějícího
  // úklidu), takže by se takový příznak stihl přepnout na "true" už
  // při prvním z těch dvou spuštění a druhé by pak omylem ukázalo
  // toast hned po načtení stránky (ověřeno Playwrightem 11.9.2026).
  // Porovnání s poslední SKUTEČNĚ zpracovanou hodnotou funguje správně
  // v obou případech, protože se mezi dvěma spuštěními efektu na
  // stejném mountu hodnota `state.enabled` nezměnila.
  const lastHandledValue = useRef(initialEnabled);

  useEffect(() => {
    if (state.enabled === lastHandledValue.current) return;
    lastHandledValue.current = state.enabled;
    setToastText(state.enabled ? "🔔 Upozornění zapnuto" : "🔕 Upozornění vypnuto");
    const timeout = setTimeout(() => setToastText(null), 2500);
    return () => clearTimeout(timeout);
  }, [state.enabled]);

  return (
    <div className="relative">
      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending}
          role="switch"
          aria-checked={state.enabled}
          aria-label={
            state.enabled
              ? "Vypnout e-mailová upozornění na nevyplněný tip"
              : "Zapnout e-mailová upozornění na nevyplněný tip"
          }
          title={
            state.enabled
              ? "E-mailová upozornění: zapnuto (klikni pro vypnutí)"
              : "E-mailová upozornění: vypnuto (klikni pro zapnutí)"
          }
          className={`btn-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-60 ${
            state.enabled
              ? "border-transparent bg-accent text-accent-foreground hover:opacity-90"
              : "border-border-subtle text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          }`}
        >
          {state.enabled ? (
            <Bell className="h-4 w-4" strokeWidth={2.2} />
          ) : (
            <BellOff className="h-4 w-4" strokeWidth={2.2} />
          )}
        </button>
      </form>

      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none absolute right-0 top-full z-10 mt-2 whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-xs font-bold text-background shadow-[var(--shadow-card)] transition-all duration-200 ${
          toastText ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
        }`}
      >
        {toastText}
      </div>
    </div>
  );
}
