"use client";

import { useState } from "react";

// Přepínač "Soutěže"/"Hecovačky" na Dashboardu (na žádost uživatele
// 29.9.2026 -- appka dřív obě sekce ukazovala pod sebou napořád, což
// s víc hraných soutěžemi i hecovačkami dělalo z Dashboardu dlouhý,
// nepřehledný sled kartiček). Appka vzhled záměrně odlišuje od
// tlumených záložek na detailu hecovačky (SpaceTabs, tenký podtržený
// pruh) -- uživatel chtěl "výrazné", appka proto zvolila plný
// (segmentovaný) přepínač jako u appčiných "pompézních" tlačítek
// (Chci hrát, Založit hecovačku) -- vyplněné pozadí u aktivní volby,
// ne jen barvu textu/podtržení.
export function DashboardTabs({
  competitionsCount,
  hecovackyCount,
  unreadHecovackaChatCount,
  competitionsContent,
  hecovackyContent,
}: {
  competitionsCount: number;
  hecovackyCount: number;
  unreadHecovackaChatCount: number;
  competitionsContent: React.ReactNode;
  hecovackyContent: React.ReactNode;
}) {
  // Výchozí záložka je "Soutěže", KROMĚ hráče, co nehraje žádnou
  // veřejnou soutěž, ale má aspoň jednu hecovačku -- appka by ho jinak
  // uvítala prázdnou záložkou "Soutěže" a schovala jedinou relevantní
  // sekci (i s případným odznakem nepřečteného chatu) za druhý klik
  // (nalezeno vlastní code-review).
  const [tab, setTab] = useState<"competitions" | "hecovacky">(
    competitionsCount === 0 && hecovackyCount > 0 ? "hecovacky" : "competitions",
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        className="inline-flex w-fit gap-1 self-start rounded-full border border-border-subtle bg-surface-hover p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "competitions"}
          onClick={() => setTab("competitions")}
          className={`btn-press rounded-full px-4 py-2 text-sm font-bold transition-colors ${
            tab === "competitions"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Soutěže <span className="opacity-70">({competitionsCount})</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "hecovacky"}
          onClick={() => setTab("hecovacky")}
          className={`btn-press relative rounded-full px-4 py-2 text-sm font-bold transition-colors ${
            tab === "hecovacky"
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Hecovačky <span className="opacity-70">({hecovackyCount})</span>
          {/* Odznak nepřečtených zpráv appka na tenhle tab dává schválně --
           * dřív appka obě sekce ukazovala napořád, takže nepřečtený chat
           * hecovačky byl vidět rovnou. Za záložkou by appka jinak o
           * nepřečtené zprávě nechala hráče, co je zrovna na "Soutěžích",
           * nic nevědět. */}
          {unreadHecovackaChatCount > 0 && tab !== "hecovacky" && (
            <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">
              {unreadHecovackaChatCount > 9 ? "9+" : unreadHecovackaChatCount}
            </span>
          )}
        </button>
      </div>

      <div className={tab === "competitions" ? "flex flex-col gap-4" : "hidden"}>
        {competitionsContent}
      </div>
      <div className={tab === "hecovacky" ? "flex flex-col gap-4" : "hidden"}>
        {hecovackyContent}
      </div>
    </div>
  );
}
