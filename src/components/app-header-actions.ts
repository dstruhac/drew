"use server";

import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type ToggleRemindersState = { enabled: boolean };

// Server akce pro globální přepínač e-mailových upozornění v hlavičce
// (viz email-reminders-toggle.tsx). Záměrně nebere "aktuální stav" jako
// argument -- načte si ho čerstvě sama a přepne opačně, ať se
// zabráněno zacyklení na zastaralé hodnotě, kdyby byl klient bindnutý
// na stav z prvního vykreslení stránky (useActionState běží
// opakovaně bez nového server renderu mezi kliknutími).
export async function toggleEmailReminders(
  prevState: ToggleRemindersState,
  _formData: FormData,
): Promise<ToggleRemindersState> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return prevState;

  const { data: profile } = await supabase
    .from("profiles")
    .select("email_reminders_enabled")
    .eq("id", user.id)
    .single();

  const newEnabled = !(profile?.email_reminders_enabled ?? true);

  const { error } = await supabase
    .from("profiles")
    .update({ email_reminders_enabled: newEnabled })
    .eq("id", user.id);

  if (error) {
    throw new Error(`Nastavení upozornění se nepodařilo: ${error.message}`);
  }

  // "/", "layout" místo cesty ke konkrétní stránce -- hlavička žije ve
  // sdíleném layoutu a formulář se odesílá z libovolné stránky pod (app).
  revalidatePath("/", "layout");
  return { enabled: newEnabled };
}
