import Link from "next/link";
import { ChevronLeft, PartyPopper } from "lucide-react";
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
      {/* Hero hlavička (22.9.2026, na žádost uživatele "formulář
       * nevypadá pompézně") -- recykluje tmavou "hero" kartu, kterou
       * appka jinde používá pro nejdůležitější obsah (SpotlightMatchCard,
       * HecovackaResultsCard), ať i tahle stránka vypadá jako součást
       * appky, ne jako strohý administrativní formulář. */}
      <header className="relative overflow-hidden rounded-[26px] bg-[#15171c] p-6 sm:p-8">
        <div className="pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-accent/25" />
        <Link
          href="/hecovacky"
          className="relative inline-flex items-center gap-1 text-xs font-bold text-white/50 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} />
          Hecovačky
        </Link>
        <div className="relative mt-3 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent/15">
            <PartyPopper className="h-6 w-6 text-accent" strokeWidth={2} />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              Založit hecovačku
            </h1>
            <p className="mt-0.5 text-sm text-white/60">
              Soukromá soutěž jen pro lidi, které pozveš -- nikde jinde v appce se nezobrazí.
            </p>
          </div>
        </div>
      </header>

      <HecovackaForm competitions={competitionsResult.data ?? []} players={players} />
    </main>
  );
}
