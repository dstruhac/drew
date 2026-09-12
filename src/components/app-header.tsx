import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { ThemeToggle } from "@/components/theme-toggle";
import { EmailRemindersToggle } from "@/components/email-reminders-toggle";
import { MobileMenu } from "@/components/mobile-menu";
import { MobileMenuLink } from "@/components/mobile-menu-link";
import { MobileMenuCompetitions } from "@/components/mobile-menu-competitions";

// Sdílená horní lišta napříč celou přihlášenou částí appky (viz
// src/app/(app)/layout.tsx) — fotečka přihlášeného uživatele v rohu,
// klik na ni vede na /profil (nastavení přezdívky atd.). Stránky pod
// (app) si pod touhle lištou dál mají svůj vlastní obsah/nadpis.
export async function AppHeader() {
  const user = await getCurrentUser();

  if (!user) return null;

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_url, email_reminders_enabled")
    .eq("id", user.id)
    .single();

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  }

  const initial = profile?.display_name?.trim().charAt(0).toUpperCase() || "?";
  const remindersEnabled = profile?.email_reminders_enabled ?? true;

  return (
    <div className="border-b border-border-subtle">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3 sm:max-w-5xl sm:px-10">
        <Link
          href="/dashboard"
          className="btn-press flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <Image src="/brand/klopi-icon.svg" alt="Klopi" width={30} height={30} className="h-[30px] w-[30px]" priority />
          <span className="text-[18px] font-extrabold tracking-tight">
            Klopi
            <span className="hidden font-semibold text-muted-foreground sm:inline">
              {" "}– Klobása a pivo
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {/* Na počítači se hlavička vejde beze změny -- schováno jen
           * na mobilu (12.9.2026, uživatel nahlásil "hlavička je
           * plná"), kde se totéž ukazuje uvnitř MobileMenu níže. */}
          <Link
            href="/pravidla"
            className="btn-press hidden text-xs font-bold text-muted-foreground hover:text-foreground sm:inline"
          >
            Pravidla
          </Link>
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <div className="hidden sm:block">
            <EmailRemindersToggle initialEnabled={remindersEnabled} />
          </div>

          {/* Fotečka zůstává vidět vždy -- i na mobilu, mimo hamburger
           * menu (odsouhlaseno s uživatelem 12.9.2026). */}
          <Link
            href="/profil"
            title="Nastavení profilu"
            aria-label="Nastavení profilu"
            className="btn-press block h-9 w-9 overflow-hidden rounded-full border border-border-subtle transition-opacity hover:opacity-80"
          >
            {profile?.avatar_url ? (
              // Malá ikona z externí URL (Google) — obyčejný <img>, ať
              // se nemusí konfigurovat next/image povolené domény kvůli
              // jedné 32px fotce.
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-surface-hover text-sm font-bold text-muted-foreground">
                {initial}
              </span>
            )}
          </Link>

          <form action={signOut} className="hidden sm:block">
            <button
              type="submit"
              className="btn-press text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:no-underline"
            >
              Odhlásit se
            </button>
          </form>

          {/* Jen na mobilu (MobileMenu má sm:hidden) -- schovává úplně
           * totéž, co appka na počítači ukazuje rovnou v hlavičce, plus
           * "Dashboard" navíc (12.9.2026, na žádost uživatele) -- na
           * počítači i na mobilu mimo menu appka na dashboard vede
           * kliknutím na logo, ale appka jinde (/spaces, detail
           * soutěže...) drží zvyk mít k tomu i výslovný textový odkaz,
           * ne jen klik na logo. */}
          <MobileMenu>
            <MobileMenuLink
              href="/dashboard"
              className="btn-press rounded-lg px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-hover"
            >
              Dashboard
            </MobileMenuLink>
            <MobileMenuCompetitions />
            <MobileMenuLink
              href="/pravidla"
              className="btn-press rounded-lg px-3 py-2 text-sm font-bold text-foreground hover:bg-surface-hover"
            >
              Pravidla
            </MobileMenuLink>
            <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2">
              <span className="text-sm font-semibold text-foreground">Vzhled appky</span>
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2">
              <span className="text-sm font-semibold text-foreground">E-mailová upozornění</span>
              <EmailRemindersToggle initialEnabled={remindersEnabled} />
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="btn-press w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                Odhlásit se
              </button>
            </form>
          </MobileMenu>
        </div>
      </div>
    </div>
  );
}
