"use client";

import { useEffect, useState } from "react";
import { markHecovackaChatRead } from "./actions";

// Záložky "Zápasy"/"Chat" na stránce hecovačky (na žádost uživatele
// 25.9.2026) -- jen pro hecovačky, veřejné soutěže žádný chat nemají.
//
// Obě záložky jsou vykreslené (a ChatPanel má tak pořád aktivní
// realtime podpisku) POŘÁD, appka mezi nimi jen přepíná viditelnost
// (`hidden`), ne mount/unmount -- díky tomu je přepnutí okamžité a
// appka se nemusí znovu přihlašovat k odběru zpráv při každém kliku.
//
// URL appka mění přes history.replaceState, NE přes next/navigation
// router -- ten by (na rozdíl od History API) vyvolal nové
// server-side vykreslení stránky jen kvůli přepnutí záložky, což by
// zbytečně sekalo (appka slíbila uživateli "okamžité" přepnutí bez
// znovunačtení).
export function SpaceTabs({
  competitionId,
  initialTab,
  unreadCount,
  matchesContent,
  chatContent,
}: {
  competitionId: string;
  initialTab: "matches" | "chat";
  unreadCount: number;
  matchesContent: React.ReactNode;
  chatContent: React.ReactNode;
}) {
  const [tab, setTab] = useState<"matches" | "chat">(initialTab);

  useEffect(() => {
    if (tab === "chat") {
      markHecovackaChatRead(competitionId);
    }
    // Účelně jen na `tab` -- appka nechce znovu volat při každém
    // renderu, jen při skutečném přepnutí (nebo hned při načtení, když
    // appka otevřela rovnou "?tab=chat").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  function selectTab(next: "matches" | "chat") {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "chat") {
      url.searchParams.set("tab", "chat");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="flex gap-1 border-b border-border-subtle">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "matches"}
          onClick={() => selectTab("matches")}
          className={`btn-press -mb-px border-b-2 px-3 py-2 text-sm font-bold transition-colors ${
            tab === "matches"
              ? "border-accent text-accent"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Zápasy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "chat"}
          onClick={() => selectTab("chat")}
          className={`btn-press relative -mb-px border-b-2 px-3 py-2 text-sm font-bold transition-colors ${
            tab === "chat"
              ? "border-accent text-accent"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Chat
          {unreadCount > 0 && tab !== "chat" && (
            <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>

      <div className={tab === "matches" ? "flex flex-col gap-6" : "hidden"}>{matchesContent}</div>
      <div className={tab === "chat" ? "" : "hidden"}>{chatContent}</div>
    </div>
  );
}
