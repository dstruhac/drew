import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { sportAccentStyle } from "@/lib/sport";
import type { CompetitionSport } from "@/lib/supabase/database.types";

const SPORT_LABELS: Record<CompetitionSport, string> = {
  hockey: "Hokej",
  football: "Fotbal",
  mixed: "Mix",
};

// Vysvětlení bodování -- odkaz z horní lišty appky (app-header.tsx),
// vidět na každé stránce (6.9.2026, na žádost uživatele: appka dřív
// neměla ŽÁDNÉ místo, kde by šlo pravidla souhrnně dohledat, jen
// řádek na kartičce soutěže, který nahradil krátký popisek soutěže).
//
// Bodování je nastavitelné per competition (competitions.points_*),
// takže se tu vypisuje živě z databáze, ne natvrdo -- dnes mají
// všechny čtyři soutěže stejné výchozí hodnoty (3/1/1), ale appka na
// rozdílné hodnoty místo má.
export default async function PravidlaPage() {
  const supabase = await createClient();

  const { data: competitions, error } = await supabase
    .from("competitions")
    .select("id, name, sport, points_exact, points_winner, points_total_goals")
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error, "Načtení pravidel bodování");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <div className="flex items-center gap-2 text-xs font-bold text-faint-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">
            Dashboard
          </Link>
          <span>·</span>
          <Link
            href="/spaces"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
            Zpět na soutěže
          </Link>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Pravidla bodování</h1>
      </header>

      <section className="rounded-[22px] border border-border-subtle bg-surface p-5 shadow-[var(--shadow-card)]">
        <p className="text-sm font-medium text-muted-foreground">
          Za každý zápas můžeš získat body dvěma nezávislými způsoby, které se
          sčítají — <strong className="text-foreground">kromě</strong> přesného
          skóre, to se počítá samostatně a nahrazuje obě dohromady:
        </p>
        <ul className="mt-4 flex flex-col gap-3 text-sm font-semibold">
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-extrabold text-accent">
              ⚡
            </span>
            <span>
              <span className="text-foreground">Přesné skóre</span> — trefíš
              přesně, kolik dá gólů/branek každý tým. Body za výherce a góly
              celkem se v tomhle případě nepřičítají navíc.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-extrabold text-accent">
              🏆
            </span>
            <span>
              <span className="text-foreground">Správný výherce</span> —
              trefíš, kdo vyhraje (nebo že bude remíza), i když ne přesné
              skóre.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-extrabold text-accent">
              🥅
            </span>
            <span>
              <span className="text-foreground">Součet gólů</span> — trefíš
              celkový počet gólů/branek obou týmů dohromady, i když ne přesné
              skóre ani vítěze.
            </span>
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-extrabold tracking-tight text-muted-foreground">
          Kolik bodů to je v jednotlivých soutěžích
        </h2>
        {competitions?.map((competition) => (
          <div
            key={competition.id}
            style={sportAccentStyle(competition.sport)}
            className="flex items-center justify-between gap-3 rounded-[18px] border border-border-subtle bg-surface px-4 py-3 shadow-[var(--shadow-card)]"
          >
            <div>
              <p className="text-sm font-bold">{competition.name}</p>
              <p className="text-[11px] font-semibold text-faint-foreground">
                {SPORT_LABELS[competition.sport]}
              </p>
            </div>
            <p className="text-right text-xs font-semibold text-muted-foreground">
              ⚡ {competition.points_exact} b. · 🏆 {competition.points_winner} b. · 🥅{" "}
              {competition.points_total_goals} b.
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
