import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { USER_ID_HEADER, USER_EMAIL_HEADER } from "@/lib/supabase/middleware";

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

// Ověření přihlášeného uživatele BEZ volání Supabase Auth odsud.
//
// 6.9.2026: appka dřív tady volala `supabase.auth.getClaims()` (viz
// historie souboru) -- ale getClaims() umí kromě ověření tokenu i
// obnovit ho, když se blíží vypršení, a server komponenty (tenhle kód
// běží jen v nich) nemají jak novou cookii spolehlivě uložit zpátky do
// prohlížeče (Next.js to v jejich renderovacím kontextu nedovolí, viz
// try/catch v createClient() níže). Výsledek: appka na Supabase serveru
// tiše "spotřebovala" starý refresh token, aniž by prohlížeč dostal
// nový -- a appka má zapnutou ochranu proti zneužitým refresh tokenům,
// která na to reagovala tak, že rovnou zneplatnila celou session.
// Uživatel to hlásil jako "na telefonu se pořád odhlašuju".
//
// Oprava: jedině `src/lib/supabase/middleware.ts` (proxy, běží na
// každém požadavku jako první) smí volat getClaims()/obnovovat token,
// protože jedině ono umí výsledek zapsat do cookie. Ověřenou identitu
// odsud posílá dál přes hlavičky (USER_ID_HEADER/USER_EMAIL_HEADER),
// které middleware maže na začátku KAŽDÉHO požadavku a nastavuje znovu
// jen podle kryptograficky ověřených claims -- klient si je tedy nemůže
// podvrhnout. getCurrentUser() teď jen čte, co middleware už ověřilo.
//
// React `cache()` navíc zajistí, že se to v rámci jednoho requestu
// spočítá jen jednou, i když si o uživatele řekne víc komponent.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const headerList = await headers();
  const id = headerList.get(USER_ID_HEADER);
  if (!id) return null;

  const encodedEmail = headerList.get(USER_EMAIL_HEADER);
  const email = encodedEmail ? decodeURIComponent(encodedEmail) : "";

  return { id, email: email || null };
});
