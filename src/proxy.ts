import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico, and common static asset extensions
     *
     * .webmanifest doplněno 6.9.2026 -- appka na Androidu ukazovala
     * u "Přidat na plochu" prázdnou ikonu, protože middleware
     * přesměrovával /manifest.webmanifest nepřihlášeného hráče na
     * /login (JSON manifest tak Chrome dostal jako HTML přihlašovací
     * stránku a nenašel v něm žádné ikony).
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};
