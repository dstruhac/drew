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

// supabase.auth.getUser() re-validates the token against the Supabase Auth
// server on every call -- it's a real network round trip, not a local cookie
// read. AppHeader (rendered on every signed-in page) and the page below it
// each used to call it separately, tripling that round trip per request.
// React's cache() dedupes repeated calls to the same function within one
// request, so wrapping it here means only the first caller actually pays
// for it (found during perf review 27.8.2026).
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
