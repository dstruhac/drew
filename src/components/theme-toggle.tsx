"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Contrast } from "lucide-react";

// Ruční přepínač vzhledu appky (5.9.2026) -- appka dřív uměla jen
// sledovat systémové nastavení telefonu (`prefers-color-scheme`), což
// dvěma lidem se stejnou appkou na svém telefonu dává různý vzhled
// podle toho, jak má KAŽDÝ z nich nastavený telefon. Volba je vědomě
// jen tři stavy (Podle telefonu/Světlý/Tmavý), ne globální přepínač
// pro celou appku -- uložená per zařízení do localStorage
// ("klopi-theme"), ne v databázi, protože jde o preferenci prohlížeče/
// telefonu, ne o věc, kterou by měl mít hráč stejnou všude.

type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "klopi-theme";

function applyTheme(pref: ThemePreference) {
  if (pref === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", pref);
  }
}

const NEXT: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

// "Contrast" -- napůl vyplněné kolečko -- je zavedený symbol pro
// "automaticky/podle systému" (stejný jako třeba v Notionu). Dřívější
// ikona monitoru s telefonem (5.9.2026) matla uživatele -- vypadala
// spíš jako "přepnout zařízení" než "nech to na telefonu".
const ICON = { system: Contrast, light: Sun, dark: Moon };

const LABEL: Record<ThemePreference, string> = {
  system: "Podle telefonu",
  light: "Světlý režim",
  dark: "Tmavý režim",
};

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setPref(stored);
    }
  }, []);

  function handleClick() {
    const next = NEXT[pref];
    setPref(next);
    if (next === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
    applyTheme(next);
  }

  const Icon = ICON[pref];

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Vzhled appky: ${LABEL[pref]} (klikni pro změnu)`}
      aria-label={`Vzhled appky: ${LABEL[pref]}. Klikni pro změnu.`}
      className="btn-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-subtle text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <Icon className="h-4 w-4" strokeWidth={2.2} />
    </button>
  );
}
