import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Users, Calendar, Check, Medal } from "lucide-react";
import { GoogleIcon } from "@/components/google-icon";

// Veřejná úvodní stránka appky (29.8.2026) -- middleware (viz
// src/lib/supabase/middleware.ts) ji drží veřejnou pro odhlášené a
// zároveň přihlášené odsud rovnou posílá na /dashboard, takže tahle
// stránka reálně uvidí jen nikdy nepřihlášený návštěvník. Vizuální
// návrh odsouhlasen s uživatelem přes design canvas
// (https://claude.ai/code/artifact/02038569-751b-4306-a335-6b1cd8641366),
// stejné barvy/fonty/zaoblení jako zbytek appky (design tokeny v
// globals.css). Tlačítka vedou na /login, kde běží skutečná Google
// OAuth logika -- tahle stránka žádnou vlastní nemá.
const LEAGUES = [
  { name: "Hokejová extraliga 2026/27", sport: "Hokej" },
  { name: "Chance Liga", sport: "Fotbal" },
  { name: "Premier League", sport: "Fotbal" },
];

export default function LandingPage() {
  return (
    <>
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-10">
          <div className="flex items-center gap-2">
            <Image src="/brand/klopi-icon.svg" alt="Klopi" width={34} height={34} className="h-[34px] w-[34px]" priority />
            <span className="text-[19px] font-extrabold tracking-tight">Klopi</span>
          </div>
          <Link
            href="/login"
            className="btn-press rounded-full bg-foreground px-[18px] py-[9px] text-[13px] font-bold text-background"
          >
            Přihlásit se
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden px-4 py-16 text-center sm:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[420px] max-w-[640px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_70%)]"
          />

          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3.5 py-1.5 text-xs font-bold text-muted-foreground">
            <Users className="h-3.5 w-3.5" strokeWidth={2.2} />
            Tipovací hra pro partu kamarádů
          </span>

          <h1 className="mx-auto mt-6 max-w-2xl text-[2.4rem] leading-[1.08] font-extrabold tracking-tight sm:text-[3.4rem]">
            Tipuj zápasy.
            <br />
            Boduj. Chečruj kamarády.
          </h1>

          <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed font-medium text-muted-foreground">
            Klopi je malá tipovací hra na sportovní zápasy — žádné sázení,
            jen body, žebříček a dobrá parta u piva a klobásy.
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              href="/login"
              className="btn-press flex items-center gap-3 rounded-full bg-accent px-[22px] py-[13px] text-sm font-bold text-accent-foreground hover:opacity-90"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-white">
                <GoogleIcon className="h-3 w-3" />
              </span>
              Přihlásit se přes Google
            </Link>
          </div>

          <p className="mt-4 text-[13px] font-semibold text-faint-foreground">
            Appka je pro uzavřenou partu — pozvánku dostaneš od kamaráda.
          </p>
        </section>

        <section className="border-t border-border-subtle px-4 py-14">
          <div className="mx-auto max-w-[520px] text-center">
            <h2 className="text-2xl font-extrabold tracking-tight">
              Co zrovna sledujeme
            </h2>
            <p className="mt-2.5 text-[15px] font-medium text-muted-foreground">
              Appka umí tipy na tyhle soutěže — postupně přibydou další.
            </p>
          </div>

          <div className="mx-auto mt-9 flex max-w-4xl flex-wrap justify-center gap-3.5">
            {LEAGUES.map((league) => (
              <div
                key={league.name}
                className="card-lift flex items-center gap-2.5 rounded-[20px] border border-border-subtle bg-surface px-5 py-3.5 shadow-[var(--shadow-card)]"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                <span className="text-sm font-bold">{league.name}</span>
                <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                  {league.sport}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-border-subtle px-4 py-14">
          <div className="mx-auto max-w-[520px] text-center">
            <h2 className="text-2xl font-extrabold tracking-tight">
              Jak to funguje
            </h2>
            <p className="mt-2.5 text-[15px] font-medium text-muted-foreground">
              Tři kroky, žádná složitost.
            </p>
          </div>

          <div className="mx-auto mt-9 grid max-w-4xl grid-cols-1 gap-5 sm:grid-cols-3">
            <StepCard
              icon={<Calendar className="h-5 w-5 text-accent" strokeWidth={2.2} />}
              title="Tipni skóre"
              description="Před výkopem zadáš, jak podle tebe zápas skončí."
            />
            <StepCard
              icon={<Check className="h-5 w-5 text-accent" strokeWidth={2.2} />}
              title="Appka spočítá body"
              description="Přesné skóre, trefený výherce i součet gólů — každé zvlášť."
            />
            <StepCard
              icon={<Medal className="h-5 w-5 text-accent" strokeWidth={2.2} />}
              title="Sleduj žebříček"
              description="Celkový i týdenní — kdo vede týden, dostane medaili."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle px-4 py-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Image src="/brand/klopi-icon.svg" alt="" width={26} height={26} className="h-[26px] w-[26px]" />
            <span className="text-[13px] font-semibold text-faint-foreground">
              Klopi — Klobása + Pivo, věci co nás spojujou.
            </span>
          </div>
          <Link
            href="/soukromi"
            className="text-[13px] font-bold text-muted-foreground hover:text-foreground hover:underline"
          >
            Zásady ochrany osobních údajů
          </Link>
        </div>
      </footer>
    </>
  );
}

function StepCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="card-lift rounded-[20px] border border-border-subtle bg-surface p-6 shadow-[var(--shadow-card)]">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-[14px] bg-accent/10">
        {icon}
      </span>
      <h3 className="text-base font-extrabold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed font-medium text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
