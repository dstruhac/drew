# Drew — kontext projektu

Živý dokument. Aktualizuje se po každé větší funkci nebo rozhodnutí, ať
kdokoliv (včetně budoucí Claude Code session) může kdykoliv navázat bez
ztráty kontextu. Viz `CLAUDE.md` pro trvalá pravidla, jak s tímto
repozitářem pracovat.

## Co to je

Tipovací hra na sportovní zápasy (nejdřív hokej a fotbal) pro malou
uzavřenou skupinu uživatelů (kolegové, kamarádi). Uživatelé tipují
skóre zápasů před výkopem, po zápase se jim spočítají body.

## Tech stack

- **Next.js 16** (App Router) + TypeScript, `src/` layout, pnpm
- **Tailwind CSS** (čistý, bez komponentní knihovny)
- **Supabase**: Postgres DB, Auth (Google OAuth), do budoucna Edge
  Functions + `pg_cron` pro pravidelné stahování výsledků (ne Vercel
  Cron — free tier neumožňuje běh častěji než 1×/den)
- **Hosting**: Vercel

## Účty a odkazy

- **GitHub repo**: https://github.com/dstruhac/drew (default branch `main`)
- **Vercel projekt**: https://vercel.com/dstruhacs-projects/drew
  - produkční URL: **https://drew-pink.vercel.app**
  - produkční deploy se spouští jen z `main` (push na jinou branch = jen preview URL)
- **Supabase projekt**: https://supabase.com/dashboard/project/rvcxdlmwxdykkxpqegzr
  - `NEXT_PUBLIC_SUPABASE_URL=https://rvcxdlmwxdykkxpqegzr.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = publishable klíč, viz `.env.local` (necommitnutý; hodnota je veřejná/bezpečná v klientském kódu, ale přesto ji nedáváme do repa) a nastavený v env proměnných na Vercelu
- **Google Cloud projekt "Drew"**: OAuth 2.0 client pro Google Sign-In
  - Client ID: `151884903772-gdqjv8knvcghh17posnrd7qu5kta518l.apps.googleusercontent.com`
  - Client Secret: uložen jen v Supabase Dashboardu (Authentication → Providers → Google), nikde v repu
  - Redirect URI nastavené v Google Console: `https://rvcxdlmwxdykkxpqegzr.supabase.co/auth/v1/callback`
  - Authorized origins: `https://drew-pink.vercel.app`, `http://localhost:3000`

## Datový model (`supabase/migrations/`)

Migrace jsou rozdělené po tabulkách, spouští se ručně přes Supabase SQL
editor (žádné napojení přes Supabase CLI zatím není — projekt není
`supabase link`ovaný, protože bychom potřebovali access token/DB heslo).

- **profiles** — 1:1 k `auth.users`, `display_name` + `avatar_url`.
  Auto-vytváří se triggerem `on_auth_user_created` při signupu.
- **competitions** ("spaces") — jedna tipovací soutěž/sezóna. `sport`
  a `status` jsou `text` + `check` constraint (ne Postgres enum) —
  přidání nového sportu je pak jen změna constraintu, ne migrace typu.
  Bodování (`points_exact`/`points_winner`/`points_total_goals`,
  výchozí 3/1/1) je per-competition.
- **matches** — zápasy uvnitř competition. `external_id` je nullable —
  `NULL` už teď znamená "ručně vytvořený zápas mimo API", takže budoucí
  manuální zápasy nevyžadují žádnou restrukturalizaci.
- **predictions** — tip jednoho uživatele na jeden zápas. `is_locked`
  je jen zobrazovací flag; skutečné vynucení "nelze upravit po výkopu"
  dělá RLS porovnáním s `matches.kickoff_at` **a** `matches.status`
  (viz níže — obojí musí platit, ne jen jedno).
- **competition_participants** — explicitní "hraju tuhle soutěž"
  (`competition_id`, `user_id`, `joined_at`), samoobslužné
  přihlášení/odhlášení. Bez tohohle řádku appka nedovolí zadat první
  tip v dané competition (viz níže) a hráč se neukáže v leaderboardu.
- **weekly_badges** — vizuální odznak za nejvíc bodů v kalendářním
  týdnu, zvlášť za každou competition (`competition_id, week_start,
  user_id, points` — všechny tři první sloupce dohromady tvoří
  primární klíč, ne jen `user_id`, protože při remíze dostane odznak
  víc hráčů zároveň). Zapisuje jen periodická úloha
  `award-weekly-badges` (service role); žádná insert/update/delete
  policy pro běžné uživatele. Podrobnosti a odůvodnění rozhodnutí viz
  krok 13 v sekci "Naplánované další kroky".

### RLS rozhodnutí (odsouhlaseno s uživatelem)

- **Viditelnost tipů**: před výkopem vidí uživatel jen svůj vlastní
  tip; po výkopu (`kickoff_at <= now()`) se odemknou tipy všech.
  Zabraňuje opisování.
- **Přihlášení do soutěže jako podmínka pro tip** (odsouhlaseno
  2026-08-26): uživatel musí mít v `competition_participants` řádek
  pro danou competition, jinak mu insert do `predictions` selže na
  RLS — nejde tedy tipovat bez explicitního "Chci hrát". Vynuceno
  v DB, ne jen skrytím tlačítka v UI.
- **Zakládání competitions/matches**: zatím žádná insert/update/delete
  policy pro běžné uživatele — píše se jen přes service roli / SQL
  editor ručně. Self-service založení soutěže je budoucí feature.
- **Zamykání tipů**: zápas je zamčený (nejde přidat/upravit/smazat tip),
  když nastal `kickoff_at` NEBO `status <> 'scheduled'` — obě podmínky
  se kontrolují nezávisle, protože při ručním zadávání výsledků přes
  SQL editor běžně nastavíte `status='finished'` dřív, než reálně
  uplyne naseedovaný `kickoff_at`. Objeveno jako bug při demo testování
  (`supabase/migrations/20260825120000_lock_by_status.sql`) — do té
  doby to kontrolovalo jen `kickoff_at`, takže šlo tip upravit i po
  zadání výsledku.
- **Grants**: Supabase u čerstvého projektu automaticky negrantuje
  přístup k novým tabulkám ve `public` schématu — bez explicitního
  `GRANT` selhávají dotazy s "permission denied for table ...", ještě
  před vyhodnocením RLS politik. Viz
  `supabase/migrations/20260825090000_grants.sql` (role `authenticated`,
  objeveno při demo testování appky) a
  `supabase/migrations/20260827090000_service_role_grants.sql` (role
  `service_role`, objeveno prvním ostrým během `sync-fixtures.yml`
  27.8.2026 — stejná chyba, jen jiná role, dřív nebyl důvod ji potkat,
  protože nic pod service role klíčem ještě neběželo) a
  `supabase/migrations/20260827110000_competitions_service_role_insert_grant.sql`
  (opět `service_role`, ale tentokrát `insert`/`update` na `competitions`
  — dřív měla jen `select`, protože nic pod service role klíčem do
  `competitions` nezapisovalo; objeveno 27.8.2026 při prvním běhu
  `scripts/sync/ensure-competition.mjs`, viz níže) a
  `supabase/migrations/20260827140000_predictions_service_role_select_grant.sql`
  (opět `service_role`, tentokrát `select` na `predictions` — objeveno
  27.8.2026 při prvním ostrém běhu `award-weekly-badges.mjs`, viz krok
  13 níže; čtvrtý výskyt stejné třídy chyby, pokaždé objeven přesně ve
  chvíli, kdy se service role klíčem poprvé sáhlo na danou tabulku).
- **Unikátní index pro upsert zápasů**: `matches_competition_external_id_key`
  byl původně částečný (`where external_id is not null`), aby ručně
  vytvořené zápasy (`external_id is null`) mohly existovat vícekrát.
  Postgres ale částečný index nepoužije jako cíl pro `ON CONFLICT
  (competition_id, external_id)` (jen seznam sloupců, bez `WHERE`) —
  `sync-fixtures.mjs` proto při prvním ostrém běhu (27.8.2026) padal na
  "no unique or exclusion constraint matching". Oprava:
  `supabase/migrations/20260827100000_fix_matches_conflict_index.sql`
  dělá index neomezený — chování zůstává stejné, protože Postgres bere
  každý `NULL` jako navzájem odlišný, takže víc ručních zápasů bez
  `external_id` je pořád v pořádku.

### Vědomě NEimplementováno (ale místo v modelu na to je)

Zadání explicitně říká tohle teď nestavět, jen nechat prostor:
bonusové otázky ke dni, skupiny/týmy uvnitř competition, grace perioda
na pozdní tip. Žádné z těchto polí/tabulek zatím neexistuje — přidají
se jako nové tabulky/sloupce, až budou potřeba.

## Aplikace (`src/`)

- `src/app/login` — přihlašovací stránka, klientská komponenta,
  `supabase.auth.signInWithOAuth({ provider: "google" })`
- `src/app/auth/callback/route.ts` — vymění OAuth `code` za session
  (`exchangeCodeForSession`), přesměruje na `/spaces`
- `src/app/(app)/` — route group (nemění URL) pro celou přihlášenou
  část appky: `spaces/`, `spaces/[id]/`, `spaces/[id]/leaderboard/`,
  `profil/`. Sdílí `layout.tsx`, který renderuje `AppHeader`.
- `src/components/app-header.tsx` — horní lišta napříč `(app)`:
  fotečka uživatele (`profiles.avatar_url`, iniciála jako fallback)
  vedoucí na `/profil` + "Odhlásit se" (server action).
- `src/app/(app)/spaces` — server komponenta, načítá `competitions` z DB
- `src/proxy.ts` + `src/lib/supabase/middleware.ts` — na každém
  requestu obnoví session; nepřihlášené přesměruje na `/login`
  (kromě `/login` a `/auth/callback`), přihlášené odchytí na `/login`
  a pošle na `/spaces`
- `src/lib/supabase/{client,server}.ts` — browser/server Supabase klienti
- `src/lib/supabase/database.types.ts` — ručně psané typy podle
  migrací (žádné `supabase link` zatím, takže ne generované).
  **Pozor**: každá tabulka musí mít i `Relationships: [...]` klíč, jinak
  postgrest-js typuje `select()` jako `never` (na tohle jsme narazili).

## Aktuální cíl: POC demo pro kámoše ✅ appka funguje (2026-08-25)

Uživatel potvrdil: `/spaces` ukazuje soutěž, detail ukazuje 3 zápasy,
tip jde uložit a zůstává po refreshi. Zbývá jen doplnit kamarády jako
Google test users, až budou známé jejich e-maily (viz níže).

Uživatel chce appku ukázat kamarádům jako proof-of-concept, bez
napojení na reálná data/výsledky. Domluveno:
- kámoši se sami přihlásí přes Google (ne jen sledují) a reálně zkusí
  zadat tip
- do "Hokejová extraliga 2026/27" jsou/budou 2–3 fiktivní zápasy v
  budoucnosti (jde na ně tipovat), žádný v minulosti zatím záměrně ne
- **pozor na Google OAuth consent screen "Testing" mode** — pokud není
  publikovaný (nebo kámoši přidáni jako test users), přihlášení jim
  spadne na "app is blocked". Nutno ověřit/vyřešit před demem.
  - Rozhodnuto: zůstáváme v "Testing" a kamarády přidáme jako **Test
    users** (ne Publish App) — uživatel to vyplní, až bude znát jejich
    e-maily. Google Cloud Console → OAuth consent screen → nejdřív
    dokončit tab **Branding** (app name/support email, obvykle už
    vyplněné), pak tab **Audience** → **Test users** → přidat e-maily.
  - **Stále otevřené, čeká se na e-maily kolegů.**

## Stav (aktualizováno 2026-08-28, přidána Premier League a upozornění na nevyplněný tip)

Hotovo:
- [x] Scaffold Next.js + TS + Tailwind
- [x] SQL migrace (profiles, competitions, matches, predictions + RLS + grants)
- [x] Supabase klienti (browser/server/proxy)
- [x] Login stránka + funkční Google OAuth, motto a vizuální redesign
- [x] Ochrana stránek podle přihlášení
- [x] Nasazení na Vercel (https://drew-pink.vercel.app)
- [x] `/spaces` načítá reálné competitions z DB, u vlastních soutěží ukazuje
  pozici v žebříčku (🏆 Tvoje pozice: X. místo z Y)
- [x] První competition založená ručně: "Hokejová extraliga 2026/27" (hockey)
- [x] `/spaces/[id]` — detail soutěže se seznamem zápasů
- [x] Formulář na tip (predictions) — upsert přes server action,
  auto-save po vyplnění obou skóre a opuštění pole (tlačítko "Uložit tip"
  zůstává jako záloha), numerická klávesnice na mobilu, disabled/readonly
  po zamčení (kickoff_at v minulosti)
- [x] Leaderboard / žebříček za competition —
  `src/app/(app)/spaces/[id]/leaderboard/page.tsx`. Celkový žebříček (počet
  přesně trefených výsledků u každého hráče) + živý týdenní žebříček
  (aktuální rozpracovaný týden, sám se vynuluje s novým týdnem, žádná nová
  tabulka)
- [x] Detail zápasu se seznamem tipů všech hráčů — `/spaces/[id]/matches/[matchId]`
- [x] Sekce "Nadcházející"/"Proběhlé" v detailu soutěže — "Proběhlé" ve
  vlastní šedé kartě, "Nadcházející" dál dělené na "Ještě netipováno"
  (vždy všechny, bez limitu) a sbalené "Už tipnuto" — viz krok 15
- [x] Sdílená hlavička appky s fotečkou uživatele
- [x] Skutečné "přihlášení" (členství) do competition — nepřihlášenému
  hráči appka hned pod hlavičkou soutěže navrhne kliknout na "Chci hrát"
- [x] `sync-fixtures` (import rozpisu zápasů scrapingem) běží ostře — hokejová extraliga má reálné zápasy se správným časem
- [x] `sync-results` (import výsledků) běží ostře, automaticky, včetně zpětného dotažení
- [x] Medaile za vítězství týdne (`weekly_badges`) — 🏅 na žebříčku soutěže
- [x] Výkonová optimalizace — sdílený `getCurrentUser()` (React `cache()`,
  místo 2-3× volání `supabase.auth.getUser()` na request) + souběžné
  (`Promise.all`) místo sekvenčních databázových dotazů na každé stránce
- [x] Konzistentní hover/klik/focus odezva napříč appkou (`.btn-press`,
  `.card-lift` v `globals.css`)
- [x] Loga soutěže a klubů (Chance Liga) — zdroj lfafotbal.cz, viz kroky
  6+7 níže pro detaily architektury i importu
- [x] Barevné odlišení kartičky zápasu podle úspěšnosti vlastního tipu
  (zelená/žlutá/šedá) — viz krok 8 níže
- [x] Úklid testovacích dat (28.8.2026) — smazána testovací competition
  "Fotbalová liga 2026/27" (vymyšlené týmy, nikdy nebyla v appce
  dokumentovaná jako sledovaná) a 3 ručně založené demo zápasy uvnitř
  "Hokejová extraliga 2026/27" (Třinec–Sparta, Kometa Brno–Bílí Tygři
  Liberec, Mountfield HK–Dynamo Pardubice), které z prvních dnů vývoje
  zůstaly v databázi bez `external_id`, takže by je `sync-results`
  nikdy nedotáhl k výsledku. Provedeno přes jednorázový GitHub Actions
  workflow (service role klíč, `on delete cascade` smazal i navázané
  tipy) — `service_role` nejdřív potřebovalo doplnit GRANT DELETE na
  `matches`/`competitions`
  (`supabase/migrations/20260828070000_matches_competitions_service_role_delete_grant.sql`,
  pátý výskyt stejné třídy chyby jako předchozí granty výše). Workflow
  po použití smazán ze souborového stromu, ať v repu nezůstává trvalá
  schopnost mazat data. V appce teď zůstávají jen dvě reálně sledované
  soutěže: Hokejová extraliga 2026/27 a Chance Liga.
- [x] Veřejný profil hráče — `/profil/[userId]` (28.8.2026). Seznam
  soutěží, které hráč hraje, s pozicí v žebříčku, celkovými body,
  počtem přesných tipů a medailí za vítězství týdne. Odkazy přidány ze
  žebříčku, detailu zápasu a z vlastního nastavení profilu. Podrobnosti
  a odůvodnění rozhodnutí (veřejný vs. soukromý, rozsah obsahu) viz
  nápad č. 3 v sekci "Naplánované další kroky".
- [x] Přidána anglická **Premier League** jako třetí sledovaná soutěž
  (28.8.2026, na žádost uživatele) — scraping z livesport.cz stejným
  mechanismem jako Chance Liga, žádná změna kódu. 30 zápasů v rozpisu,
  10 zpětně dotažených výsledků. Podrobnosti (ověření `scrape_path`,
  volba názvu) viz sekce "Sledované soutěže" u kroku 5 výše.
- [x] Upozornění na nevyplněný tip e-mailem — `predict-reminders.mjs`
  běží automaticky po hodině, opt-in tlačítkem "🔔 Chci upozornit" na
  stránce soutěže (za každou soutěž zvlášť, výchozí vypnuto). Živé
  odeslání e-mailu se zatím reálně neprokázalo (do 28.8.2026 nebyl
  žádný zápas v okně) — sleduje se přes vlastní hlášení chyb skriptu
  (GitHub issue při selhání). Podrobnosti a odůvodnění rozhodnutí
  (kanál, časování, souhrn, opt-in) viz nápad č. 4 v sekci
  "Naplánované další kroky".

### Výkon: proč byla appka pomalá a co s tím (28.8.2026)

Uživatel nahlásil dlouhé odezvy. Naměřeno přes `.github/workflows/perf-probe.yml`
(GitHub Actions, protože tenhle sandbox na Supabase/Vercel nedosáhne):

| co | rozehřátá Supabase | studená Supabase |
|---|---|---|
| ověření přihlášení (`/auth/v1/user`) | ~0,15 s | **až 3,6 s** |
| jeden dotaz do DB (`/rest/v1/...`) | ~0,38 s | až 1,9 s |
| vykreslení stránky na Vercelu (`/login`) | ~0,13–0,19 s | — |

**Appka sama rychlá je** — pomalé bylo čekání na databázi, a to hlavně ze
tří důvodů, které se násobily:

1. **Vercel běžel mimo Evropu, databáze je v Irsku.** Region Supabase
   (`eu-west-1`) potvrdil uživatel z dashboardu. Hlavní důkaz o vzdálenosti
   je naměřená latence: ~0,38–0,55 s na úplně triviální dotaz (na stejném
   kontinentu 30–50 ms), přičemž samotné navázání spojení trvá jen ~40 ms
   — čas se tedy tráví cestou k databázi, ne připojováním. Provoz putoval
   Česko → USA → Irsko → USA → Česko, a to u každého dotazu.

   **Pozor na měření regionu (chyba, na kterou jsme narazili 28.8.2026):**
   `x-vercel-id` u **statické** stránky (`/login`) ukazuje jen nejbližší
   CDN uzel, ne region serverových funkcí — mění se podle toho, odkud se
   ptáte (`iad1`, `cle1`, `sfo1`…). Region funkcí se pozná jen na
   **dynamické** route (v build outputu značená `ƒ`), kde má `x-vercel-id`
   dvě části: `<CDN uzel>::<region funkce>`. Po nasazení opravy vrací
   `/auth/callback` hodnotu `sfo1::dub1::…`, tedy funkce běží v Dublinu.
2. **Dotazy se dělaly ve vlnách za sebou.** Detail soutěže měl tři vlny
   (proxy ověří přihlášení → stránka se zeptá znovu + načte data →
   teprve pak tipy, protože potřebovaly ID zápasů z předchozí vlny).
   Uložení tipu mělo vln 5–6, proto působilo nejpomaleji.
3. **Ověření přihlášení šlo pokaždé po síti**, a to dvakrát na požadavek
   (jednou v `proxy.ts`, jednou ve stránce).

**Provedená opatření:**

- **`vercel.json` → `regions: ["dub1"]`** (Dublin = `eu-west-1`, stejné
  místo jako databáze). Zkracuje každý dotaz do DB a zároveň i cestu od
  českého uživatele k appce. Pozn.: bezplatný tarif Vercelu dovoluje
  právě jeden region, což tahle konfigurace splňuje.
- **`getClaims()` místo `getUser()`** v `src/lib/supabase/server.ts` i
  `src/lib/supabase/middleware.ts` — ověří podpis tokenu lokálně přes
  WebCrypto, bez síťového dotazu. Funguje jen u projektů s asymetrickými
  podpisovými klíči; ověřeno, že tenhle projekt je má (endpoint
  `/auth/v1/.well-known/jwks.json` vrací klíč **ES256**). U symetrického
  klíče by se knihovna sama vrátila k síťovému dotazu, takže je to
  bezpečné i do budoucna. **Není to `getSession()`** (kterému se věřit
  nesmí) — podpis se kryptograficky ověřuje a autorizace dat navíc pořád
  stojí na RLS.
- **Zrušená sekvenční vlna na tipy** na `/spaces`, `/spaces/[id]` a
  `/spaces/[id]/leaderboard`. Tipy se dřív filtrovaly seznamem ID zápasů
  z předchozí vlny; teď se filtrují přes napojenou tabulku
  (`matches!inner(competition_id)`), takže jdou v jedné vlně se zbytkem.
  Na `/spaces` tím odpadl i celý dotaz na zápasy — tip si informaci
  o soutěži nese s sebou.
- Server akce (`spaces/[id]/actions.ts`, `profil/actions.ts`) používají
  sdílený `getCurrentUser()` místo vlastního `auth.getUser()`.

**Vědomě neuděláno:** samostatná úloha na „udržování Supabase
rozehřáté" — `sync-results` už běží každých 30 minut a databáze se tím
udržuje v provozu sama.

## Naplánované další kroky

Logické pořadí (žádné z toho zatím nezačalo, pořadí je jen návrh —
**při navázání se nejdřív zeptej uživatele, čím pokračovat**, ať se
nevymýšlí za něj):

1. [x] Detail competition + seznam zápasů (matches) — `src/app/spaces/[id]/page.tsx`
2. [x] UI pro zadání tipu (predictions) + zamykání po výkopu —
   `src/app/spaces/[id]/{prediction-form.tsx,actions.ts}`, upsert na
   `(match_id, user_id)`, RLS/kickoff_at hlídá zámek
3. [x] Přepočet bodů po dohrání zápasu — DB trigger
   `matches_calculate_points` (`supabase/migrations/20260825100000_scoring_trigger.sql`),
   spouští se při ručním nastavení `status='finished'` + skóre v SQL
   editoru. Pravidla (odsouhlaseno): exact skóre = `points_exact`
   samostatně; jinak `points_winner` (správný výsledek/remíza) +
   `points_total_goals` (správný součet gólů) se sčítají nezávisle na
   sobě. `predicted_overtime_flag` se zatím nebodu­je. `/spaces/[id]`
   u dohraných zápasů ukazuje konečné skóre a získané body.
4. [x] Leaderboard / žebříček za competition —
   `src/app/spaces/[id]/leaderboard/page.tsx`, odkaz z detailu soutěže.
   Sečte `predictions.points` (`null` = zápas ještě nevyhodnocen, počítá
   se jako 0) po `user_id` napříč všemi zápasy dané competition, řadí
   sestupně podle bodů (při shodě abecedně podle jména). U každého hráče
   navíc ukazuje "X z Y zápasů vyhodnoceno". Žádná nová RLS politika
   nebyla potřeba — `predictions_select_own_or_locked` už povoluje číst
   cizí tipy, jakmile má zápas `status <> 'scheduled'` (a body existují
   jen u dohraných zápasů).
5. [x] Import **rozpisu** zápasů (hokej, fotbal) — hotovo, viz níže.
   [x] Import **výsledků** (`sync-results`) — implementováno, čeká na
   sloučení PR #26 do `main` a první ostré spuštění.

   **➡️ Podrobný návrh architektury je v
   [`docs/IMPORT-ARCHITECTURE.md`](./IMPORT-ARCHITECTURE.md)** —
   klouzavé okno místo "kol", dvě naplánované úlohy, odhad spotřeby
   requestů, potřebné změny datového modelu.

   **Sledované soutěže (odsouhlaseno 2026-08-25):** hokej = česká
   hokejová **Tipsport extraliga**, fotbal = česká **Chance Liga**.
   Tohle je důležité, protože dostupnost/cena API se dost liší podle
   toho, jde-li o velkou mezinárodní ligu, nebo lokální českou soutěž.

   **Přidána anglická Premier League (28.8.2026, na žádost uživatele).**
   Stejný postup jako u Chance Ligy: `scrape_path` ověřen přes
   `playwright-probe.yml` (`fotbal/anglie/premier-league`, 120 zápasů
   nalezeno na `/program/`, reálné anglické týmy — Crystal Palace,
   Manchester City, Liverpool, ...). Založeno přes `ensure-competition.yml`
   (název "Premier League", bez sezóny v názvu — stejná konvence jako
   "Chance Liga", na rozdíl od domácí "Hokejová extraliga 2026/27" nemá
   anglická liga potřebu ročníku v UI). `sync-fixtures` rovnou zapsal
   30 zápasů. `sync-results` ověřen na reálném datu — zpětně dotáhl
   10 už odehraných zápasů se skóre, čímž se zároveň poprvé reálně
   ověřilo (dřív jen teoreticky), že `sync-results` funguje i na
   soutěž přidanou uprostřed sezóny se scrapovacím zdrojem shodným s
   už fungujícími ligami. Žádná změna kódu ani nová migrace nebyla
   potřeba — appka je od začátku napsaná obecně pro libovolnou ligu na
   livesport.cz, jen se liší `scrape_path`. Appka teď automaticky
   (stejný denní/30minutový rozvrh jako u ostatních dvou soutěží)
   sleduje tři ligy: Hokejová extraliga 2026/27, Chance Liga, Premier
   League.

   **Průzkum API zdrojů (2026-08-25, nevybráno, k rozhodnutí s
   uživatelem):**
   - **TheSportsDB** — jediný nalezený zdroj, který pokrývá **obě**
     sledované soutěže najednou (fotbal Czech First League/Chance Liga
     `league id 4631`, hokej Czech Extraliga `league id 4923`).
     Zdarma testovací klíč: 30 req/min, ale max 10 výsledků na dotaz
     (spíš na vyzkoušení). Plná data + vyšší limit za $9/měsíc přes
     Patreon. → nejlevnější varianta na rozjezd, jedno API pro obě ligy.
   - **api-sports.io / API-Football** — zdarma 100 req/den (všechny
     endpointy dostupné, jen historické sezóny omezené), pak Pro
     19 $/měsíc (7 500 req/den), Ultra 29 $/měsíc (75 000 req/den).
     Funguje na modelu "všechny soutěže na všech tarifech", takže
     Chance Ligu pravděpodobně má, ale nepodařilo se to veřejně
     ověřit s jistotou. **Oprava (25.8.2026):** dřív tu stálo "pouze
     fotbal, žádný hokej" — to je **špatně**. api-sports.io je
     poskytovatel s 9+ sporty a má i samostatné **API-HOCKEY**.
     Bezplatný tarif je navíc 100 req/den **na každé API zvlášť**,
     takže fotbal i hokej lze provozovat zdarma vedle sebe (náš odhad
     spotřeby je ~22 req/den dohromady). Zbývá ověřit, jestli mají
     konkrétně Tipsport extraligu a Chance Ligu — vyžaduje to
     registraci a klíč, jejich web je za Cloudflare a nejde z něj
     číst dokumentaci automaticky (ověřeno probe workflow, HTTP 403).
   - **Sportmonks** — má dedikovanou stránku pro Fortuna/Chance Ligu
     (potvrzené pokrytí), ale nejlevnější tarif Starter je 29 €/měsíc
     a u levnějších tarifů si ligy vybíráš z omezeného počtu. Pouze
     fotbal, žádný hokej.
   - **Oficiální API Českého hokeje** (ceskyhokej.cz/data-pro-kluby) —
     pravděpodobně nejspolehlivější/nejautentičtější zdroj pro
     extraligu, ale není samoobslužné (cena "podle objemu dat", nutno
     kontaktovat konkrétně Adama Josku e-mailem/telefonicky), data se
     načítají několikrát denně, ne živě. Pouze hokej.

   **SportAPI7 (RapidAPI, navrženo uživatelem 25.8.2026) — ověřeno a
   zamítnuto.** Reálná data fungují (potvrzeno dotazem, viz
   `IMPORT-ARCHITECTURE.md`), ale bezplatný plán má kvótu jen **50
   požadavků za měsíc celkem** — o dva řády míň, než appka potřebuje
   (samotný denní import rozpisu by ji vyčerpal sám). Nemá tedy smysl
   dál ověřovat pokrytí lig u tohohle zdroje.

   **Můj (Claude) doporučený výchozí bod byl:** TheSportsDB, protože
   pokrývá obě ligy jedním API a je nejlevnější na rozjezd.

   **Rozhodnuto jinak (26.8.2026):** uživatel se místo placeného API
   rozhodl pro **scraping livesport.cz přes Playwright** — mj. i jako
   záměrný projekt na naučení se scrapingu. Implementováno v
   `scripts/sync/` (`sync-fixtures.mjs` hotovo, `sync-results` teprve
   plánováno), spouští `.github/workflows/sync-fixtures.yml`. Detaily
   a ověřené `scrape_path` hodnoty pro obě ligy jsou v
   [`docs/IMPORT-ARCHITECTURE.md`](./IMPORT-ARCHITECTURE.md) v sekci
   "Aktuálně implementováno: scraping z livesport.cz".

   **[x] `sync-fixtures` běží ostře a zapisuje zápasy (27.8.2026).**
   Uživatel spustil migrace a nastavil `SUPABASE_SERVICE_ROLE_KEY`/
   `SUPABASE_URL` jako GitHub secrets. První ostré běhy postupně
   odhalily a opravily tři reálné bugy (všechny zdokumentované výše u
   RLS/datového modelu i v `IMPORT-ARCHITECTURE.md`): chybějící GRANT
   pro `service_role`, částečný index nekompatibilní s `ON CONFLICT`,
   a **časový posun o 4 hodiny** — livesport.cz zobrazuje čas výkopu
   podle časového pásma prohlížeče (auto-detekce), ne napevno podle
   Prahy; scraper běžící na GitHub Actions (UTC) tak sbíral čas už
   lokalizovaný do UTC, který se pak mylně převáděl podruhé, jako by
   šlo o pražský čas (-2h), a appka ho navíc zobrazovala bez explicitní
   časové zóny podle prostředí serveru (další -2h). Opraveno nastavením
   `timezoneId: "Europe/Prague"` u Playwright stránky
   (`scripts/sync/lib/scrape-livesport.mjs`) a explicitním
   `timeZone: "Europe/Prague"` při zobrazení
   (`src/app/(app)/spaces/[id]/page.tsx`). Po opravě ověřeno reálným
   během — 7 zápasů hokejové extraligy zapsáno se správným časem.

   **Odstraněno jako nepoužívaná slepá cesta (27.8.2026):** mechanismus
   pro volání placených sportovních API (`API_SPORTS_KEY`/`RAPIDAPI_KEY`
   hlavičky) v `.github/workflows/api-probe.yml` — appka nakonec API
   nepoužívá. Workflow zůstává jako obecný nástroj "zavolej URL a
   vypiš odpověď" (pořád užitečný, viz sekce "Síťové omezení" v
   `CLAUDE.md`), jen bez API-klíčové části. **Zbývá ruční krok
   uživatele**: smazat GitHub secrets `RAPIDAPI_KEY` a `API_SPORTS_KEY`
   a zrušit/odvolat samotné klíče u RapidAPI a api-sports.io (přesné
   kroky viz odpověď v chatu z 27.8.2026).

   **[x] Fotbalová Chance Liga — založena a naimportována (27.8.2026).**
   Competition pro ni v appce dosud neexistovala (dřív se zakládaly jen
   ručně přes SQL editor). Místo dalšího ručního kroku pro uživatele
   přidán `scripts/sync/ensure-competition.mjs` +
   `.github/workflows/ensure-competition.yml` — idempotentně
   založí/aktualizuje competition podle name+sport se service role
   klíčem (PR #23). První ostrý běh narazil na stejnou třídu chyby jako
   dřív `matches` (viz "Grants" výše): `permission denied for table
   competitions`, protože `service_role` měla na `competitions` jen
   `select`. Opraveno migrací
   `supabase/migrations/20260827110000_competitions_service_role_insert_grant.sql`
   (PR #24, spuštěno uživatelem ručně v Supabase SQL editoru). Po
   opravě: `ensure-competition` založil "Chance Liga" (`sport=football`,
   `scrape_source=livesport`, `scrape_path=fotbal/cesko/chance-liga`) a
   `sync-fixtures` pro ni rovnou zapsal **28 zápasů** (zároveň
   aktualizoval i 7 zápasů hokejové extraligy). Appka tak teď sleduje
   obě ligy z `docs/PROJECT.md` sekce "Sledované soutěže".

   **[x] `sync-results` implementováno (27.8.2026, PR #26).** Druhá
   plánovaná úloha z `docs/IMPORT-ARCHITECTURE.md` — `scripts/sync/results.mjs`
   + `.github/workflows/sync-results.yml` (zatím jen ruční spuštění,
   stejně jako `sync-fixtures.yml`). Pro každou competition se nejdřív
   zeptá vlastní databáze, jestli je vůbec potřeba otevírat prohlížeč —
   buď (a) existuje zápas s `kickoff_at` v minulosti a `status <>
   'finished'`, nebo (b) competition v databázi nemá žádný zápas vůbec.
   Pokud ani jedno neplatí, přeskočí ji bez otevření prohlížeče. Pokud
   ano, stáhne stránku `.../vysledky/` na livesport.cz
   (`scrapeLivesportResults` ve `scrape-livesport.mjs`, sdílí extrakční
   jádro s rozpisem) a zapíše VŠECHNY nalezené zápasy se skóre — jak
   update už existujících (podle `external_id`), tak insert úplně
   nových řádků. Zápasy dostanou `status='finished'` — body si u
   existujících zápasů samo dopočítá trigger `matches_calculate_points`
   (běží jen na UPDATE; nově vloženému zápasu nevadí, že mu neběží,
   protože nemohl mít žádný tip k obodování).

   **Opraveno po prvním ostrém běhu (27.8.2026): chybějící zápasy z
   minulého týdne.** Hned první ruční spuštění `sync-results` po PR #26
   ukázalo `0 požadavků` u obou soutěží — u hokeje čekaně (sezóna ještě
   nezačala), u Chance Ligy ale nečekaně, protože zápasy z 22.–23. 8.
   už byly dohrané. Příčina: `ensure-competition`/`sync-fixtures` pro
   Chance Ligu poprvé proběhly až 27.8. a `sync-fixtures` stahuje jen
   okno `[dnes-1, dnes+21]` — zápasy odehrané před tímhle datem se do
   databáze vůbec nedostaly, takže `sync-results` (který páruje jen
   podle `external_id` už existujících řádků) je neměl jak najít.
   Oprava: `sync-results` teď umí i **zpětně dotáhnout** zápasy, které
   v databázi ještě vůbec nejsou (viz odstavec výše, bod b) — týká se
   každé nové soutěže přidané uprostřed sezóny, ne jen tohohle
   jednorázového případu. Kvůli tomu teď validace (`validate-results.mjs`)
   navíc vyžaduje platné `kickoff_at` (dřív ne) — nový řádek bez něj by
   spadl na NOT NULL constraint v databázi.

   **Druhá chyba ve stejné opravě, nalezená hned při prvním ostrém běhu
   PR #27 (27.8.2026):** podmínka "zkus zpětně dotáhnout" kontrolovala
   "nemá competition v DB žádný zápas VŮBEC" — ale Chance Liga už 28
   zápasů měla (nadcházející, z denního `sync-fixtures`), jen žádný
   z nich nebyl ten starý dohraný. Podmínka se tak nikdy nespustila a
   log znovu ukázal `0 požadavků`. Opraveno na správný signál: "nemá
   competition v DB žádný **dohraný** zápas" (`finishedCount === 0`
   místo `existing.length === 0`) — u nové soutěže se čekajícími
   zápasy z rozpisu, ale bez jediného dohraného, se tak zpětné dotažení
   spustí správně.

   **Ověřeno přes probe workflow (27.8.2026):** struktura stránky
   `/vysledky/` je shodná s `/program/` (stejné selektory) — ověřeno na
   Chance Lize, 36 dohraných zápasů se skóre. Hokejová extraliga
   2026/27 v době psaní ještě nezačala hrát (start 16.9.2026), stránka
   vrátila 0 zápasů — čekané, ne chyba.

   **Vědomě zatím chybí:** `overtime_flag` (prodloužení/nájezdy u
   hokeje) se nezapisuje — livesport.cz způsob označení není ověřený na
   reálných datech (žádný odehraný hokejový zápas zatím neexistuje).
   Doplní se, až se objeví první reálný dohraný zápas v prodloužení.
   Odložené/zrušené zápasy zůstávají stejně neřešené jako u
   `sync-fixtures` (viz otevřená otázka v `IMPORT-ARCHITECTURE.md`).

   **Optimalizace: cachování Playwright/Chromia (27.8.2026).** Každý
   běh `sync-fixtures`/`sync-results` dřív stahoval ~300 MB Chromia od
   nuly (GitHub Actions runner je pokaždé úplně čerstvý stroj bez
   ničeho nainstalovaného) — všimnul si toho uživatel při prvním ostrém
   běhu (job trval 67 s, z toho ~50 s instalace). Přidán `actions/cache`
   na `~/.cache/ms-playwright` (klíčovaný podle `package-lock.json`) +
   `cache: npm` u `setup-node` — Playwright sám přeskočí stažení
   prohlížeče, když ho v cache najde, `npm install` využije keš balíčků.
   Nic to nestojí navíc (repo je veřejné → GitHub Actions minuty
   neomezené zdarma), jde jen o rychlost běhu.

   **[x] Automatický rozvrh (27.8.2026).** Po několika úspěšných
   ručních bězích (import rozpisu, zpětné dotažení výsledků, oprava
   dvou bugů popsaných výše) přidán `schedule:` do obou workflow —
   appka teď zápasy/výsledky doplňuje sama, bez ručního spouštění:
   - `sync-fixtures`: 1×/den v 04:00 UTC.
   - `sync-results`: každých 30 minut, **celý den** (ne jen večer, jak
     navrhoval původní `IMPORT-ARCHITECTURE.md` z doby placeného API) —
     u scrapingu není důvod okno omezovat (nic to nestojí) a
     `results.mjs` se stejně nejdřív zeptá zdarma vlastní databáze, takže
     běh mimo zápasové hodiny skončí za pár vteřin bez prohlížeče. Řeší
     to i víkendová odpoledne a zápasy končící po půlnoci bez nutnosti
     ručně přeposouvat cron kvůli letnímu/zimnímu času (GitHub Actions
     cron běží vždy v UTC).
   - `workflow_dispatch` (ruční spuštění) zůstává u obou zachované pro
     ladění.

6. [x] Loga lig — zobrazit logo soutěže (competition) na `/spaces` a
   v jejím detailu.
7. [x] Loga týmů u zápasů.

   **Kroky 6+7 hotové dohromady (27.8.2026), zdroj lfafotbal.cz.**
   Uživatel našel oficiální zdroj log s vektorovými PDF/AI soubory
   (`https://www.lfafotbal.cz/dokumenty?search=&id_category=8`) —
   ověřeno jako reálně stažitelné ZIPy přes `api-probe.yml`/
   `db-probe.yml` (GitHub Actions, protože tenhle sandbox nemá přístup
   na cizí domény, viz "Síťové omezení" v `CLAUDE.md`).

   **Architektura (rozhodnutí z otevřených otázek výše):**
   - Skutečné PNG soubory žijí ve **Supabase Storage** (nový veřejný
     bucket `logos`), appka je jen odkazuje přes URL sloupec —
     kombinace obou variant zvažovaných u kroku 6, ne buď/anebo.
   - Loga týmů řešena jako **samostatná mapovací tabulka** `team_logos`
     (`competition_id, team_name, logo_url`) — varianta (b) z otevřené
     otázky u kroku 7, **bez** zásahu do `matches.home_team`/`away_team`
     (ty zůstávají prostý text, jak je scrapuje `sync-fixtures`).
     Migrace: `supabase/migrations/20260827150000_team_logos.sql`.

   **Import:** `scripts/sync/import-logos.mjs` +
   `.github/workflows/import-logos.yml` (jednorázový, ruční spuštění,
   žádný schedule — loga se nemění denně). Stáhne ZIP loga ligy
   (`/dokument/647-logo-chance-liga`) a ZIP log klubů
   (`/dokument/725-loga-klubu-chance-ligy-2026-2027`), PDF loga klubů
   převede na oříznuté PNG (`pdftoppm` + ImageMagick `-trim`), nahraje
   do Storage a zapíše `competitions.logo_url`/`team_logos`. Mapování
   zkratka→tým (PLZ, HKR, ZBR...) ověřeno proti skutečným hodnotám
   `matches.home_team`/`away_team` přes `db-probe.yml`, ne uhodnuté —
   16 klubů, 16 zkratek, jednoznačná shoda.

   **První ostrý běh (27.8.2026):** spadl na `ENOENT` — `downloadZip()`
   zapisoval do podadresáře, který nikdy nevznikl (`mkdtempSync`
   vytvoří jen kořenový dočasný adresář, ne jeho potomky). Opraveno
   přidáním `mkdirSync(destDir, {recursive:true})`. Po opravě proběhl
   import úspěšně na první pokus — logo ligy i všech 16 klubů uloženo,
   ověřeno i zpětně dotazem do databáze.

   UI: logo soutěže na `/spaces` (u každé karty) a v hlavičce detailu
   soutěže; loga týmů u zápasů v detailu soutěže
   (`src/app/(app)/spaces/[id]/page.tsx`) a na stránce detailu zápasu.
   Logo se vykresluje na bílém "chipu" (`bg-white p-*`), aby bylo
   čitelné i v dark módu bez ohledu na barvu loga.
8. [x] Barevné odlišení kartičky zápasu podle skóre. **Rozhodnuto
   s uživatelem 28.8.2026 přes `AskUserQuestion`:** barva ukazuje
   úspěšnost VLASTNÍHO tipu uživatele, ne výsledek zápasu samotného —
   🟢 zelená = přesně trefené skóre, 🟡 žlutá = trefený výherce/remíza
   NEBO součet gólů (ne nutně obojí), ⚪ šedá = netrefeno nic. Platí
   jen pro dohrané zápasy, kde má hráč vlastní tip.
   `getResultTone()` v `src/app/(app)/spaces/[id]/page.tsx` — logika
   kopíruje pravidla z `calculate_match_points()`
   (`supabase/migrations/20260825100000_scoring_trigger.sql`), ale
   počítá se přímo z predikovaného/skutečného skóre, ne z uložených
   bodů, aby fungovalo správně bez ohledu na per-competition
   nastavení bodování. Beze změny datového modelu.
9. [x] Rozdělení zápasů v detailu soutěže do sekcí "Nadcházející" a
   "Proběhlé" — `src/app/spaces/[id]/page.tsx`. Zápas patří do
   "Proběhlé", jakmile je zamčený (stejná podmínka jako dřívější
   `isLocked`: `status <> 'scheduled'` nebo `kickoff_at` v minulosti),
   jinak do "Nadcházející". "Nadcházející" řazeno vzestupně (nejbližší
   nahoře), "Proběhlé" sestupně (nejnovější výsledek nahoře). Sekce se
   zobrazí jen když v ní jsou nějaké zápasy.
10. [x] Vlastní přezdívka — `src/app/(app)/profil/{page.tsx,nickname-form.tsx,actions.ts}`.
    Upravuje `profiles.display_name` přes existující RLS politiku
    `profiles_update_own` (žádná nová migrace nebyla potřeba).
11. [x] Sdílená hlavička appky — `src/components/app-header.tsx` +
    `src/app/(app)/layout.tsx`. Autentizované stránky (`/spaces`,
    detail soutěže, leaderboard, `/profil`) přesunuty pod route group
    `(app)` (nemění URL, jen sdílí layout). Hlavička: vlevo odkaz
    "Drew" na `/spaces`, vpravo fotečka uživatele (`profiles.avatar_url`
    z Google OAuth, s iniciálou jako fallback) vedoucí na `/profil` +
    "Odhlásit se". Jednotlivé stránky teď mají v hlavičce jen svůj
    vlastní obsah (název, zpětný odkaz), duplicitní odkaz na profil a
    odhlášení se ze `/spaces` odstranily.
12. [x] Skutečné "přihlášení" (členství) do competition — navazuje na
    krok 11. Nová tabulka `competition_participants`
    (`supabase/migrations/20260826200000_competition_participants.sql`):
    `(competition_id, user_id, joined_at)`, RLS: kdokoliv přihlášený
    vidí všechny řádky (`select`), insert/delete jen svůj vlastní
    (samoobslužné přihlášení/odhlášení). Migrace navíc **zpětně
    doplní** participanty ze stávajících `predictions` (kdo už dřív
    tipoval, evidentně tu soutěž hraje), ať nikomu nezmizí z
    leaderboardu.

    **Odsouhlaseno s uživatelem (2026-08-26, přes `AskUserQuestion`):**
    přihlášení do soutěže je **podmínkou** pro první tip — ne jen
    volitelný "opt-in" pro zobrazení v leaderboardu. Vynuceno na
    úrovni DB, ne jen v UI: politika `predictions_insert_own_before_kickoff`
    teď navíc vyžaduje `exists` řádek v `competition_participants` pro
    daného uživatele a competition zápasu.

    UI (`src/app/(app)/spaces/[id]/page.tsx`): v hlavičce detailu
    soutěže je vidět počet přihlášených hráčů a tlačítko "Chci hrát" /
    "Opustit soutěž" (`joinCompetition`/`leaveCompetition` server
    akce v `actions.ts`, upsert-style insert s no-op na duplicitu).
    Dokud uživatel není přihlášený, `MatchCard` u nezamčených zápasů
    místo `PredictionForm` ukáže hint, ať se nejdřív přihlásí.

    `leaderboard/page.tsx` teď staví žebříček primárně z
    `competition_participants` (každý přihlášený se zobrazí, i s 0
    body/tipy) a `predictions` jen doplňuje body/počet tipů nad tímhle
    základem — dřív se žebříček stavěl jen z `predictions`, takže
    přihlášený hráč bez tipu by se vůbec nezobrazil.
13. [x] Medaile/odznaky za vítězství týdne. **Rozhodnutí s uživatelem
    (27.8.2026, přes `AskUserQuestion`):**
    - **Perioda**: kalendářní týden (pondělí 00:00 – neděle 23:59,
      pražský čas) — ne herní "kolo", protože appka kola záměrně
      neeviduje (viz `IMPORT-ARCHITECTURE.md`).
    - **Odměna**: jen vizuální odznak (🏅 + počet) u jména na
      žebříčku — žádný číselný rank/level (zatím).
    - **Remízy**: medaili dostanou všichni na první příčce daného
      týdne, žádný tie-break.
    - **Rozsah**: zvlášť za každou competition (ne napříč sporty).
    - **Nulový týden**: pokud se v týdnu neodehrál žádný zápas nebo
      nikdo nezískal žádné body, medaile se neuděluje (žádný "vítěz s
      0 body").
    - **Zobrazení**: zatím jen na žebříčku soutěže — profil hráče
      (bod 3 v seznamu nápadů níže) zatím neexistuje jako stránka.

    Nová tabulka `weekly_badges` (`competition_id, week_start,
    user_id, points`, `supabase/migrations/20260827130000_weekly_badges.sql`)
    — `week_start` a `user_id` jsou součástí primárního klíče (ne jen
    `user_id`), aby šlo uložit víc "vítězů" týdne při remíze. Grants
    pro `authenticated` (select) i `service_role` (select+insert) rovnou
    v migraci, aby se nemuselo (potřetí) čekat na "permission denied"
    při prvním ostrém běhu.

    Vyhodnocuje `scripts/sync/award-weekly-badges.mjs` +
    `.github/workflows/award-weekly-badges.yml` (pondělí 05:00 UTC,
    žádný Playwright/prohlížeč potřeba — jen čte/zapisuje Supabase).
    Hranice "předchozího úplného týdne" počítá čistá funkce
    `lib/week-range.mjs` (otestováno včetně letního/zimního času,
    sdílí `pragueWallTimeToUtcIso` se `scrape-livesport.mjs`) — funguje
    správně i při ručním spuštění uprostřed týdne (vždy vyhodnotí
    poslední ÚPLNĚ dokončený týden, nikdy rozpracovaný aktuální).
    Idempotentní: pokud pro danou competition a týden už medaile
    existují, přeskočí se (bezpečné při opakovaném/ručním spuštění).

    **Opraveno po prvním ostrém běhu (27.8.2026), dvě chyby najednou:**
    1. `permission denied for table predictions` — `service_role`
       neměla `select` na `predictions` (čtvrtý výskyt stejné třídy
       chyby jako u `matches`/`competitions`, viz "Grants" výše).
       Opraveno `20260827140000_predictions_service_role_select_grant.sql`.
    2. GitHub label `award-weekly-badges:<uuid>` má 56 znaků, GitHub
       limit je 50 — založení Issue s takovým štítkem tvrdě selhalo,
       což přebilo i hlášení té první (skutečné) chyby a log pak
       vypadal zmateně. Zkráceno na `weekly-badges:<uuid>` (přesně 50
       znaků, stejně jako u `sync-fixtures`).
14. [x] Detail zápasu se seznamem tipů všech hráčů —
    `src/app/(app)/spaces/[id]/matches/[matchId]/page.tsx`. Kartičky
    zápasů v detailu soutěže teď na tuhle stránku vedou (proklik na
    název + čas zápasu). **Tipy ostatních hráčů se ukážou až po
    výkopu zápasu** — do té doby vidí uživatel jen svůj vlastní tip
    (formulář na zadání/úpravu, stejný jako dřív na detailu soutěže) +
    poznámku, že se ostatní odemknou po výkopu. Vynuceno stejně jako
    jinde v appce na úrovni databáze politikou
    `predictions_select_own_or_locked` — před výkopem dotaz na cizí
    tipy prostě nic nevrátí, tahle stránka jen poprvé zobrazí data,
    která appka už uměla bezpečně přečíst.

    Po výkopu: seznam všech přihlášených hráčů soutěže (ne jen těch,
    co tipovali), seřazený podle bodů získaných za tenhle konkrétní
    zápas sestupně (při shodě abecedně podle jména) — hráč bez tipu
    se zobrazí s poznámkou „bez tipu“. Rozsah (i bez tipu) a řazení
    (podle bodů, ne abecedně) odsouhlaseno s uživatelem 27.8.2026 přes
    `AskUserQuestion`, stejný vzor jako u leaderboardu (krok 4), který
    taky staví ze všech participantů, ne jen z `predictions`.

Původně navrženo 2026-08-25 jako herní prvek navíc k celkovému
žebříčku. Otevřené otázky (perioda, co hráč dostane, řešení remíz,
rozsah) probrány s uživatelem 27.8.2026 přes `AskUserQuestion` —
rozhodnutí a implementace viz krok 13.
15. [x] Rozdělení "Nadcházející" na "Ještě netipováno"/"Už tipnuto" —
    `src/app/(app)/spaces/[id]/page.tsx` (28.8.2026, na žádost
    uživatele). Původně pevný limit 8 zápasů mísil dohromady tipnuté i
    netipnuté zápasy — u anglické Premier League (běžně 10 zápasů za
    víkend, oproti 8 u české ligy) se tak mohl netipnutý zápas
    "vytlačit" mimo výchozí zobrazení za tipnuté starší. Řešení
    (odsouhlaseno přes `AskUserQuestion`): "Ještě netipováno" ukazuje
    VŽDY úplně všechny zápasy bez tipu, bez limitu — jakmile hráč zadá
    tip, zápas se sám přesune do sbalené sekce "Už tipnuto" (limit 5,
    stejný vzor jako "Proběhlé"). Řeší to obecně libovolný počet
    zápasů v kole u libovolné budoucí ligy, ne jen tenhle konkrétní
    případ. Když má hráč vyplněné úplně všechny nadcházející zápasy,
    zobrazí se místo prázdné sekce potvrzující hláška "✅ Máš vyplněné
    tipy na všechny nadcházející zápasy."

### Nápady: participanti soutěže, vlastní přezdívka, profil uživatele, upozornění na nevyplněný den (2026-08-25, nerozpracováno)

Čtyři související nápady od uživatele, zatím jen zapsané k budoucímu
rozboru, nic z toho se neimplementuje:

**1) Seznam uživatelů, kteří tipují danou soutěž** — "pool" hráčů
viditelný třeba v detailu soutěže. Pozor: appka dnes nemá žádný
koncept "přihlášení/členství" do competition — kdokoliv přihlášený
může tipovat na jakoukoliv soutěž (viz RLS rozhodnutí výše). Než se to
začne stavět, je potřeba rozhodnout, jestli "pool" znamená (a) prostě
všichni, kdo už v té soutěži alespoň jednou tipovali (dá se odvodit ze
stávajících dat stejně jako leaderboard), nebo (b) zavádíme skutečné
"členství" v soutěži (kdo se do ní explicitně přihlásil) — to by byla
větší změna datového modelu.

**Rozhodnuto směrem (b) — ✅ hotovo (2026-08-26), viz krok 12 v plánu
výše.**

**2) Vlastní přezdívka — ✅ hotovo (2026-08-26), viz krok 10 v plánu
výše.**

**3) Detail/profil uživatele — ✅ hotovo (28.8.2026).**
`src/app/(app)/profil/[userId]/page.tsx`. Rozhodnuto s uživatelem přes
`AskUserQuestion`:
- **Veřejný** — kdokoliv přihlášený si může prokliknout cizí profil
  (ze žebříčku, z detailu zápasu). Konzistentní s tím, jak appka
  funguje už dnes (cizí tipy se taky zveřejní po výkopu). Beze změny
  RLS — `profiles`/`competition_participants`/`weekly_badges` už byly
  čitelné pro kohokoliv přihlášeného.
- **Seznam soutěží + statistiky** — u každé soutěže, kterou hráč hraje:
  pozice v žebříčku (X. místo z Y), celkové body, kolik zápasů je
  vyhodnoceno, počet přesných tipů, počet medailí za vítězství týdne.
  Stejný výpočet jako na `/spaces/[id]/leaderboard`, jen scoped na
  jednoho hráče napříč všemi jeho soutěžemi.

Odkazy na `/profil/[userId]` přidány ze žebříčku (celkový i týdenní),
z detailu zápasu (seznam tipů všech hráčů) a z `/profil` (vlastní
nastavení má nově odkaz "Zobrazit veřejný profil →"). Původní `/profil`
zůstává beze změny — soukromá stránka na úpravu přezdívky.

**4) Upozornění na nevyplněný den — implementováno (28.8.2026), čeká na
ruční dokončení uživatelem.** Rozhodnuto s uživatelem přes chat +
`AskUserQuestion`:
- **Kanál**: e-mail.
- **Časování**: 2 hodiny před PRVNÍM zápasem dne, na který hráč ještě
  nemá tip — napříč VŠEMI soutěžemi, které hraje (ne fixní čas jako
  9:00, uživatel to explicitně upřesnil coby oprava mého původního
  návrhu).
- **Souhrn**: i při víc chybějících tipech napříč soutěžemi jen JEDEN
  e-mail za den, ne jeden per zápas/soutěž.
- **Zapínání (doplněno 28.8.2026, na žádost uživatele)**: opt-in
  tlačítkem **"🔔 Chci upozornit"** přímo na stránce soutěže (vedle
  "Chci hrát"/"Opustit soutěž"), ne globálně v `/profil` — a **za
  každou soutěž zvlášť**, ne jedním přepínačem pro celou appku. Nový
  participant má upozornění ve výchozím stavu **vypnuté** — appka
  nikomu nic nepošle, dokud si o to sám neřekne.

**Technická volba e-mailové služby (moje, vysvětleno v chatu):**
zvažován Resend (moje původní představa), ale webovým vyhledáváním
28.8.2026 ověřeno, že bez vlastní ověřené domény (DNS záznamy) umí
poslat jen zpátky na účet, kterým se u něj appka zaregistrovala — ne
kamarádům. Místo placené služby a vlastní domény appka posílá přes
**Gmail SMTP** z uživatelova vlastního účtu (`nodemailer`, ověřeno
webovým vyhledáváním: osobní Gmail zvládne 500 e-mailů/den, na
appku s hrstkou hráčů bohatě stačí). Vyžaduje jen "heslo pro aplikace"
vygenerované v Google účtu (2FA musí být zapnuté), žádná doména,
žádný nový placený účet.

**Poznámka pro budoucnost (uživatel 28.8.2026):** vlastní doména a
hosting se plánují, ale zatím neurčeno kdy. Až budou, stojí za to
zvážit přechod z Gmail SMTP zpátky na pořádnou e-mailovou službu
(např. Resend s ověřenou doménou) — spolehlivější doručování,
neposílá se pod osobní adresou uživatele. Není potřeba řešit teď.

**Implementace:**
- `supabase/migrations/20260828150000_prediction_reminders_sent.sql` —
  nová tabulka `prediction_reminders_sent` (user_id, reminder_date),
  čistě interní evidence "komu už dnes bylo posláno", žádná policy pro
  `authenticated` (appka ji nikde nezobrazuje).
- `supabase/migrations/20260828160000_competition_participants_service_role_select_grant.sql`
  — `service_role` dosud nemělo SELECT na `competition_participants`
  (šestý výskyt stejné třídy chyby jako u matches/competitions/
  predictions/weekly_badges, viz "Grants" výše) — doplněno rovnou
  předem, ne až po prvním pádu ostrého běhu.
- `scripts/sync/lib/reminder-logic.mjs` — čistá, otestovaná logika
  (`computeMissingByUser`, `shouldSendNow`, `buildReminderEmail`),
  žádné I/O. `scripts/sync/lib/week-range.mjs` doplněn o `getTodayRange`
  (hranice dnešního pražského kalendářního dne, stejný Intl trik jako
  `getPreviousWeekRange`).
- `scripts/sync/predict-reminders.mjs` — orchestrace: načte
  participanty/zápasy dneška/tipy/evidenci odeslaného, spočítá komu a
  co chybí, e-mail adresu dohledá přes Supabase Admin API
  (`auth.admin.listUsers` — appka e-maily nikde v `profiles`
  neukládá), pošle a zapíše do evidence.
- `.github/workflows/predict-reminders.yml` — **zatím jen
  `workflow_dispatch`** (ruční spuštění), stejná opatrná konvence jako
  dřív u `sync-fixtures`/`sync-results`: hodinový `schedule` se přidá
  až po ověřeném ručním běhu s reálnými přihlašovacími údaji.
- `supabase/migrations/20260828170000_competition_participants_email_reminders.sql`
  — nový sloupec `competition_participants.email_reminders_enabled`
  (`boolean`, výchozí `false`) + `update` policy/grant pro
  `authenticated` (dosud šlo jen insert/delete, na přepínač je
  potřeba update vlastního řádku). `predict-reminders.mjs` teď při
  čtení participantů rovnou filtruje `.eq("email_reminders_enabled",
  true)` — zápasy z nezapnutých soutěží se do souhrnného e-mailu vůbec
  nedostanou, žádná změna nebyla potřeba v `computeMissingByUser`.
- `src/app/(app)/spaces/[id]/actions.ts` (`setEmailReminders`) +
  `src/app/(app)/spaces/[id]/page.tsx` — tlačítko "🔔 Chci upozornit" /
  "🔕 Nechci upozornit" v hlavičce detailu soutěže, viditelné jen když
  je hráč v soutěži přihlášený (stejná podmínka jako u
  "Opustit soutěž").

**Ruční kroky uživatele (28.8.2026, hotovo):**
1. Zapnuté dvoufázové ověření v Google účtu a vygenerované "Heslo pro
   aplikace" (**myaccount.google.com/apppasswords**).
2. GitHub secrets `GMAIL_USER`/`GMAIL_APP_PASSWORD` nastavené.
3. Všechny migrace z PR #57–#59 spuštěné v Supabase SQL editoru
   (`prediction_reminders_sent`, grant na `competition_participants`,
   `email_reminders_enabled`).

Zbývá jen uživatelsky: na stránce každé soutěže, kterou chce sledovat,
kliknout na "🔔 Chci upozornit" — bez toho appka nikomu nic nepošle
(opt-in, viz rozhodnutí výše).

**Rozhodnutí zapnout `schedule` bez živého ověření odeslání (28.8.2026,
moje, vysvětleno v chatu):** ruční běh po nastavení proběhl bez chyby
(Supabase i kód v pořádku), ale nikomu nic neposlal — do 28.8.2026
nebyl žádný sledovaný zápas v okně 2 hodiny před výkopem (ověřeno přes
`db-probe.yml`, nejbližší byl až 29.8. odpoledne), takže se samotné
odeslání přes Gmail ještě reálně neprokázalo. Místo čekání na první
skutečný zápas jsem hodinový `schedule` zapnul rovnou — skript má
vlastní hlášení chyb (`reportFailure` založí GitHub issue, pokud
odeslání selže), takže případný problém se zjistí sám, ne tichým
selháním.

**První ostrý běh (28.8.2026) skutečně spadl, ale ne na Gmailu —
sedmý výskyt stejné třídy chyby jako u matches/competitions/
predictions/weekly_badges (viz "Grants" výše):**
`permission denied for table competition_participants`. Migrace
`20260828160000_competition_participants_service_role_select_grant.sql`
existovala v repu od začátku PR #57, ale migrace se v tomhle projektu
neaplikují automaticky — čekají na ruční spuštění uživatelem v
Supabase SQL editoru (**supabase.com/dashboard/project/rvcxdlmwxdykkxpqegzr**
→ SQL Editor), stejně jako všechny předchozí. Tenhle konkrétní krok
předtím chyběl v seznamu ručních kroků výše — doplněno teď, ať se
příště nezapomene: **před ručním spuštěním `predict-reminders.yml`
je vždy potřeba mít v Supabase aplikované všechny migrace z téhle PR**,
ne jen ty dvě z kroků 1–3.

**Druhý pokus spadl na stejné příčině, jen jinou tabulkou:** po
doplnění grantu chybělo ještě `create table
prediction_reminders_sent` samotné (`20260828150000_..._sent.sql`) —
instrukce v chatu 28.8.2026 uživateli omylem řekla spustit jen ten
jeden grant, ne obě dvě migrace z PR #57 najednou. Poučení stejné jako
výše: dát uživateli rovnou VŠECHNY nespuštěné migrace naráz, ne po
jedné podle toho, na co appka zrovna narazí.

**Zapínání upozornění po soutěžích (28.8.2026):** po dvou opravených
migracích výše přibyla ještě jedna
(`20260828170000_competition_participants_email_reminders.sql`, viz
"Implementace" výše) — než půjde `predict-reminders.yml` znovu
zkoušet, musí být aplikovaná v Supabase i tahle.

### Budoucí featury mimo současný rozsah (model na ně má místo, ale nestavíme)

Ze zadání explicitně odloženo, dokud si je uživatel nevyžádá:
- bonusové otázky ke dni
- skupiny/týmy uvnitř competition s vlastní tabulkou
- grace perioda na pozdní tip
- self-service zakládání competitions/matches běžnými uživateli (teď
  jen service role / SQL editor, viz RLS rozhodnutí výše)

## Jak navázat (pro budoucí Claude Code session)

```bash
pnpm install
cp .env.local.example .env.local   # doplnit skutečné hodnoty, viz sekce výše
pnpm dev
```

Migrace se aplikují ručně přes Supabase SQL editor (soubory v
`supabase/migrations/`, v pořadí podle názvu/timestampu). Repo nemá
`supabase link` — CLI přístup by vyžadoval access token nebo DB heslo,
které Claude Code session nemá.

**Síťové omezení tohoto prostředí**: sandbox, ve kterém Claude Code
běží, blokuje odchozí přístup na externí API mimo pár povolených domén
(GitHub, npm, Supabase REST API ze server-side kódu ano; Vercel API,
Google, obecný internet z prohlížeče/Playwrightu ne). Proto nejde
nasazovat na Vercel ani ověřovat OAuth flow end-to-end automaticky —
tyhle kroky vždy provede uživatel ručně ve svém prohlížeči podle
instrukcí v chatu.
