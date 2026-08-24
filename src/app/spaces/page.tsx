import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SpacesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
      <p className="text-sm text-black/60 dark:text-white/60">
        Seznam soutěží (spaces) bude tady.
      </p>
      {user && (
        <p className="text-xs text-black/40 dark:text-white/40">
          Přihlášen jako {user.email}
        </p>
      )}
      <form action={signOut}>
        <button
          type="submit"
          className="text-sm underline underline-offset-2 hover:no-underline"
        >
          Odhlásit se
        </button>
      </form>
    </main>
  );
}
