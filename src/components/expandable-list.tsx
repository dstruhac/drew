"use client";

import { useState, type ReactNode } from "react";

// Na mobilu appka carouselem ukazuje VŽDY úplně všechny položky (žádné
// omezení -- swipuje se) -- na počítači zůstává dřívější chování:
// jen prvních `initialCount` položek + tlačítko na rozbalení zbytku
// (12.9.2026, na žádost uživatele: "do carouselu chci všechny zápasy,
// které je možné zobrazit v dané sekci"). Appka proto vykresluje DVĚ
// oddělené <ul> (jedna viditelná jen do `sm:`, druhá jen od `sm:`) --
// nejde totiž mít jeden seznam v DOM, který by měl na mobilu jiný
// POČET položek než na počítači, jen pomocí CSS breakpointů (ty umí
// položky schovat, ne "domyslet" další, které appka vůbec
// nevykreslila).
//
// Tlačítko zůstává jedno sdílené pro oba pohledy: na počítači pořád
// dělá to, co dělalo vždycky (odhalí zbytek v mřížce); na mobilu teď
// jen kosmeticky přepne z carouselu na svislý seznam (obojí ukazuje
// úplně všechno, mění se jen vzhled) -- odsouhlaseno s uživatelem,
// který uznal, že tam tlačítko "trochu ztrácí smysl", ale nevadí mu
// to.
//
// 12.9.2026, opraven pád "otevřít soutěž" na produkci: appka dřív
// místo hotových položek posílala funkci `renderItem` -- ale
// ExpandableList je Client Component a tahle stránka (spaces/[id])
// Server Component, a Next.js přes tuhle hranici NEUMÍ poslat obyčejnou
// funkci (jen Server Actions), takže render vždycky spadl s "Functions
// cannot be passed directly to Client Components". Řešení: appka
// položky vykreslí (MatchCard) už na serveru, ve OBOU vzhledech
// (carousel i stack) předem -- ExpandableList pak jen přepíná mezi
// dvěma hotovými poli JSX uzlů (ty už serializovat jde, na rozdíl od
// funkce), žádné volání komponenty na klientovi.
const MOBILE_CAROUSEL_CLASSNAME =
  "sm:hidden flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1";
const MOBILE_STACK_CLASSNAME = "sm:hidden flex flex-col gap-3";
const DESKTOP_GRID_CLASSNAME = "hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3";

export function ExpandableList({
  initialCount,
  carouselItems,
  stackItems,
}: {
  initialCount: number;
  /** Všechny položky, už vykreslené s `layout="carousel"` -- appka je
   * ukáže na mobilu ve sbaleném stavu. */
  carouselItems: ReactNode[];
  /** Stejné položky, znovu vykreslené s `layout="stack"` -- appka je
   * použije na mobilu po rozbalení a vždy v desktopové mřížce (tam se
   * carousel vzhled stejně nikdy neukáže). */
  stackItems: ReactNode[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = stackItems.length > initialCount;
  const desktopVisible = expanded ? stackItems : stackItems.slice(0, initialCount);

  return (
    <>
      <ul className={expanded ? MOBILE_STACK_CLASSNAME : MOBILE_CAROUSEL_CLASSNAME}>
        {expanded ? stackItems : carouselItems}
      </ul>

      {desktopVisible.length > 0 && (
        <ul className={DESKTOP_GRID_CLASSNAME}>{desktopVisible}</ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="btn-press self-start text-xs font-bold text-accent transition-colors hover:underline"
        >
          {expanded ? "Zobrazit méně" : `Zobrazit všechny (${stackItems.length})`}
        </button>
      )}
    </>
  );
}
