"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

// Posune "watermark" medailí, které uživatel už viděl v BadgeCenter
// (modal za vlastní výhru / banner o cizí výhře na dashboardu) --
// příště appka nahlásí jen medaile udělené po tomhle týdnu. Volá se
// při zavření modalu/banneru, ne při každém načtení stránky.
export async function markBadgesSeen(throughWeekStart: string) {
  const user = await getCurrentUser();
  if (!user) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ badges_seen_through: throughWeekStart })
    .eq("id", user.id);

  if (error) {
    throw new Error(`Uložení stavu medailí se nepodařilo: ${error.message}`);
  }

  revalidatePath("/dashboard");
}
