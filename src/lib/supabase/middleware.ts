import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes that don't require a signed-in session.
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/auth/callback",
  "/soukromi",
  "/robots.txt",
  "/sitemap.xml",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

// Refreshes the Supabase auth session on every request so server components
// always see a valid (non-expired) session, and gates access to signed-in
// only pages. Called from src/proxy.ts.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Ověření tokenu lokálně (podpis přes WebCrypto), ne síťovým dotazem na
  // Auth server -- viz podrobné vysvětlení u getCurrentUser() v server.ts.
  // Tenhle kód běží na KAŽDÝ požadavek, takže ušetřený round trip (0,15 s
  // rozehřátá Supabase, až 3,6 s studená) je znát pokaždé.
  //
  // Neodstraňovat: getClaims() zároveň obnoví session, když se token blíží
  // vypršení -- stejně jako to dřív dělalo getUser().
  const { data, error } = await supabase.auth.getClaims();
  const user = error ? null : data?.claims;

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (pathname === "/login" || pathname === "/")) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}
