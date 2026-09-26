"use client";

import { useEffect, useState } from "react";
import { ChatPanel, type ChatMessage } from "./chat-panel";

// Záložky "Zápasy"/"Chat" na stránce hecovačky (na žádost uživatele
// 25.9.2026) -- jen pro hecovačky, veřejné soutěže žádný chat nemají.
//
// Obě záložky jsou vykreslené (a ChatPanel má tak pořád aktivní
// realtime podpisku) POŘÁD, appka mezi nimi jen přepíná viditelnost
// (`hidden`), ne mount/unmount -- díky tomu je přepnutí okamžité a
// appka se nemusí znovu přihlašovat k odběru zpráv při každém kliku.
// ChatPanel se vykresluje přímo tady (ne jako hotový React uzel
// předaný zvenčí) -- potřebuje vědět, jestli je záložka Chat zrovna
// aktivní, aby uměl sám označit chat jako přečtený i při příchodu nové
// zprávy zatímco je otevřený (viz `isActive` v chat-panel.tsx).
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
  chatMessages,
  currentUserId,
  displayNameByUserId,
}: {
  competitionId: string;
  initialTab: "matches" | "chat";
  unreadCount: number;
  matchesContent: React.ReactNode;
  chatMessages: ChatMessage[];
  currentUserId: string;
  displayNameByUserId: Record<string, string>;
}) {
  const [tab, setTab] = useState<"matches" | "chat">(initialTab);
  // `useState(initialTab)` čte prop jen při PRVNÍM vykreslení -- pokud
  // appka na tuhle stránku naviguje znovu s jinou hodnotou (typicky
  // klik na ikonku v horní liště, co vede přímo na "?tab=chat", zatímco
  // appka je už na "Zápasech" stejné hecovačky), Next.js komponentu
  // nemusí vůbec remountovat, jen jí pošle nové propy -- appka by tak
  // tiše zůstala na staré záložce (nalezeno Codex review na PR #231,
  // 5. kolo).
  useEffect(() => {
    setTab(initialTab);
    if (initialTab === "chat") {
      // Appka na "?tab=chat" přišla rovnou s chatem otevřeným -- ten se
      // (přes `isActive` v ChatPanelu) sám označí za přečtený, ale
      // odznak na týhle záložce by bez týhle řádky zůstal na starém
      // (kladném) čísle, dokud appka nepřijme další živou zprávu --
      // klidně i po přepnutí zpátky na "Zápasy" (nalezeno Codex review
      // na PR #231, 6. kolo).
      setLiveUnreadCount(0);
    }
  }, [initialTab]);
  // `unreadCount` je jen serverový snapshot z chvíle, kdy appka stránku
  // vykreslila -- appka ho drží dál ve vlastním stavu a průběžně
  // aktualizuje podle živých událostí z ChatPanelu (nová zpráva od
  // jiného hráče, přečtení), jinak by odznak zůstal na staré hodnotě,
  // dokud appka stránku znovu nenačte (nalezeno Codex review na
  // PR #231). Appka na "?tab=chat" (initialTab==="chat") ale start
  // rovnou nuluje -- ze stejného důvodu jako v efektu výše.
  const [liveUnreadCount, setLiveUnreadCount] = useState(
    initialTab === "chat" ? 0 : unreadCount,
  );

  function selectTab(next: "matches" | "chat") {
    setTab(next);
    if (next === "chat") {
      setLiveUnreadCount(0);
    }
    const url = new URL(window.location.href);
    if (next === "chat") {
      url.searchParams.set("tab", "chat");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState(null, "", url);
  }

  function handleIncomingChatMessage() {
    // Zpráva doručená, zatímco appka záložku Chat zrovna ukazuje, se
    // rovnou označí za přečtenou (viz `isActive` v ChatPanelu) -- appka
    // proto odznak nechá na nule, ne aby na chvíli blikl a zase zmizel.
    setLiveUnreadCount((prev) => (tab === "chat" ? 0 : prev + 1));
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
          {liveUnreadCount > 0 && tab !== "chat" && (
            <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {liveUnreadCount > 9 ? "9+" : liveUnreadCount}
            </span>
          )}
        </button>
      </div>

      <div className={tab === "matches" ? "flex flex-col gap-6" : "hidden"}>{matchesContent}</div>
      <div className={tab === "chat" ? "" : "hidden"}>
        <ChatPanel
          competitionId={competitionId}
          initialMessages={chatMessages}
          currentUserId={currentUserId}
          displayNameByUserId={displayNameByUserId}
          isActive={tab === "chat"}
          onIncomingMessage={handleIncomingChatMessage}
        />
      </div>
    </div>
  );
}
