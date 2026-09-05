"use client";

import { useEffect, useState } from "react";
import { Medal, X } from "lucide-react";
import { markBadgesSeen } from "@/app/(app)/dashboard/actions";

type BadgeRow = {
  competition_id: string;
  week_start: string;
  user_id: string;
  points: number;
  competitions: { name: string } | null;
  profiles: { display_name: string } | null;
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

function badgeKey(b: { competition_id: string; week_start: string }) {
  return `${b.competition_id}-${b.week_start}`;
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
// badge-celebration-watcher.tsx): gratulační modal za vlastní výhru,
// informační banner o cizí výhře a samotná Sbírka artefaktů se
// šedo-barevným "odemykacím" efektem u nové medaile.
//
// "Už jsi to viděl" se řeší na serveru (profiles.badges_seen_through),
// ne v localStorage -- appka to teda nezopakuje na jiném zařízení.
// Jen JEDNA z modal/banner se kdy zobrazí zároveň (modal, pokud hráč
// sám něco vyhrál -- v tom případě obsahuje i zmínku o ostatních --
// jinak banner, pokud vyhrál někdo jiný), aby appka nezahltila hráče
// víc upozorněními na totéž.
export function BadgeCenter({
  myBadges,
  myNewBadges,
  othersNewBadges,
  markSeenThrough,
  children,
}: {
  myBadges: BadgeRow[];
  myNewBadges: BadgeRow[];
  othersNewBadges: BadgeRow[];
  markSeenThrough: string | null;
  // Zbytek obsahu dashboardu (vysvícený zápas, Tvoje soutěže) --
  // banner musí vyjít NAD tímhle obsahem, mřížka medailí AŽ POD ním,
  // a obojí musí sdílet stav "revealed" s modalem, takže celý zbytek
  // stránky prochází přes tuhle komponentu jako children, místo aby
  // šlo o dva nezávislé kusy JSX v page.tsx.
  children: React.ReactNode;
}) {
  const [modalOpen, setModalOpen] = useState(myNewBadges.length > 0);
  const [bannerOpen, setBannerOpen] = useState(
    myNewBadges.length === 0 && othersNewBadges.length > 0,
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

  const newKeys = new Set(myNewBadges.map(badgeKey));
  const othersGrouped = groupOthers(othersNewBadges);

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
            <ul className="relative mt-2 flex flex-col gap-1 text-sm font-semibold text-white/60">
              {myNewBadges.map((b) => (
                <li key={badgeKey(b)}>
                  {b.competitions?.name ?? "Soutěž"} · {formatBadgeWeek(b.week_start)}
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
        <h2 className="text-sm font-bold text-muted-foreground">Sbírka artefaktů</h2>

        {myBadges.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Zatím žádná medaile -- vyhraj týden a objeví se tu!
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {myBadges.map((badge) => {
              const isNew = newKeys.has(badgeKey(badge));
              return (
                <li
                  key={badgeKey(badge)}
                  title="Medaile za nejvyšší nasbíraný počet bodů v daném týdnu a dané soutěži."
                  className={`flex items-center gap-2 rounded-2xl border border-border-subtle bg-surface p-3 text-sm font-semibold transition-all duration-[var(--duration-celebration)] ${
                    isNew && !revealed ? "grayscale opacity-50" : ""
                  } ${isNew && revealed ? "animate-[celebrate-pop_0.7s_var(--ease-bounce)]" : ""}`}
                >
                  <Medal className="h-4 w-4 shrink-0 text-accent" strokeWidth={2.2} />
                  {badge.competitions?.name ?? "Neznámá soutěž"}
                  <span className="text-faint-foreground">
                    · {formatBadgeWeek(badge.week_start)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
