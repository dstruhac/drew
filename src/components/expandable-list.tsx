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
const MOBILE_CAROUSEL_CLASSNAME =
  "sm:hidden flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1";
const MOBILE_STACK_CLASSNAME = "sm:hidden flex flex-col gap-3";
const DESKTOP_GRID_CLASSNAME = "hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3";

export function ExpandableList<T>({
  items,
  initialCount,
  renderItem,
}: {
  items: T[];
  initialCount: number;
  /** `layout` je "carousel"/"stack" na mobilu (podle toho, co appka
   * zrovna vykresluje), vždy "stack" pro desktopovou mřížku (tam se
   * mobilní carousel styl stejně nikdy nezobrazí, viz MatchCard). */
  renderItem: (item: T, layout: "carousel" | "stack") => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > initialCount;
  const desktopVisible = expanded ? items : items.slice(0, initialCount);

  return (
    <>
      <ul className={expanded ? MOBILE_STACK_CLASSNAME : MOBILE_CAROUSEL_CLASSNAME}>
        {items.map((item) => renderItem(item, expanded ? "stack" : "carousel"))}
      </ul>

      {desktopVisible.length > 0 && (
        <ul className={DESKTOP_GRID_CLASSNAME}>
          {desktopVisible.map((item) => renderItem(item, "stack"))}
        </ul>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="btn-press self-start text-xs font-bold text-accent transition-colors hover:underline"
        >
          {expanded ? "Zobrazit méně" : `Zobrazit všechny (${items.length})`}
        </button>
      )}
    </>
  );
}
