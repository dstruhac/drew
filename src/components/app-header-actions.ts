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

export type MenuCompetition = { id: string; name: string };

// Seznam soutěží, které hráč hraje, pro rozklikávací "Soutěže" v
// hamburger menu (12.9.2026, na žádost uživatele). Záměrně samostatná
// server akce volaná AŽ při rozkliknutí (ne rovnou v AppHeader) --
// appka jinak byla kdysi pomalá kvůli zbytečným dotazům při každém
// vykreslení stránky (viz docs/PROJECT.md, "Výkon"), a tenhle dotaz by
// se jinak dělal na úplně každé stránce, i když menu možná nikdo
// nerozklikne.
export async function getMyCompetitionsForMenu(): Promise<MenuCompetition[]> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("competition_participants")
    .select("competitions(id, name)")
    .eq("user_id", user.id);

  if (error) {
    throw new Error(`Načtení soutěží se nepodařilo: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => row.competitions)
    .filter((c): c is MenuCompetition => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
}
