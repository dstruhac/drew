"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import type { UnreadHecovacka } from "@/lib/hecovacka-chat";

// Ikonka vedle fotečky v horní liště appky (na žádost uživatele
// 25.9.2026), viditelná odkudkoliv v appce (AppHeader je sdílený
// layout) -- svítí, jen když má hráč nepřečtenou zprávu v chatu
// nějaké hecovačky.
//
// Nepřečtená zpráva jen v JEDNÉ hecovačce -> klik vede rovnou tam
// (do chatu, ne na Dashboard). Ve VÍC hecovačkách najednou appka
// nemá jak vybrat "tu jednu pravou", takže místo toho rozbalí malé
// menu (stejný vzor jako MobileMenu) se seznamem -- klik na konkrétní
// položku vede rovnou do jejího chatu.
export function ChatNotificationIndicator({ items }: { items: UnreadHecovacka[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [open]);

  if (items.length === 0) return null;

  const iconButtonClass =
    "btn-press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-subtle text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground";
  const dot = <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />;

  if (items.length === 1) {
    return (
      <Link
        href={`/spaces/${items[0].competitionId}?tab=chat`}
        title={`Nová zpráva v chatu: ${items[0].name}`}
        aria-label={`Nová zpráva v chatu: ${items[0].name}`}
        className={iconButtonClass}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
        {dot}
      </Link>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Nové zprávy v chatu"
        aria-expanded={open}
        className={iconButtonClass}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
        {dot}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 flex w-64 flex-col gap-1 rounded-2xl border border-border-subtle bg-surface p-2 shadow-[var(--shadow-card)]">
            <p className="px-2 py-1 text-xs font-bold text-muted-foreground">Nové zprávy</p>
            {items.map((item) => (
              <Link
                key={item.competitionId}
                href={`/spaces/${item.competitionId}?tab=chat`}
                onClick={() => setOpen(false)}
                className="btn-press flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface-hover"
              >
                {item.name}
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {item.unreadCount > 9 ? "9+" : item.unreadCount}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
