"use client";

import { useState, type ReactNode } from "react";

// Zobrazí jen prvních `initialCount` položek (seznam musí přijít už
// seřazený tak, aby "prvních N" odpovídalo tomu, co má být vidět jako
// výchozí — u zápasů buď posledních N odehraných, nebo těch v rámci
// nejbližšího časového okna) + tlačítko na rozbalení zbytku.
//
// Generický přes `T` + `renderItem` (12.9.2026, na žádost uživatele) --
// dřív appka brala rovnou pole hotových `ReactNode` prvků, ale sbalený
// a rozbalený stav teď potřebují RŮZNÝ vzhled jednotlivé položky (na
// mobilu sbaleno = carousel, kartička má fixní šířku; rozbaleno = svislý
// seznam, kartička na šířku celého řádku) -- to jde jen když `renderItem`
// dostane i informaci, jestli je seznam zrovna rozbalený, a vykreslí
// položku podle toho.
export function ExpandableList<T>({
  items,
  initialCount,
  renderItem,
  listClassName = "flex flex-col gap-3",
  expandedListClassName,
}: {
  items: T[];
  initialCount: number;
  renderItem: (item: T, expanded: boolean) => ReactNode;
  /** Třídy pro obalující <ul> ve SBALENÉM stavu -- výchozí je svislý
   * seznam, ale appka místy přechází na mřížku/carousel (viz
   * spaces/[id]/page.tsx). */
  listClassName?: string;
  /** Třídy pro obalující <ul> v ROZBALENÉM stavu ("Zobrazit všechny").
   * Když nejsou zadané, appka použije stejné jako ve sbaleném stavu. */
  expandedListClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > initialCount;
  const visible = expanded ? items : items.slice(0, initialCount);

  return (
    <>
      {visible.length > 0 && (
        <ul className={expanded ? (expandedListClassName ?? listClassName) : listClassName}>
          {visible.map((item) => renderItem(item, expanded))}
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
