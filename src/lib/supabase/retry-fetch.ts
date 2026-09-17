// Appka měla dřív ochranu proti přechodným výpadkům Supabase ("Gateway
// Timeout", chvilkový výpadek spojení) jen ve svých GitHub Actions
// skriptech (scripts/sync/*.mjs, withJwtRetry/withTransientRetry) --
// živá appka na webu žádnou neměla, takže jeden jednorázový výpadek
// jednoho z několika souběžných dotazů na stránce rovnou ukázal celou
// obrazovku "Data se nepodařilo načíst" (nahlásil hráč při úplně
// prvním přihlášení, 17.9.2026 -- viz docs/HISTORY.md).
//
// Supabase klient dovolí předat vlastní `fetch` (options.global.fetch),
// kterým jdou projít VŠECHNY jeho síťové požadavky -- tohle je jediné
// místo v appce, které to potřebuje upravit, místo přepisování
// desítek jednotlivých dotazů na každé stránce.
//
// Retry se dělá JEN na čtecí (GET) požadavky -- postgrest-js posílá GET
// pro select(), ale POST pro insert/update/upsert/rpc, takže appka
// nikdy neriskuje, že by kvůli retry omylem odeslala zápis dvakrát.
const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryingFetch(fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") return fetchImpl(input, init);

    for (let attempt = 0; ; attempt += 1) {
      const isLastAttempt = attempt >= MAX_RETRIES;
      try {
        const response = await fetchImpl(input, init);
        if (!TRANSIENT_STATUS_CODES.has(response.status) || isLastAttempt) {
          return response;
        }
      } catch (err) {
        if (isLastAttempt) throw err;
      }
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  };
}
