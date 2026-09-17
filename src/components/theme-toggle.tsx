"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

// Ruční přepínač vzhledu appky (5.9.2026) -- appka dřív uměla jen
// sledovat systémové nastavení telefonu (`prefers-color-scheme`), což
// dvěma lidem se stejnou appkou na svém telefonu dává různý vzhled
// podle toho, jak má KAŽDÝ z nich nastavený telefon. Uložená volba je
// per zařízení v localStorage ("klopi-theme"), ne v databázi, protože
// jde o preferenci prohlížeče/telefonu, ne o věc, kterou by měl mít
// hráč stejnou všude.
//
// Přepínač měl dřív tři stavy (Podle telefonu/Světlý/Tmavý) -- appka
// je zúžila na dva (17.9.2026, na žádost uživatele "stačí jenom 2
// stavy, ten třetí mezistav nechci"). Appka ale systémové nastavení
// nepřestala respektovat úplně: dokud si hráč sám nic nezvolí (žádný
// záznam v localStorage), appka při načtení stránky JEDNORÁZOVĚ zjistí
// aktuální systémové nastavení jen kvůli tomu, aby ikona hned od
// začátku ukazovala vzhled, který appka skutečně používá -- appka
// stejně jako dřív zobrazuje světlý/tmavý vzhled podle systému přes
// CSS media query (viz globals.css) i blokující skript v layout.tsx,
// dokud hráč sám neklikne. Po prvním kliknutí je volba už natrvalo
// explicitní (Světlý/Tmavý), appka se ke "sleduj systém" žádným
// tlačítkem už nevrací -- přesně to uživatel nechtěl ("ten třetí
// mezistav nechci").
type Theme = "light" | "dark";

const STORAGE_KEY = "klopi-theme";

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

const LABEL: Record<Theme, string> = {
  light: "Světlý režim",
  dark: "Tmavý režim",
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
  }, []);

  function handleClick() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  const Icon = theme === "dark" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Vzhled appky: ${LABEL[theme]} (klikni pro změnu)`}
      aria-label={`Vzhled appky: ${LABEL[theme]}. Klikni pro změnu.`}
      className="btn-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-subtle text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <Icon className="h-4 w-4" strokeWidth={2.2} />
    </button>
  );
}
