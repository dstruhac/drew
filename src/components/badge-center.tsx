"use client";

import { useEffect, useState } from "react";
import { Medal, X } from "lucide-react";
import { markBadgesSeen } from "@/app/(app)/dashboard/actions";
import { RARITY_LABELS } from "@/lib/rarity";
import { CardTile, type CardData } from "@/components/card-tile";
import { ClickableCardTile } from "@/components/clickable-card-tile";

type BadgeRow = {
  competition_id: string;
  week_start: string;
  user_id: string;
  points: number;
  competitions: { name: string; sport: "hockey" | "football" | "mixed" } | null;
  profiles: { display_name: string } | null;
};

// Jeden nový kalendářní týden, ve kterém hráč vyhrál -- i když vyhrál
// víc soutěží najednou, dostal za ten týden jen JEDNU kartu (viz
// award-weekly-badges.mjs), proto se modal staví z týdnů, ne z
// jednotlivých medailí.
type NewWeek = {
  weekStart: string;
  competitionNames: string[];
  card: CardData | null;
};

function formatBadgeWeek(weekStartDate: string) {
  const format = (date: Date) =>
    date.toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      timeZone: "Europe/Prague",
    });
  const start = new Date(weekStartDate);
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  return `${format(start)}–${format(end)}`;
}

// Seskupí cizí výhry podle hráče+soutěže -- jeden hráč může mít víc
// medailí ve stejné soutěži, pokud dashboard nenavštívil delší dobu.
function groupOthers(rows: BadgeRow[]) {
  const groups = new Map<
    string,
    { displayName: string; competitionName: string; count: number }
  >();
  for (const row of rows) {
    const key = `${row.user_id}-${row.competition_id}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        displayName: row.profiles?.display_name ?? "Neznámý hráč",
        competitionName: row.competitions?.name ?? "Neznámá soutěž",
        count: 1,
      });
    }
  }
  return [...groups.values()];
}

// Centrální místo pro vše kolem medailí za vítězství týdne na
// dashboardu (nahrazuje dřívější badge-celebration-modal.tsx +
// badge-celebration-watcher.tsx): gratulační modal za vlastní výhru
// (teď včetně sběratelské karty, kterou hráč tou výhrou dostal),
// informační banner o cizí výhře a samotná Sbírka artefaktů -- teď
// mřížka karet místo dřívějších holých ikonek medaile.
//
// "Už jsi to viděl" se řeší na serveru (profiles.badges_seen_through),
// ne v localStorage -- appka to teda nezopakuje na jiném zařízení.
// Jen JEDNA z modal/banner se kdy zobrazí zároveň (modal, pokud hráč
// sám něco vyhrál -- v tom případě obsahuje i zmínku o ostatních --
// jinak banner, pokud vyhrál někdo jiný), aby appka nezahltila hráče
// víc upozorněními na totéž.
export function BadgeCenter({
  myBadges,
  othersNewBadges,
  markSeenThrough,
  allCards,
  ownedCards,
  newWeeks,
  children,
}: {
  myBadges: BadgeRow[];
  othersNewBadges: BadgeRow[];
  markSeenThrough: string | null;
  // Celý katalog karet (1-50, zatím prvních 10), seřazený podle čísla
  // -- pro mřížku "Sbírka artefaktů" včetně zamčených slotů.
  allCards: CardData[];
  // Vlastní sbírka -- card_id -> počet kusů (>1 = duplicita).
  ownedCards: Map<number, number>;
  // Nové týdny (po badges_seen_through), ve kterých hráč sám vyhrál --
  // řídí gratulační modal i "odemykací" animaci v mřížce níže.
  newWeeks: NewWeek[];
  // Zbytek obsahu dashboardu (vysvícený zápas, Tvoje soutěže) --
  // banner musí vyjít NAD tímhle obsahem, mřížka karet AŽ POD ním,
  // a obojí musí sdílet stav "revealed" s modalem, takže celý zbytek
  // stránky prochází přes tuhle komponentu jako children, místo aby
  // šlo o dva nezávislé kusy JSX v page.tsx.
  children: React.ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(newWeeks.length > 0);
  const [bannerOpen, setBannerOpen] = useState(
    newWeeks.length === 0 && othersNewBadges.length > 0,
  );
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!modalOpen) return;
    import("canvas-confetti").then(({ default: confetti }) => {
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.3 },
        colors: ["#16a34a", "#22c55e", "#ffd166", "#ffffff"],
      });
    });
    // Jen při prvním vykreslení modalu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function dismissModal() {
    setModalOpen(false);
    setRevealed(true);
    if (markSeenThrough) await markBadgesSeen(markSeenThrough);
    requestAnimationFrame(() => {
      document.getElementById("artefakty")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  async function dismissBanner() {
    setBannerOpen(false);
    if (markSeenThrough) await markBadgesSeen(markSeenThrough);
  }

  const othersGrouped = groupOthers(othersNewBadges);
  const newCardIds = new Set(
    newWeeks.map((w) => w.card?.id).filter((id): id is number => id !== undefined && id !== null),
  );

  return (
    <>
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-[26px] bg-[#15171c] p-8 text-center">
            <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-accent/25" />

            <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent animate-[celebrate-pop_0.6s_var(--ease-bounce)]">
              <Medal className="h-8 w-8 text-accent-foreground" strokeWidth={2} />
            </div>
            <h2 className="relative mt-4 text-lg font-extrabold text-white">
              Gratuluju, jsi jednooký mezi slepými.
            </h2>

            <ul className="relative mt-4 flex flex-col gap-3">
              {newWeeks.map((week) => (
                <li key={week.weekStart} className="flex items-center gap-3 text-left">
                  {week.card && (
                    <div className="w-16 shrink-0">
                      <CardTile card={week.card} owned quantity={ownedCards.get(week.card.id)} />
                    </div>
                  )}
                  <div className="flex-1">
                    {week.card && (
                      <p className="text-sm font-extrabold text-white">
                        {week.card.name}{" "}
                        <span className="font-semibold text-white/50">
                          · {RARITY_LABELS[week.card.rarity]}
                        </span>
                      </p>
                    )}
                    <p className="text-xs font-semibold text-white/60">
                      {week.competitionNames.join(", ")} · {formatBadgeWeek(week.weekStart)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            {othersGrouped.length > 0 && (
              <p className="relative mt-3 text-xs font-medium text-white/40">
                {othersGrouped
                  .map(
                    (o) =>
                      `Stejně bodoval i ${o.displayName} — ${o.competitionName}${o.count > 1 ? ` (${o.count}×)` : ""}.`,
                  )
                  .join(" ")}
              </p>
            )}

            <button
              type="button"
              onClick={dismissModal}
              className="btn-press relative mt-6 w-full rounded-full bg-accent px-6 py-3 text-sm font-extrabold text-accent-foreground"
            >
              Paráda!
            </button>
          </div>
        </div>
      )}

      {bannerOpen && (
        <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-surface p-4 shadow-[var(--shadow-card)]">
          <Medal className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={2.2} />
          <div className="flex-1 text-sm">
            <p className="font-extrabold">Zlepši to a ukaž, že na to máš.</p>
            <p className="mt-1 text-muted-foreground">
              {othersGrouped
                .map((o) => `${o.displayName} (${o.count}× ${o.competitionName})`)
                .join(", ")}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissBanner}
            aria-label="Zavřít upozornění"
            className="btn-press shrink-0 rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      )}

      {children}

      <section id="artefakty" className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-muted-foreground">
          Sbírka artefaktů{" "}
          <span className="text-faint-foreground">
            ({ownedCards.size}/{allCards.length})
          </span>
        </h2>

        {myBadges.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Zatím žádná medaile -- vyhraj týden a objeví se tu první kartička!
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {allCards.map((card) => {
              const isNew = newCardIds.has(card.id);
              return (
                <li key={card.id}>
                  <ClickableCardTile
                    card={card}
                    owned={ownedCards.has(card.id)}
                    quantity={ownedCards.get(card.id)}
                    muted={isNew && !revealed}
                    isNew={isNew && revealed}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
