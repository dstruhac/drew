"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

// GIFky appka bere přímo z prohlížeče (GIPHY search API) -- appka
// jako takové jen uloží vybranou URL do zprávy, žádné vyhledávání
// negeneruje na serveru. Klíč je veřejný "client-side" typ (přesně
// určený GIPHY pro tenhle účel, viz developers.giphy.com), proto je
// v NEXT_PUBLIC_ proměnné bezpečně vystavený v prohlížeči.
const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY;

type GiphyResult = {
  id: string;
  images: {
    fixed_height_small: { url: string; width: string; height: string };
    original: { url: string };
  };
};

// Malé rozbalovací okno (stejný vzor jako MobileMenu -- klik mimo
// zavře) s vyhledávacím polem a mřížkou náhledů. Appka defaultně (bez
// zadaného hledání) ukáže "trending" GIFky, ať okno není prázdné hned
// po otevření.
export function GifPicker({ onSelect }: { onSelect: (gifUrl: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GiphyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [open]);

  // Appka u pomalejšího/staršího dotazu (proměnlivá latence GIPHY) umí
  // poznat, že mezitím odešel novější -- jinak by starší odpověď mohla
  // dorazit až po novější a přepsat výsledky za jiné hledané slovo, než
  // appka zrovna ukazuje v poli (nalezeno Codex review na PR #231).
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    if (!open || !GIPHY_API_KEY) return;

    // Appka hledání odloží o 350 ms od posledního stisku klávesy, ať
    // neposílá dotaz na GIPHY při každém písmenku.
    const timeout = setTimeout(async () => {
      const requestId = ++latestRequestIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const endpoint = query.trim()
          ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query.trim())}&limit=20&rating=pg-13&lang=cs`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg-13`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`GIPHY vrátilo ${res.status}`);
        const json = await res.json();
        if (latestRequestIdRef.current !== requestId) return;
        setResults(json.data ?? []);
      } catch {
        if (latestRequestIdRef.current !== requestId) return;
        setError("Nepodařilo se načíst GIFky, zkus to prosím znovu.");
      } finally {
        if (latestRequestIdRef.current === requestId) setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [open, query]);

  function pick(gif: GiphyResult) {
    onSelect(gif.images.original.url);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Zavřít výběr GIFky" : "Přidat GIFku"}
        aria-expanded={open}
        className="btn-press flex items-center gap-1 rounded-full border border-border-subtle px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      >
        GIF
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 flex h-80 w-72 flex-col gap-2 rounded-2xl border border-border-subtle bg-surface p-3 shadow-[var(--shadow-card)]">
          {!GIPHY_API_KEY ? (
            <p className="m-auto max-w-[200px] text-center text-xs font-medium text-muted-foreground">
              GIF vyhledávání zatím není nastavené (chybí GIPHY API klíč).
            </p>
          ) : (
            <>
              <div className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-faint-foreground" strokeWidth={2.4} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Hledat GIFku…"
                  autoFocus
                  className="w-full bg-transparent text-xs outline-none"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} aria-label="Vymazat hledání">
                    <X className="h-3.5 w-3.5 text-faint-foreground" strokeWidth={2.4} />
                  </button>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading && (
                  <p className="p-2 text-center text-xs text-muted-foreground">Načítám…</p>
                )}
                {error && <p className="p-2 text-center text-xs text-danger">{error}</p>}
                {!loading && !error && results.length === 0 && (
                  <p className="p-2 text-center text-xs text-muted-foreground">Nic nenalezeno.</p>
                )}
                <div className="grid grid-cols-2 gap-1.5">
                  {results.map((gif) => (
                    <button
                      key={gif.id}
                      type="button"
                      onClick={() => pick(gif)}
                      className="btn-press overflow-hidden rounded-lg border border-border-subtle hover:opacity-80"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={gif.images.fixed_height_small.url}
                        alt=""
                        className="h-20 w-full object-cover"
                        loading="lazy"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <p className="shrink-0 text-center text-[9px] font-bold uppercase tracking-wide text-faint-foreground">
                Powered by GIPHY
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
