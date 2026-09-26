"use client";

import { useState } from "react";
import { X, Copy, Check, UserPlus, ChevronDown } from "lucide-react";
import { addHecovackaPlayer, removeHecovackaPlayer } from "./actions";

// Zobrazí se navíc na detailu soukromé soutěže (hecovačky) -- popisek
// "o co se hraje", datum konce, zdrojové soutěže, seznam hráčů a (jen
// tvůrci) pozvánkový odkaz + přidávání dalších hráčů appky. Tvůrce se
// pozná podle isOwner (competition.created_by === přihlášený uživatel) --
// ostatní participanti vidí jen přehled, žádné ovládací prvky.
export function HecovackaPanel({
  competitionId,
  isOwner,
  isArchived,
  description,
  endDate,
  sourceNames,
  participants,
  candidates,
  inviteUrl,
}: {
  competitionId: string;
  isOwner: boolean;
  /** `true` po uplynutí end_date (archivuje hecovacky.mjs) -- appka se
   * "zakonzervuje": zmizí pozvánkový odkaz, přidávání i odebírání
   * hráčů, "Hraje se do" se změní na "Skončilo" (uživatel 21.9.2026,
   * appka dřív nechávala ovládací prvky funkční i po konci hecovačky,
   * což nedávalo smysl). */
  isArchived: boolean;
  description: string | null;
  endDate: string | null;
  sourceNames: string[];
  participants: { userId: string; displayName: string }[];
  candidates: { id: string; display_name: string }[];
  inviteUrl: string | null;
}) {
  // Panel appka defaultně sbaluje (na žádost uživatele 26.9.2026 --
  // vadil mu nad chatem, informace v něm hráč většinou zná už od
  // založení/první návštěvy). Appka si sbalení nepamatuje mezi
  // návštěvami, jen po dobu, co je stránka otevřená.
  const [expanded, setExpanded] = useState(false);
  const [showAddPicker, setShowAddPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyInviteLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API může selhat (oprávnění, needle kontext) -- appka
      // v tom případě jen nic neudělá, odkaz zůstává vypsaný v textu.
    }
  }

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface-hover">
      {/* Panel appka sbaluje pod tenhle řádek (na žádost uživatele
       * 26.9.2026 -- na mobilu vadil nad chatem, informace uvnitř
       * hráč většinou zná už od založení/první návštěvy). Stav
       * skončení appka nechává vidět i sbalený, ať je na první pohled
       * jasné, jestli se ještě hraje. */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="btn-press flex w-full items-center justify-between gap-2 p-4 text-left text-sm font-bold"
      >
        <span className="flex flex-wrap items-center gap-2">
          Info o hecovačce
          {isArchived && (
            <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-foreground">
              🏁 Skončila
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          strokeWidth={2.4}
        />
      </button>

      {expanded && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          {description && (
            <p className="text-sm">
              <span className="font-bold text-muted-foreground">O co se hraje: </span>
              <span className="font-medium">{description}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold text-muted-foreground">
            {endDate && (
              <span>
                {isArchived ? "Hrálo se do" : "Hraje se do"}{" "}
                {new Date(endDate).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })}
              </span>
            )}
            {sourceNames.length > 0 && (
              <span className="flex flex-wrap items-center gap-1.5">
                Zápasy z:
                {sourceNames.map((name) => (
                  <span key={name} className="rounded-full border border-border-subtle px-2 py-0.5">
                    {name}
                  </span>
                ))}
              </span>
            )}
          </div>

          {isOwner && !isArchived && inviteUrl && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold">Pozvánkový odkaz:</span>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-2 py-1 text-xs">
                  {inviteUrl}
                </code>
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="btn-press flex shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs font-bold text-accent hover:bg-accent/10"
                >
                  {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2.4} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2.4} />}
                  {copied ? "Zkopírováno" : "Zkopírovat"}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-muted-foreground">
              Hráči ({participants.length})
            </span>
            <ul className="flex flex-wrap gap-2">
              {participants.map((p) => (
                <li
                  key={p.userId}
                  className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs font-semibold"
                >
                  {p.displayName}
                  {isOwner && !isArchived && (
                    <form action={removeHecovackaPlayer.bind(null, competitionId, p.userId)}>
                      <button
                        type="submit"
                        aria-label={`Odebrat ${p.displayName}`}
                        className="text-faint-foreground transition-colors hover:text-danger"
                      >
                        <X className="h-3 w-3" strokeWidth={2.6} />
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {isOwner && !isArchived && candidates.length > 0 && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setShowAddPicker((v) => !v)}
                className="btn-press flex w-fit items-center gap-1.5 text-xs font-bold text-accent hover:underline"
              >
                <UserPlus className="h-3.5 w-3.5" strokeWidth={2.4} />
                {showAddPicker ? "Skrýt seznam hráčů" : "Přidat hráče ze seznamu appky"}
              </button>
              {showAddPicker && (
                <ul className="flex flex-wrap gap-2">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <form action={addHecovackaPlayer.bind(null, competitionId, c.id)}>
                        <button
                          type="submit"
                          className="btn-press rounded-full border border-border-subtle px-3 py-1 text-xs font-semibold hover:border-accent hover:text-accent"
                        >
                          + {c.display_name}
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
