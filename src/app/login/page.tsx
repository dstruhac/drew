"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon } from "@/components/google-icon";

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
          <GoogleIcon className="h-4 w-4" />
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
