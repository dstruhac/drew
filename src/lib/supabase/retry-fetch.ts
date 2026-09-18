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

// Druhá, samostatná třída chyby (18.9.2026, reálný incident -- hráčka
// hlásila stejnou obrazovku hned po prvním přihlášení, i po kliknutí
// na "Zkusit znovu", na dvou různých zařízeních): Supabase občas na
// pár desítek vteřin až minut vrátí "JWT issued at future" na jinak
// platný token -- appčiny GitHub Actions skripty na tohle narážejí
// opakovaně a mají vlastní retry (scripts/sync/predict-reminders.mjs
// `withJwtRetry`, scripts/sync/results.mjs `withTransientRetry`, viz
// docs/HISTORY.md) -- appka na webu tenhle konkrétní typ chyby dřív
// vůbec neřešila. Je to nesoulad hodin na straně Supabase (appka na
// to nemá vliv), ne 5xx stavový kód ani výpadek spojení -- retry výše
// (TRANSIENT_STATUS_CODES) na to proto nikdy nezabral, ani po
// ručním "Zkusit znovu" (skew typicky trvá desítky vteřin, jeden klik
// hned po chybě padne pořád do stejného okna). Appka nejsvěžejší JWT
// má vždycky hned po přihlášení, takže je logické, že se to hráčům
// nejčastěji ukáže právě tam.
//
// Chyba přichází jako 401/403 s tímhle textem v těle odpovědi -- appka
// proto u těchhle dvou stavových kódů tělo (klonovaně, ať nezkazí
// čtení volajícímu) zkontroluje, a jen když text sedí, zkusí požadavek
// znovu s delší prodlevou (skew netrvá jen pár desítek ms jako
// přechodný síťový výpadek). Jiný 401/403 (např. reálně vypršelá
// session) appka nechává projít beze změny -- ten se retry nespraví.
const JWT_CLOCK_SKEW_ERROR_STATUS_CODES = new Set([401, 403]);
const JWT_CLOCK_SKEW_RETRY_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isJwtClockSkewError(response: Response): Promise<boolean> {
  try {
    const text = await response.clone().text();
    return /jwt issued at future/i.test(text);
  } catch {
    return false;
  }
}

export function retryingFetch(fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") return fetchImpl(input, init);

    for (let attempt = 0; ; attempt += 1) {
      const isLastAttempt = attempt >= MAX_RETRIES;
      let response: Response;
      try {
        response = await fetchImpl(input, init);
      } catch (err) {
        if (isLastAttempt) throw err;
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      if (TRANSIENT_STATUS_CODES.has(response.status)) {
        if (isLastAttempt) return response;
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      if (
        !isLastAttempt &&
        JWT_CLOCK_SKEW_ERROR_STATUS_CODES.has(response.status) &&
        (await isJwtClockSkewError(response))
      ) {
        await sleep(JWT_CLOCK_SKEW_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }

      return response;
    }
  };
}
