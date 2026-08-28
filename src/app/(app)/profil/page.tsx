import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { NicknameForm } from "./nickname-form";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <Link
          href="/spaces"
          className="btn-press text-sm underline underline-offset-2 hover:no-underline"
        >
          ← Zpět na soutěže
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Nastavení profilu</h1>
        <p className="text-xs text-black/40 dark:text-white/40">{user.email}</p>
        <Link
          href={`/profil/${user.id}`}
          className="mt-1 inline-block text-xs text-black/40 underline underline-offset-2 hover:text-black/70 dark:text-white/40 dark:hover:text-white/70"
        >
          Zobrazit veřejný profil →
        </Link>
      </header>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Profil se nepodařilo načíst: {error.message}
        </p>
      )}

      {profile && <NicknameForm currentName={profile.display_name} />}
    </main>
  );
}
