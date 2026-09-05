"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-16 sm:px-10">
      <section
        role="alert"
        className="w-full rounded-[24px] border border-danger/30 bg-surface p-6 shadow-[var(--shadow-card)]"
      >
        <p className="text-sm font-bold text-danger">Něco se nepovedlo</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          Data se teď nepodařilo načíst
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tvoje tipy se neztratily. Může jít o krátký výpadek připojení nebo databáze.
        </p>
        <button
          type="button"
          onClick={reset}
          className="btn-press mt-5 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white"
        >
          Zkusit znovu
        </button>
      </section>
    </main>
  );
}
