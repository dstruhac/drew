import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

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
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .single();

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  const initial = profile?.display_name?.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="border-b border-border-subtle">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3 sm:max-w-5xl sm:px-10">
        <Link
          href="/dashboard"
          className="btn-press flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <Image src="/brand/klopi-icon.svg" alt="Klopi" width={30} height={30} className="h-[30px] w-[30px]" priority />
          <span className="text-[18px] font-extrabold tracking-tight">Klopi</span>
        </Link>

        <div className="flex items-center gap-3">
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
          <form action={signOut}>
            <button
              type="submit"
              className="btn-press text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:no-underline"
            >
              Odhlásit se
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
