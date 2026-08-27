"use client";

import { useState, type ReactNode } from "react";

// Zobrazí jen prvních `initialCount` položek (seznam musí přijít už
// seřazený tak, aby "prvních N" odpovídalo tomu, co má být vidět jako
// výchozí — u zápasů buď posledních N odehraných, nebo těch v rámci
// nejbližšího časového okna) + tlačítko na rozbalení zbytku.
export function ExpandableList({
  items,
  initialCount,
  emptyInitialHint,
}: {
  items: ReactNode[];
  initialCount: number;
  /** Text zobrazený místo prázdného seznamu, když initialCount === 0, ale položky existují (např. "nejbližší zápas je dál než za týden"). */
  emptyInitialHint?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = items.length > initialCount;
  const visible = expanded ? items : items.slice(0, initialCount);

  return (
    <>
      {visible.length > 0 ? (
        <ul className="flex flex-col gap-3">{visible}</ul>
      ) : (
        emptyInitialHint && (
          <p className="text-xs text-black/40 dark:text-white/40">
            {emptyInitialHint}
          </p>
        )
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="self-start text-xs font-medium text-black/60 dark:text-white/60 hover:underline"
        >
          {expanded ? "Zobrazit méně" : `Zobrazit všechny (${items.length})`}
        </button>
      )}
    </>
  );
}
