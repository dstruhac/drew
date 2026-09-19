"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

// Klikací (ne hover) info bublina -- appka je primárně mobilní, kde
// hover neexistuje, takže tooltip musí jít otevřít i zavřít ťuknutím.
// Zavírá se i ťuknutím kamkoliv jinam na stránku.
export function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleOutsideClick);
    return () => document.removeEventListener("pointerdown", handleOutsideClick);
  }, [open]);

  return (
    <div ref={containerRef} className="absolute right-3 top-3 z-10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Nápověda"
        aria-expanded={open}
        className="btn-press flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/60 transition-colors hover:bg-white/20 hover:text-white"
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2.4} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-2 w-56 rounded-xl border border-white/10 bg-[#1f2229] p-3 text-xs font-medium leading-snug text-white/80 shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          {text}
        </div>
      )}
    </div>
  );
}
