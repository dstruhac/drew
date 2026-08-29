"use client";

import { useActionState } from "react";
import { updateNickname, type UpdateNicknameState } from "./actions";

const initialState: UpdateNicknameState = { error: null, success: false };

export function NicknameForm({ currentName }: { currentName: string }) {
  const [state, formAction, isPending] = useActionState(updateNickname, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="display_name" className="text-sm font-bold">
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
          className="w-56 rounded-[10px] border border-border-subtle bg-transparent px-3 py-1.5 text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
        <button
          type="submit"
          disabled={isPending}
          className="btn-press rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-accent-foreground disabled:opacity-50"
        >
          {isPending ? "Ukládám…" : "Uložit"}
        </button>
      </div>

      {state.error && (
        <span className="text-xs font-semibold text-danger">{state.error}</span>
      )}
      {state.success && (
        <span className="text-xs font-semibold text-success">Uloženo.</span>
      )}
    </form>
  );
}
