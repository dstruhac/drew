import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { BadgeCelebrationModal } from "./badge-celebration-modal";

// "Banger" moment č. 2 (redesign 29.8.2026): zjistí nedávné medaile
// za vítězství týdne přihlášeného hráče a předá je klientské
// komponentě, která rozhodne, jestli je hráč ještě "neviděl"
// (localStorage watermark) a případně zobrazí oslavné okno.
//
// Zapojeno do (app)/layout.tsx, ne jen do žebříčku, ať hráč gratulaci
// uvidí bez ohledu na to, na jaké stránce appky zrovna skončí --
// medaile uděluje offline dávková úloha (award-weekly-badges.mjs),
// appka žádnou "živou" událost o jejich udělení nemá.
export async function BadgeCelebrationWatcher() {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: badges } = await supabase
    .from("weekly_badges")
    .select("competition_id, week_start, points, awarded_at, competitions(name)")
    .eq("user_id", user.id)
    .order("awarded_at", { ascending: false })
    .limit(5);

  if (!badges || badges.length === 0) return null;

  return <BadgeCelebrationModal badges={badges} />;
}
