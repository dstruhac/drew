"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { MobileMenuLink } from "@/components/mobile-menu-link";
import { getMyCompetitionsForMenu, type MenuCompetition } from "@/components/app-header-actions";

// Rozklikávací položka "Soutěže" uvnitř hamburger menu (12.9.2026, na
// žádost uživatele). Seznam soutěží, které hráč hraje, se NAČÍTÁ AŽ
// PŘI ROZKLIKNUTÍ (server akce getMyCompetitionsForMenu), ne rovnou
// při vykreslení hlavičky -- appka jinak byla kdysi pomalá kvůli
// dotazům, které se dělaly na každé stránce, i když je nikdo
// nepotřeboval (viz docs/PROJECT.md, "Výkon"). Jednou načtený seznam
// se drží v paměti komponenty, ať se druhé rozkliknutí neptá znovu.
export function MobileMenuCompetitions() {
  const [expanded, setExpanded] = useState(false);
  const [competitions, setCompetitions] = useState<MenuCompetition[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (!expanded && competitions === null) {
      startTransition(async () => {
        setCompetitions(await getMyCompetitionsForMenu());
      });
    }
    setExpanded((v) => !v);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="btn-press flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-hover"
      >
        Soutěže
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          strokeWidth={2.4}
        />
      </button>

      {expanded && (
        <div className="ml-3 flex flex-col gap-0.5 border-l border-border-subtle py-1 pl-2">
          {isPending && (
            <span className="px-3 py-1.5 text-xs font-semibold text-faint-foreground">Načítám…</span>
          )}
          {!isPending && competitions?.length === 0 && (
            <span className="px-3 py-1.5 text-xs font-semibold text-faint-foreground">
              Zatím nehraješ žádnou soutěž.
            </span>
          )}
          {!isPending &&
            competitions?.map((competition) => (
              <MobileMenuLink
                key={competition.id}
                href={`/spaces/${competition.id}`}
                className="btn-press truncate rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                {competition.name}
              </MobileMenuLink>
            ))}
          <MobileMenuLink
            href="/spaces"
            className="btn-press rounded-lg px-3 py-1.5 text-sm font-bold text-accent hover:bg-surface-hover"
          >
            Všechny soutěže →
          </MobileMenuLink>
        </div>
      )}
    </div>
  );
}
