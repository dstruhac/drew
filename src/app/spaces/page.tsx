import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Sport } from "@/lib/supabase/database.types";

const SPORT_LABELS: Record<Sport, string> = {
  hockey: "Hokej",
  football: "Fotbal",
};

export default async function SpacesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: competitions, error } = await supabase
    .from("competitions")
    .select("id, name, sport, status, points_exact, points_winner, points_total_goals")
    .order("created_at", { ascending: false });

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Soutěže</h1>
          {user && (
            <p className="text-xs text-black/40 dark:text-white/40">
              Přihlášen jako {user.email}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/profil"
            className="text-sm underline underline-offset-2 hover:no-underline"
          >
            Nastavení profilu
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm underline underline-offset-2 hover:no-underline"
            >
              Odhlásit se
            </button>
          </form>
        </div>
      </header>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Soutěže se nepodařilo načíst: {error.message}
        </p>
      )}

      {!error && competitions?.length === 0 && (
        <p className="text-sm text-black/60 dark:text-white/60">
          Zatím žádná soutěž nebyla založena.
        </p>
      )}

      {competitions && competitions.length > 0 && (
        <ul className="flex flex-col gap-3">
          {competitions.map((competition) => (
            <li key={competition.id}>
              <Link
                href={`/spaces/${competition.id}`}
                className="block rounded-lg border border-black/10 dark:border-white/15 p-4 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{competition.name}</span>
                  <span className="text-xs rounded-full border border-black/10 dark:border-white/15 px-2 py-0.5 text-black/60 dark:text-white/60">
                    {SPORT_LABELS[competition.sport]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-black/40 dark:text-white/40">
                  Body za přesný tip {competition.points_exact} · za vítěze{" "}
                  {competition.points_winner} · za góly celkem{" "}
                  {competition.points_total_goals}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
