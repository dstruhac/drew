import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
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
          className="inline-flex items-center gap-1 text-xs font-bold text-faint-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
          Zpět na soutěže
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Nastavení profilu</h1>
        <p className="text-xs font-semibold text-faint-foreground">{user.email}</p>
        <Link
          href={`/profil/${user.id}`}
          className="mt-1 inline-block text-xs font-bold text-accent hover:underline"
        >
          Zobrazit veřejný profil →
        </Link>
      </header>

      {error && (
        <p className="text-sm font-semibold text-danger">
          Profil se nepodařilo načíst: {error.message}
        </p>
      )}

      {profile && <NicknameForm currentName={profile.display_name} />}
    </main>
  );
}
