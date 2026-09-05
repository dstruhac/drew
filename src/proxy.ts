import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    {
      /*
       * Match all request paths except for the ones starting with:
       * - _next/static, _next/image (Next.js internals)
       * - favicon.ico, and common static asset extensions
       */
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      // Next.js Link prefetch requests don't need (and shouldn't trigger) an
      // auth session refresh -- a page with lots of links (e.g. the match
      // list cards) can fire off many of these in a burst while scrolling,
      // which was silently churning through refresh tokens without ever
      // persisting the new one back to the browser (the app's server
      // components can't set cookies, only this proxy can -- see
      // src/lib/supabase/server.ts). Skipping proxy for prefetch requests
      // is Next.js's own documented fix for this class of bug.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
