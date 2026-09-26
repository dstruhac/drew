"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

// GIFky appka bere přímo z prohlížeče (GIPHY search API) -- appka
// jako takové jen uloží vybranou URL do zprávy, žádné vyhledávání
// negeneruje na serveru. Klíč je veřejný "client-side" typ (přesně
// určený GIPHY pro tenhle účel, viz developers.giphy.com), proto je
// v NEXT_PUBLIC_ proměnné bezpečně vystavený v prohlížeči.
const GIPHY_API_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY;

// Výchozí motiv bez zadaného hledání -- vybráno uživatelem 26.9.2026
// (místo obecných "trending" GIFek napříč celým GIPHY, netematických).
const DEFAULT_QUERY = "sports fail";

type GiphyResult = {
  id: string;
  images: {
    fixed_height_small: { url: string; width: string; height: string };
    original: { url: string };
  };
};

// Malé rozbalovací okno (stejný vzor jako MobileMenu -- klik mimo
// zavře) s vyhledávacím polem a mřížkou náhledů. Appka defaultně (bez
// zadaného hledání) ukáže `DEFAULT_QUERY`, ať okno není prázdné hned
// po otevření a nabídka sedí tematicky k appce.
export function GifPicker({ onSelect }: { onSelect: (gifUrl: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GiphyResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // Appka na dotykových zařízeních vyhledávací pole nezaostřuje samo
  // (viz `autoFocus` níže), na počítači s myší/touchpadem ale appka
  // zaostření ponechává -- ať tam psaní hledání jde rovnou bez
  // klikání do pole (nalezeno vlastní code-review). Appka `pointer:
  // fine` zjišťuje až po připojení komponenty (ne přímo při
  // vykreslení), appka totiž tuhle část stránky vykresluje jen po
  // klientské interakci (otevření okýnka), takže žádná neshoda mezi
  // serverem a prohlížečem (hydration mismatch) appce nehrozí.
  const [preferAutoFocus, setPreferAutoFocus] = useState(false);
  useEffect(() => {
    setPreferAutoFocus(window.matchMedia("(pointer: fine)").matches);
  }, []);

  // Appka focus vždycky nejdřív sama pustí, než okýnko zavře -- prohlížeč
  // (hlavně mobilní Safari) umí při odstranění prvku se zaostřením ze
  // stránky bez varování hodit scroll na úplný začátek stránky
  // (nahlášeno 26.9.2026 po odeslání GIFky). Pouští ale JEN zaostření
  // uvnitř tohohle okýnka (vyhledávací pole) -- iOS Safari při klepnutí
  // na tlačítko nepouští zaostření z JINÉHO pole (např. pole na zprávu
  // vedle GIF tlačítka), appka by mu jinak sama zavřením okýnka
  // nechtěně zavřela klávesnici i zaostření uprostřed psaní zprávy
  // (nalezeno Codex review). Zaostření appka vrátí zpátky na tlačítko
  // "GIF" -- jinak by ho hráč ovládající appku klávesnicí/čtečkou
  // obrazovky po zavření okýnka ztratil úplně (nalezeno vlastní
  // code-review). `preventScroll` u tohohle zaostření je záměrně --
  // prohlížeč by jinak mohl zkusit tlačítko "doscrollovat" do pohledu
  // zrovna ve chvíli, kdy se zavírá klávesnice a stránka se
  // přeskládává, a appka by tím dostala nový scroll-jump namísto toho,
  // co se tímhle celým `close()` snaží odstranit (nalezeno vlastní
  // code-review).
  function close() {
    if (containerRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement | null)?.blur();
      toggleButtonRef.current?.focus({ preventScroll: true });
    }
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [open]);

  // Appka u pomalejšího/staršího dotazu (proměnlivá latence GIPHY) umí
  // poznat, že mezitím odešel novější -- jinak by starší odpověď mohla
  // dorazit až po novější a přepsat výsledky za jiné hledané slovo, než
  // appka zrovna ukazuje v poli (nalezeno Codex review na PR #231).
  // Appka `requestId` zvyšuje HNED při změně `query`/`open` (mimo
  // debounce), ne až uvnitř zpožděného volání -- jinak by starší dotaz,
  // který zatím čeká na svou odpověď, appka stále považovala za
  // "aktuální" ještě celých 350 ms po zadání nového hledání (nalezeno
  // Codex review na PR #231, 3. kolo -- appka první verzi opravy měla
  // pořád stejnou chybu, jen s menší pravděpodobností).
  const latestRequestIdRef = useRef(0);

  useEffect(() => {
    if (!open || !GIPHY_API_KEY) return;

    const requestId = ++latestRequestIdRef.current;
    // Appka staré výsledky schová hned při zadání nového hledání, ne až
    // po dojetí nového dotazu -- jinak by zůstaly celých 350 ms (+ čas
    // na odpověď GIPHY) klikatelné a appka by tak mohla poslat GIFku za
    // úplně jiné slovo, než co je zrovna napsané v poli (nalezeno Codex
    // review na PR #231, 4. kolo).
    setResults([]);

    // Appka hledání odloží o 350 ms od posledního stisku klávesy, ať
    // neposílá dotaz na GIPHY při každém písmenku.
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        // Appka bez zadaného hledání ukáže vtipné sportovní nezdary
        // (`DEFAULT_QUERY`), ne obecné "trending" GIFky napříč celým
        // GIPHY -- na žádost uživatele 26.9.2026, ať je výchozí nabídka
        // tematicky sedící k appce. `lang=cs` appka posílá jen u
        // hledání, co si hráč sám napsal (může být česky) -- u
        // anglického `DEFAULT_QUERY` by appce jen zbytečně měnil, jak
        // GIPHY tenhle konkrétní výraz interpretuje/lokalizuje
        // (nalezeno Codex review).
        const endpoint = query.trim()
          ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query.trim())}&limit=20&rating=pg-13&lang=cs`
          : `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(DEFAULT_QUERY)}&limit=20&rating=pg-13`;
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
    close();
    setQuery("");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        ref={toggleButtonRef}
        // `close()`, ne přímo `setOpen(false)`, když hráč zavře okýnko
        // tímhle tlačítkem znovu -- jinak by stejný scroll-jump bug
        // (viz `close()` výše) hrozil i tudy, ne jen přes klik mimo
        // okýnko nebo vybráním GIFky (nalezeno Codex review).
        onClick={() => (open ? close() : setOpen(true))}
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
                  // `autoFocus` jen na zařízeních s `pointer: fine`
                  // (myš/touchpad) -- appka dřív klávesnici (a s ní
                  // zaostření mobilního prohlížeče na tohle pole)
                  // otevírala hned po kliknutí na "GIF" i na dotyku,
                  // takže mřížka nabízených GIFek pod polem zajela pod
                  // klávesnici dřív, než ji hráč vůbec uviděl (nahlášeno
                  // 26.9.2026). Na počítači appka zaostření nechává --
                  // žádná klávesnice, co by cokoliv zakrývala, tam
                  // nehrozí, tak ať jde psát hledání rovnou.
                  autoFocus={preferAutoFocus}
                  // `text-base` (16px) na dotykových zařízeních ze
                  // stejného důvodu jako v chat-panel.tsx -- menší
                  // písmo appka nechává jen `pointer-fine` zařízením
                  // (myš/touchpad), NE podle šířky okna (`sm:`) --
                  // mobil na šířku (landscape) je běžně širší než 640px,
                  // takže `sm:` by menší písmo (a tím pádem auto-zoom)
                  // omylem vrátilo i na dotykovém displeji (nalezeno
                  // Codex review na PR #233).
                  className="w-full bg-transparent text-base outline-none pointer-fine:text-xs"
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
