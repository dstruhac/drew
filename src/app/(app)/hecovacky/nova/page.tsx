import Link from "next/link";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { throwIfSupabaseError } from "@/lib/supabase/errors";
import { HecovackaForm } from "./form";

export default async function NovaHecovackaPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [competitionsResult, profilesResult] = await Promise.all([
    supabase
      .from("competitions")
      .select("id, name, sport")
      .eq("visibility", "public")
      .order("name"),
    supabase.from("profiles").select("id, display_name").order("display_name"),
  ]);

  throwIfSupabaseError(competitionsResult.error, "Načtení sledovaných soutěží");
  throwIfSupabaseError(profilesResult.error, "Načtení hráčů appky");

  const players = (profilesResult.data ?? []).filter((p) => p.id !== user?.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10 sm:px-10">
      <header>
        <Link
          href="/hecovacky"
          className="text-xs font-bold text-faint-foreground transition-colors hover:text-foreground"
        >
          ← Hecovačky
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Založit hecovačku</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Soukromá soutěž jen pro lidi, které pozveš -- nikde jinde v appce se nezobrazí.
        </p>
      </header>

      <HecovackaForm competitions={competitionsResult.data ?? []} players={players} />
    </main>
  );
}
