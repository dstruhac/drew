"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setIsLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
    // On success the browser is redirected to Google, so no further
    // action is needed here.
  }

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-10%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_60%)]"
      />

      <div className="w-full max-w-sm rounded-[28px] border border-border-subtle bg-surface/80 p-8 text-center shadow-[var(--shadow-card)] backdrop-blur-sm">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent">
          <ChevronDown className="h-6 w-6 text-accent-foreground" strokeWidth={2.6} />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight">Klopi</h1>
        <p className="mt-2 text-sm font-semibold italic text-muted-foreground">
          Tipuj. Boduj. Chečruj kamarády.
        </p>
        <p className="mt-4 text-sm font-medium text-muted-foreground">
          Tipovací hra na sportovní zápasy
        </p>

        <div className="mt-8 border-t border-border-subtle" />

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          className="btn-press mt-8 flex w-full items-center justify-center gap-3 rounded-full border border-border-subtle px-4 py-3 text-sm font-bold hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          {isLoading ? "Přesměrovávám…" : "Přihlásit se přes Google"}
        </button>

        {error && (
          <p className="mt-4 text-xs font-semibold text-danger">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.83z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.12A11.998 11.998 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.61H1.26a12 12 0 0 0 0 10.78l4.01-3.12z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.26 6.61l4.01 3.12C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}
