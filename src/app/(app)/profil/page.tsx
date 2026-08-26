import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NicknameForm } from "./nickname-form";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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
          className="text-sm underline underline-offset-2 hover:no-underline"
        >
          ← Zpět na soutěže
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Nastavení profilu</h1>
        <p className="text-xs text-black/40 dark:text-white/40">{user.email}</p>
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
