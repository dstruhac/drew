import { createServerClient, type CookieOptions } from "@supabase/ssr";
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

// Hlavičky, přes které tohle proxy (jediné bezpečné místo pro obnovu
// session, viz níže) posílá ověřenou identitu dál server komponentám --
// getCurrentUser() v lib/supabase/server.ts je jen čte, nikdy nevolá
// getClaims() samo. Jméno exportované, aby ho server.ts mohl použít beze
// změny při refaktoringu (typo v jednom z obou míst by potichu appku
// odhlašovalo úplně vždy).
export const USER_ID_HEADER = "x-klopi-user-id";
export const USER_EMAIL_HEADER = "x-klopi-user-email";

// Refreshes the Supabase auth session on every request so server components
// always see a valid (non-expired) session, and gates access to signed-in
// only pages. Called from src/proxy.ts.
//
// 6.9.2026: appka dřív nechávala getCurrentUser() (server.ts) volat
// getClaims() znovu, samostatně od tohohle proxy. Server komponenty ale
// neumí zapsat cookii zpátky do prohlížeče (Next.js to v jejich
// renderovacím kontextu nedovolí -- viz komentář u createClient() v
// server.ts) -- takže když getClaims() v server komponentě zjistilo, že
// token je těsně před vypršením, a obnovilo ho, Supabase na svém serveru
// starý refresh token rotoval, ale prohlížeč se o novém nikdy nedozvěděl.
// Uživatel pak s appkou dál chodil se starým, už jednou použitým
// refresh tokenem v cookii -- a appka má v Supabase zapnutou ochranu
// "Detect and revoke potentially compromised refresh tokens" (ověřeno v
// Dashboardu 6.9.2026), která při jeho příštím použití vyhodnotí session
// jako kompromitovanou a rovnou ji celou zneplatní (ne jen odmítne ten
// jeden pokus). Přesně tohle uživatel hlásil jako "na telefonu se pořád
// odhlašuju" -- typicky po delší pauze, kdy byl access token nejblíž
// vypršení.
//
// Oprava (podle vlastního doporučení Supabase pro server-side Next.js
// auth): jen tohle proxy smí volat getClaims()/obnovovat token, protože
// jen ono umí výsledek spolehlivě zapsat do cookie. Ověřenou identitu
// posílá dál přes hlavičky (USER_ID_HEADER/USER_EMAIL_HEADER) -- appka
// tak nikdy nespustí druhý, neuložitelný pokus o obnovu ve server
// komponentě. Hlavičky se MAŽOU na začátku u každého požadavku, ať je
// nejde podvrhnout zvenčí, a nastavují se znovu jen na základě
// kryptograficky ověřených claims níže.
export async function updateSession(request: NextRequest) {
  const cookiesToApply: { name: string; value: string; options?: CookieOptions }[] = [];

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
          cookiesToApply.push(...cookiesToSet);
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

  // request.headers se sestavují AŽ TEĎ, po getClaims() výše -- ať
  // request.cookies.set() volání ze setAll() (proběhlo-li obnovení
  // tokenu) je už promítnuté do Cookie hlavičky, kterou přebíráme.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(USER_ID_HEADER);
  requestHeaders.delete(USER_EMAIL_HEADER);
  if (user?.sub) {
    requestHeaders.set(USER_ID_HEADER, user.sub);
    requestHeaders.set(
      USER_EMAIL_HEADER,
      encodeURIComponent(typeof user.email === "string" ? user.email : ""),
    );
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  cookiesToApply.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options),
  );
  return response;
}
