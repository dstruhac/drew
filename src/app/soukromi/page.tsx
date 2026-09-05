import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Veřejná stránka (viz PUBLIC_PATHS v middleware.ts) -- Google u appek
// v produkčním OAuth módu vyžaduje odkaz na Zásady ochrany osobních
// údajů v nastavení OAuth consent screenu, i když appka nepodléhá
// plné verifikaci (žádá jen o základní scope). Viz docs/PROJECT.md,
// bod "Veřejná marketingová stránka".
//
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-10 sm:px-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1 self-start text-xs font-bold text-faint-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
        Zpět
      </Link>

      <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
        Zásady ochrany osobních údajů
      </h1>
      <p className="mt-1 text-xs font-semibold text-faint-foreground">
        Poslední aktualizace: 29. 8. 2026
      </p>

      <div className="mt-8 flex flex-col gap-7 text-sm leading-relaxed">
        <p>
          Klopi je malá tipovací hra na sportovní zápasy, provozovaná pro
          uzavřenou skupinu kamarádů. Tahle stránka vysvětluje, jaké údaje
          appka zpracovává a jak.
        </p>

        <section>
          <h2 className="text-base font-bold">Jaké údaje appka sbírá</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>
              Při přihlášení přes Google: jméno, e-mailová adresa a
              profilová fotka z tvého Google účtu.
            </li>
            <li>Tvoje tipy na zápasy (zadané skóre) a z nich spočítané body.</li>
            <li>
              Nepovinně, pokud si zapneš e-mailová upozornění na
              nevyplněné tipy: jednoduchý záznam o tom, komu a kdy bylo
              upozornění posláno.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-bold">K čemu se údaje používají</h2>
          <p className="mt-2 text-muted-foreground">
            Výhradně k provozu appky: přihlášení, zobrazení tvých tipů a
            žebříčku ostatním hráčům ve stejné soutěži, a — pokud si to
            zapneš — k zaslání e-mailového připomenutí na nevyplněný tip.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold">S kým se údaje sdílí</h2>
          <p className="mt-2 text-muted-foreground">
            Appka běží na Vercelu (hosting appky) a Supabase (databáze, v
            Irsku/EU). Přihlášení zajišťuje Google. Appka údaje nikomu
            neprodává ani je nesdílí s nikým dalším.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold">
            Jak dlouho se údaje uchovávají
          </h2>
          <p className="mt-2 text-muted-foreground">
            Dokud appka běží a dokud jsi jejím uživatelem. O výmaz svých
            údajů můžeš kdykoliv požádat na{" "}
            <a
              href="mailto:daniel.struhac@gmail.com"
              className="font-semibold text-foreground hover:underline"
            >
              daniel.struhac@gmail.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold">Tvoje práva</h2>
          <p className="mt-2 text-muted-foreground">
            Můžeš kdykoliv požádat o výmaz nebo úpravu svých údajů — napiš
            na{" "}
            <a
              href="mailto:daniel.struhac@gmail.com"
              className="font-semibold text-foreground hover:underline"
            >
              daniel.struhac@gmail.com
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
