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
     *
     * Prefetch požadavky (next-router-prefetch/purpose:prefetch) se
     * záměrně NEVYNECHÁVAJÍ, i když by to Next.js dokumentace
     * doporučovala jako výkonovou optimalizaci -- appka potřebuje, aby
     * TOHLE proxy vždy proběhlo jako první a jako jediné místo, které
     * smí obnovit vypršelý přihlašovací token (viz getCurrentUser() v
     * lib/supabase/server.ts, kam appka teď posílá ověřeného uživatele
     * hlavičkou místo vlastního volání). Kdyby middleware prefetch
     * požadavky přeskakovalo, server komponenty by pro ně zůstaly
     * jediným místem ověřujícím přihlášení -- a ty neumí novou cookii
     * bezpečně uložit.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};
