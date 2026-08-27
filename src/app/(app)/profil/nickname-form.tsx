"use client";

import { useActionState } from "react";
import { updateNickname, type UpdateNicknameState } from "./actions";

const initialState: UpdateNicknameState = { error: null, success: false };

export function NicknameForm({ currentName }: { currentName: string }) {
  const [state, formAction, isPending] = useActionState(updateNickname, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="display_name" className="text-sm font-medium">
        Přezdívka na žebříčku
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="display_name"
          type="text"
          name="display_name"
          required
          maxLength={50}
          defaultValue={currentName}
          className="w-56 rounded-md border border-black/10 dark:border-white/15 bg-transparent px-2 py-1 text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-black/30 dark:focus:ring-white/30"
        />
        <button
          type="submit"
          disabled={isPending}
          className="btn-press rounded-md border border-black/10 dark:border-white/15 px-3 py-1 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
        >
          {isPending ? "Ukládám…" : "Uložit"}
        </button>
      </div>

      {state.error && (
        <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>
      )}
      {state.success && (
        <span className="text-xs text-green-600 dark:text-green-400">Uloženo.</span>
      )}
    </form>
  );
}
