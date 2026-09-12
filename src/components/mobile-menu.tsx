"use client";

import { createContext, useContext, useState } from "react";
import { Menu, X } from "lucide-react";

// Hamburger menu pro hlavičku appky, jen na mobilu (12.9.2026, na
// žádost uživatele: "hlavička je plná"). Sdílí prostor jen s logem a
// fotečkou uživatele (viditelnou vždy) -- vše ostatní (Pravidla,
// přepínače, Odhlásit se) appka na mobilu schová sem, na počítači
// zůstává vidět v hlavičce beze změny (`sm:hidden` na tomhle
// komponentu, `hidden sm:flex` na desktopové verzi v app-header.tsx).
//
// Zavírání: tap mimo panel (neviditelný podklad přes celou obrazovku)
// zavře menu. Odkazy uvnitř (Dashboard, Pravidla) menu zavírají
// výslovně přes MobileMenuLink níže -- appka je dřív nezavírala
// s předpokladem, že přechod na jinou stránku hlavičku (a s ní menu)
// znovu vykreslí zavřenou, ale sdílený layout `(app)` v Next.js
// App Routeru se mezi stránkami NEREMOUNTUJE (to je celý smysl
// sdíleného layoutu), takže si `open` stav neresetuje -- uživatel
// nahlásil 12.9.2026, že menu po kliknutí na Dashboard/Pravidla
// zůstává otevřené. Přepínače (tmavý režim, e-mailová upozornění)
// menu i nadál SCHVÁLNĚ nezavírají po kliknutí -- kdyby menu zmizelo
// hned, appka by schovala i potvrzující bublinu u přepínače
// upozornění, kterou si uživatel výslovně vyžádal (viz
// email-reminders-toggle.tsx).
const MobileMenuContext = createContext<{ close: () => void }>({ close: () => {} });

export function useMobileMenuClose() {
  return useContext(MobileMenuContext).close;
}

export function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Zavřít menu" : "Otevřít menu"}
        aria-expanded={open}
        className="btn-press relative z-50 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-subtle text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        {open ? <X className="h-4 w-4" strokeWidth={2.2} /> : <Menu className="h-4 w-4" strokeWidth={2.2} />}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={close}
          />
          <div className="absolute right-0 top-full z-50 mt-2 flex w-60 flex-col gap-1 rounded-2xl border border-border-subtle bg-surface p-2 shadow-[var(--shadow-card)]">
            <MobileMenuContext.Provider value={{ close }}>{children}</MobileMenuContext.Provider>
          </div>
        </>
      )}
    </div>
  );
}
