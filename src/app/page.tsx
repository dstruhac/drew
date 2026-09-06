import type { ReactNode } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Users, Calendar, Check, Medal } from "lucide-react";
import { GoogleIcon } from "@/components/google-icon";
import { ThemeToggle } from "@/components/theme-toggle";

// Veřejná úvodní stránka appky (29.8.2026) -- middleware (viz
// src/lib/supabase/middleware.ts) ji drží veřejnou pro odhlášené a
// zároveň přihlášené odsud rovnou posílá na /dashboard, takže tahle
// stránka reálně uvidí jen nikdy nepřihlášený návštěvník. Vizuální
// návrh odsouhlasen s uživatelem přes design canvas
// (https://claude.ai/code/artifact/02038569-751b-4306-a335-6b1cd8641366),
// stejné barvy/fonty/zaoblení jako zbytek appky (design tokeny v
// globals.css). Tlačítka vedou na /login, kde běží skutečná Google
// OAuth logika -- tahle stránka žádnou vlastní nemá.
// Popisky sjednocené s competitions.description v databázi (viz
// migrace 20260906120000_competitions_description.sql) -- tahle
// stránka je ale veřejná a nepřihlášený návštěvník na ni nemá RLS
// přístup do DB, proto zůstává natvrdo zapsaná stejně jako zbytek
// tohohle pole odjakživa.
const LEAGUES = [
  {
    name: "Hokejová extraliga 2026/27",
    sport: "Hokej",
    description: "Nejvyšší česká hokejová soutěž — tip na každý zápas sezóny.",
  },
  {
    name: "Chance Liga",
    sport: "Fotbal",
    description: "Nejvyšší česká fotbalová liga — tip na každé kolo.",
  },
  {
    name: "Premier League",
    sport: "Fotbal",
    description: "Nejlepší anglická fotbalová liga — tip na každé kolo.",
  },
  {
    name: "Creme de la Creme liga",
    sport: "Mix",
    description: "Každý den 5 nových zápasů namátkou ze 13 fotbalových a hokejových lig.",
  },
];

// Stejná čísla jako výchozí competitions.points_* v databázi (dnes
// shodná napříč všemi soutěžemi) -- veřejná stránka nemá RLS přístup
// k živým datům, přesné rozpisy pro jednotlivé soutěže vidí přihlášený
// hráč na /pravidla.
const SCORING = [
  { emoji: "⚡", label: "za přesné skóre", points: 3 },
  { emoji: "🏆", label: "za správného výherce", points: 1 },
  { emoji: "🥅", label: "za trefený počet gólů", points: 1 },
];

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return (
    <>
      <header className="border-b border-border-subtle">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-10">
          <div className="flex items-center gap-2">
            <Image src="/brand/klopi-icon.svg" alt="Klopi" width={34} height={34} className="h-[34px] w-[34px]" priority />
            <span className="text-[19px] font-extrabold tracking-tight">
              Klopi
              <span className="hidden font-semibold text-muted-foreground sm:inline">
                {" "}– Klobása a pivo
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="btn-press rounded-full bg-foreground px-[18px] py-[9px] text-[13px] font-bold text-background"
            >
              Přihlásit se
            </Link>
          </div>
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
            Tipovačka pro partu, co má jasno
          </span>

          <h1 className="mx-auto mt-6 max-w-3xl text-[2.55rem] leading-[1.04] font-extrabold tracking-tight sm:text-[3.7rem]">
            Klobása. Pivo. Tipovačka.
            <br />
            <span className="text-accent">Klopi.</span>
          </h1>

          <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed font-medium text-muted-foreground sm:text-lg">
            Tipni výsledky. Poraz kámoše. A pak jim to nezapomeň připomenout.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href="/login"
              className="btn-press flex items-center gap-3 rounded-full bg-accent px-[24px] py-[13px] text-sm font-bold text-accent-foreground hover:opacity-90"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-[3px] bg-white">
                <GoogleIcon className="h-3 w-3" />
              </span>
              Jdu do toho
            </Link>
            <span className="text-xs font-semibold text-faint-foreground">
              Žádné sázení. Jen body, tabulka a právo se vytahovat.
            </span>
          </div>
        </section>

        <section className="border-t border-border-subtle px-4 py-14">
          <div className="mx-auto max-w-[520px] text-center">
            <h2 className="text-2xl font-extrabold tracking-tight">
              Co se právě klopí?
            </h2>
            <p className="mt-2.5 text-[15px] font-medium text-muted-foreground">
              Vyber soutěž a ukaž, co v tobě je.
            </p>
          </div>

          <div className="mx-auto mt-9 grid max-w-3xl grid-cols-1 gap-3.5 sm:grid-cols-2">
            {LEAGUES.map((league) => (
              <div
                key={league.name}
                className="card-lift rounded-[20px] border border-border-subtle bg-surface px-5 py-4 text-left shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{league.name}</span>
                  <span className="shrink-0 rounded-full border border-border-subtle px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                    {league.sport}
                  </span>
                </div>
                <p className="mt-1.5 text-xs font-medium text-muted-foreground">
                  {league.description}
                </p>
              </div>
            ))}
          </div>

          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2.5">
            {SCORING.map((rule) => (
              <span
                key={rule.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3.5 py-1.5 text-xs font-bold text-muted-foreground"
              >
                {rule.emoji} {rule.points} {rule.points === 1 ? "bod" : "body"} {rule.label}
              </span>
            ))}
          </div>
        </section>

        <section className="border-t border-border-subtle px-4 py-14 text-center sm:py-16">
          <div className="mx-auto max-w-3xl">
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-accent">
              Kecat umí každý
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Každý tomu rozumí. Před zápasem.
            </h2>

            <div className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
              {["„Tohle je tutovka.“", "„Dneska dostanou trojku.“", "„Já jsem vám to říkal.“"].map((quote) => (
                <div
                  key={quote}
                  className="rounded-[18px] border border-border-subtle bg-surface px-5 py-4 text-center text-sm font-bold shadow-[var(--shadow-card)]"
                >
                  {quote}
                </div>
              ))}
            </div>

            <p className="mt-8 text-xl font-extrabold sm:text-2xl">
              Tak to <span className="text-accent">klopni.</span>
            </p>
          </div>
        </section>

        <section className="border-t border-border-subtle px-4 py-14">
          <div className="mx-auto max-w-[620px] text-center">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Jednodušší než objednat další pivo.
            </h2>
            <p className="mt-2.5 text-[15px] font-medium text-muted-foreground">
              Tři kroky. Žádné kurzy, žádné tikety.
            </p>
          </div>

          <div className="mx-auto mt-9 grid max-w-4xl grid-cols-1 gap-5 sm:grid-cols-3">
            <StepCard
              icon={<Calendar className="h-5 w-5 text-accent" strokeWidth={2.2} />}
              title="Klopni výsledek"
              description="Před zápasem střelíš skóre. Bez kurzů, bez sázek."
            />
            <StepCard
              icon={<Check className="h-5 w-5 text-accent" strokeWidth={2.2} />}
              title="My spočítáme zbytek"
              description="Trefa, body, pořadí. Ty jen čekáš, jestli jsi génius."
            />
            <StepCard
              icon={<Medal className="h-5 w-5 text-accent" strokeWidth={2.2} />}
              title="Tabulka rozhodne"
              description="Kdo měl pravdu a kdo jen kecal? Tady už se neschováš."
            />
          </div>
        </section>

        <section className="border-t border-border-subtle px-4 py-16 text-center sm:py-20">
          <div className="mx-auto max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Nejde o peníze.
              <br />
              Jde o něco důležitějšího.
            </h2>
            <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed font-medium text-muted-foreground">
              O právo připomínat kámošům celý týden, že jsi měl pravdu.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/login"
                className="btn-press rounded-full bg-accent px-6 py-3.5 text-sm font-extrabold text-accent-foreground hover:opacity-90"
              >
                Tak to klopni
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle px-4 py-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Image src="/brand/klopi-icon.svg" alt="" width={26} height={26} className="h-[26px] w-[26px]" />
            <span className="text-[13px] font-semibold text-faint-foreground">
              Klopi — Klobása. Pivo. Tipy. Věci, co nás spojují.
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
