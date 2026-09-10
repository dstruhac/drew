"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { CompetitionCard } from "@/components/competition-card";
import type { CompetitionSport } from "@/lib/supabase/database.types";

type Competition = {
  id: string;
  name: string;
  sport: CompetitionSport;
  logo_url: string | null;
  description: string | null;
};

// Ukáže se hráči, který na Dashboardu ještě nemá žádnou soutěž --
// bez tohohle appka novému hráči po prvním přihlášení neukázala vůbec
// nic (uživatel nahlásil 10.9.2026). Nabízí VŠECHNY dosud nepřidané
// soutěže najednou, ať si hráč hned na startu vybere klidně víc, místo
// aby appka po prvním kliknutí zmizela zpátky na prázdný dashboard.
//
// `shouldOpenInitially` se čte jen PŘI PRVNÍM vykreslení (useState
// ignoruje pozdější změny propu) -- modal tak zůstane otevřený, i když
// hráč uvnitř přiklikne první soutěž a Dashboard (server komponenta)
// se kvůli revalidaci znovu vykreslí s už zúženým seznamem
// `competitions`. Zavře se jen ručně (křížek/tlačítko dole) a znovu
// samo naskočí až při dalším načtení stránky, pokud hráč pořád nehraje
// nic -- jakmile má aspoň jednu soutěž, přestane se appce vyplácet ho
// otravovat a modal dál necvakne.
export function JoinCompetitionsModal({
  competitions,
  shouldOpenInitially,
}: {
  competitions: Competition[];
  shouldOpenInitially: boolean;
}) {
  const [open, setOpen] = useState(shouldOpenInitially);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[26px] bg-surface shadow-[var(--shadow-card)]">
        <div className="flex items-start justify-between gap-4 border-b border-border-subtle p-6">
          <div>
            <h2 className="text-lg font-extrabold">Vítej v Klopi! 👋</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Vyber si soutěže, které chceš tipovat -- klidně víc najednou.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Zavřít"
            className="btn-press shrink-0 rounded-full p-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {competitions.length === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">
              Hraješ už úplně všechno, co appka nabízí. 🎉
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {competitions.map((competition) => (
                <li key={competition.id}>
                  <CompetitionCard competition={competition} rank={null} isJoined={false} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border-subtle p-4 text-center">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-press rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90"
          >
            Hotovo, jdu na Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
