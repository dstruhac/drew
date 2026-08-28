import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "@/lib/supabase/database.types";

// Use in Server Components, Server Actions and Route Handlers.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll was called from a Server Component. Ignored because
            // the middleware below refreshes sessions on every request.
          }
        },
      },
    },
  );
}

export type CurrentUser = { id: string; email: string | null };

// Ověření přihlášeného uživatele BEZ síťového dotazu na Supabase.
//
// Dřív se tu volalo `supabase.auth.getUser()`, což je pokaždé skutečný
// síťový round trip na Auth server. Při měření 28.8.2026 stál 0,15 s
// (rozehřátá Supabase) až 3,6 s (studená) -- a appka ho platila dvakrát
// na každé načtení stránky (jednou v proxy.ts, jednou tady).
//
// `getClaims()` místo toho ověří podpis tokenu lokálně přes WebCrypto.
// Funguje to jen u projektů s asymetrickými podpisovými klíči -- ověřeno
// 28.8.2026, že tenhle projekt je má (endpoint .well-known/jwks.json
// vrací klíč ES256). U symetrického klíče by se knihovna sama vrátila
// k síťovému dotazu, takže je to bezpečné i kdyby se to v budoucnu
// změnilo, jen by to bylo zase pomalejší.
//
// Bezpečnost: tohle NENÍ `getSession()` (které se nesmí věřit, protože
// jen přečte cookie). `getClaims()` kryptograficky ověří podpis, takže
// `sub` z tokenu je důvěryhodná identita uživatele. Skutečná autorizace
// dat navíc pořád stojí na RLS politikách v databázi.
//
// React `cache()` navíc zajistí, že se to v rámci jednoho requestu
// spočítá jen jednou, i když si o uživatele řekne víc komponent.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) return null;

  return {
    id: data.claims.sub,
    email: data.claims.email ?? null,
  };
});
