"use client";

import { useActionState, useState } from "react";
import { createHecovacka, type CreateHecovackaState } from "./actions";

const initialState: CreateHecovackaState = { error: null };

const SPORT_LABELS: Record<string, string> = {
  hockey: "hokej",
  football: "fotbal",
  mixed: "mix",
};

// React 19 po každém odeslání formuláře přes akci (`useActionState`)
// vyresetuje needitovaná ("uncontrolled") pole -- i když akce vrátí
// chybu, ne jen při úspěchu. Appka proto drží hodnoty v komponentě
// (`useState`) a posílá je do inputů jako `value`/`checked`, ne přes
// `defaultValue` -- při chybě appka znovu vykreslí formulář se stejnými
// hodnotami, React je needí zahodit.
export function HecovackaForm({
  competitions,
  players,
}: {
  competitions: { id: string; name: string; sport: string }[];
  players: { id: string; display_name: string }[];
}) {
  const [state, formAction, isPending] = useActionState(createHecovacka, initialState);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [limitMode, setLimitMode] = useState<"all" | "limited">("all");
  const [maxMatchesPerDay, setMaxMatchesPerDay] = useState("3");
  const [sourceCompetitionIds, setSourceCompetitionIds] = useState<Set<string>>(new Set());
  const [initialParticipantIds, setInitialParticipantIds] = useState<Set<string>>(new Set());

  function toggleInSet(
    set: Set<string>,
    setSet: (next: Set<string>) => void,
    id: string,
  ) {
    const next = new Set(set);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSet(next);
  }

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-bold">
          Název hecovačky
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={80}
          placeholder="Např. Podzimní klopení"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-[12px] border border-border-subtle bg-transparent px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="description" className="text-sm font-bold">
          O co se hraje
        </label>
        <textarea
          id="description"
          name="description"
          maxLength={300}
          rows={2}
          placeholder="Např. Poražený platí rundu."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-[12px] border border-border-subtle bg-transparent px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <p className="text-xs text-faint-foreground">Nepovinné -- appka to jen zobrazí, nijak to nevymáhá.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="start_date" className="text-sm font-bold">
            Od (nepovinné)
          </label>
          <input
            id="start_date"
            name="start_date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-[12px] border border-border-subtle bg-transparent px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <p className="text-xs text-faint-foreground">
            Nevyplníš-li, hecovačka začne vybírat zápasy hned od založení.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="end_date" className="text-sm font-bold">
            Do kdy
          </label>
          <input
            id="end_date"
            name="end_date"
            type="date"
            required
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-[12px] border border-border-subtle bg-transparent px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">Ze kterých soutěží brát zápasy</span>
        {competitions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Appka zatím nesleduje žádnou soutěž, ze které by šlo vybírat.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {competitions.map((competition) => (
              <label
                key={competition.id}
                className="flex items-center gap-2 rounded-[10px] border border-border-subtle px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <input
                  type="checkbox"
                  name="source_competition_ids"
                  value={competition.id}
                  checked={sourceCompetitionIds.has(competition.id)}
                  onChange={() =>
                    toggleInSet(sourceCompetitionIds, setSourceCompetitionIds, competition.id)
                  }
                  className="h-4 w-4 accent-accent"
                />
                <span className="font-semibold">{competition.name}</span>
                <span className="text-xs text-faint-foreground">
                  ({SPORT_LABELS[competition.sport] ?? competition.sport})
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">Kolik zápasů denně nejvíc</span>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="match_limit_mode"
              value="all"
              checked={limitMode === "all"}
              onChange={() => setLimitMode("all")}
              className="h-4 w-4 accent-accent"
            />
            Všechny
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="match_limit_mode"
              value="limited"
              checked={limitMode === "limited"}
              onChange={() => setLimitMode("limited")}
              className="h-4 w-4 accent-accent"
            />
            Omezit na
            <input
              type="number"
              name="max_matches_per_day"
              min={1}
              value={maxMatchesPerDay}
              onFocus={() => setLimitMode("limited")}
              onChange={(e) => setMaxMatchesPerDay(e.target.value)}
              className="w-16 rounded-[10px] border border-border-subtle bg-transparent px-2 py-1 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            zápasů/den
          </label>
        </div>
        <p className="text-xs text-faint-foreground">
          Když je zápasů víc, appka náhodně vybere tolikhle.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">Koho rovnou přidat</span>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">V appce zatím nejsou žádní další hráči.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {players.map((player) => (
              <label
                key={player.id}
                className="flex items-center gap-2 rounded-[10px] border border-border-subtle px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <input
                  type="checkbox"
                  name="initial_participant_ids"
                  value={player.id}
                  checked={initialParticipantIds.has(player.id)}
                  onChange={() =>
                    toggleInSet(initialParticipantIds, setInitialParticipantIds, player.id)
                  }
                  className="h-4 w-4 accent-accent"
                />
                {player.display_name}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-faint-foreground">
          Přidaným hráčům appka pošle e-mail, že tě přidal(a) do téhle hecovačky. Další hráče
          (i ty, co v appce ještě nemají účet) půjde přidat pozvánkovým odkazem po založení.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="btn-press rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Zakládám…" : "Založit hecovačku"}
        </button>
        {state.error && <span className="text-xs font-semibold text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
