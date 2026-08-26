// Tenký wrapper nad @supabase/supabase-js pro sync skripty. Používá se
// service role klíč (obchází RLS) — sync skripty běží jako důvěryhodný
// backend proces, ne jako přihlášený uživatel appky.

import { createClient } from "@supabase/supabase-js";

export function createSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY v prostředí — nastav je jako GitHub secrets.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
