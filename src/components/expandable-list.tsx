"use client";

import { useState, type ReactNode } from "react";

// Zobrazí jen prvních `initialCount` položek (seznam musí přijít už
// seřazený tak, aby "prvních N" odpovídalo tomu, co má být vidět jako
// výchozí — u zápasů buď posledních N odehraných, nebo těch v rámci
// nejbližšího časového okna) + tlačítko na rozbalení zbytku.
export function ExpandableList({
  items,
  initialCount,
  listClassName = "flex flex-col gap-3",
}: {
  items: ReactNode[];
  initialCount: number;
  /** Třídy pro obalující <ul> -- výchozí je svislý seznam, ale na
   * širších obrazovkách appka místy přechází na mřížku (viz
   * spaces/[id]/page.tsx). */
  listClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > initialCount;
  const visible = expanded ? items : items.slice(0, initialCount);

  return (
    <>
      {visible.length > 0 && <ul className={listClassName}>{visible}</ul>}

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
