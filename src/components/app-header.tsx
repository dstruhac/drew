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
    <div className="border-b border-black/10 dark:border-white/15">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3">
        <Link
          href="/spaces"
          className="btn-press text-sm font-semibold transition-opacity hover:opacity-70"
        >
          Drew
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/profil"
            title="Nastavení profilu"
            aria-label="Nastavení profilu"
            className="btn-press block h-8 w-8 overflow-hidden rounded-full border border-black/10 transition-opacity hover:opacity-80 dark:border-white/15"
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
              <span className="flex h-full w-full items-center justify-center bg-black/5 text-xs font-medium dark:bg-white/10">
                {initial}
              </span>
            )}
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="btn-press text-xs underline underline-offset-2 hover:no-underline"
            >
              Odhlásit se
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
