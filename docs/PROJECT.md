# Klopi — kontext projektu

Živý dokument. Aktualizuje se po každé větší funkci nebo rozhodnutí, ať
kdokoliv (včetně budoucí Claude Code session) může kdykoliv navázat bez
ztráty kontextu. Viz `CLAUDE.md` pro trvalá pravidla, jak s tímto
repozitářem pracovat.

## Co to je

Tipovací hra na sportovní zápasy (nejdřív hokej a fotbal) pro malou
uzavřenou skupinu uživatelů (kolegové, kamarádi). Uživatelé tipují
skóre zápasů před výkopem, po zápase se jim spočítají body.

### Jméno appky: Klopi (29.8.2026)

Appka se dřív jmenovala jen pracovně "Drew" (podle názvu GitHub
repozitáře, nikdy to nebylo vědomé rozhodnutí o brandu). Po delším
brainstormu s uživatelem (hecovací jednoslovné varianty jako
"Vedle"/"Skoro", jména se skrytým významem jako "Drew"=draw/remíza,
slangové "-ák"/"-ovka" varianty) padlo finální rozhodnutí na
**Klopi** — zkrácenina/spojenina z "Klobása + Pivo", tedy věcí, které
podle uživatele appku a partu kamarádů reálně spojují (sledování
zápasu spolu). Přejmenováno ve viditelné části appky (titulek
stránky, hlavička appky, přihlašovací stránka) i v `README.md`.

**Vlastní doména klopi.cz (5.9.2026).** Appka měla dřív jen adresu
`drew-pink.vercel.app`. Uživatel zvažoval i `klopi.app`, nakonec
zaregistroval **`klopi.cz`** u Forpsi. DNS (`A` záznam na
`klopi.cz` + `CNAME` na `www.klopi.cz`, oba na Vercelovy adresy)
nastaveno a ověřeno funkční. `https://klopi.cz` přidáno do Authorized
JavaScript origins v Google Cloud Console. `drew-pink.vercel.app`
zůstává funkční jako přesměrování na `klopi.cz` (nastaveno v
nastavení té domény ve Vercelu — "Redirect to", ne "Set as Primary
Domain", jak se ta funkce dřív jmenovala).

**Vědomě NEpřejmenováno:** GitHub repozitář zůstává `dstruhac/drew` —
přejmenování repozitáře je vratné a nedotýká se OAuth ani DNS, ale
zatím na to nebyl důvod (URL repozitáře nikdo z appky neuvidí).

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
  - produkční URL: **https://klopi.cz** (`drew-pink.vercel.app` přesměrovává na
    tuhle adresu, viz sekce "Jméno appky" výše)
  - produkční deploy se spouští jen z `main` (push na jinou branch = jen preview URL)
- **Supabase projekt**: https://supabase.com/dashboard/project/rvcxdlmwxdykkxpqegzr
  - `NEXT_PUBLIC_SUPABASE_URL=https://rvcxdlmwxdykkxpqegzr.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = publishable klíč, viz `.env.local` (necommitnutý; hodnota je veřejná/bezpečná v klientském kódu, ale přesto ji nedáváme do repa) a nastavený v env proměnných na Vercelu
- **Google Cloud projekt "Drew"**: OAuth 2.0 client pro Google Sign-In
  - Client ID: `151884903772-gdqjv8knvcghh17posnrd7qu5kta518l.apps.googleusercontent.com`
  - Client Secret: uložen jen v Supabase Dashboardu (Authentication → Providers → Google), nikde v repu
  - Redirect URI nastavené v Google Console: `https://rvcxdlmwxdykkxpqegzr.supabase.co/auth/v1/callback`
  - Authorized origins: `https://klopi.cz`, `https://drew-pink.vercel.app`,
    `http://localhost:3000`

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

## Aktuální cíl: pilotní provoz ✅ spuštěn (2026-09-05)

Základní tok aplikace je otestovaný a aplikace přechází do pilotního
provozu s reálnými hráči. Google OAuth je publikovaný a přihlášení je
otevřené všem uživatelům — není už omezené seznamem testovacích e-mailů
(potvrzeno uživatelem 5.9.2026). Soutěže používají reálné rozpisy a
výsledky automaticky importované z Livesportu.

## Stav (aktualizováno 2026-09-06, zahájen pilotní provoz)

Hotovo:
- [x] Scaffold Next.js + TS + Tailwind
- [x] SQL migrace (profiles, competitions, matches, predictions + RLS + grants)
- [x] Supabase klienti (browser/server/proxy)
- [x] Login stránka + funkční Google OAuth, motto a vizuální redesign
- [x] Ochrana stránek podle přihlášení
- [x] Nasazení na Vercel (https://klopi.cz, viz sekce "Vlastní doména
  klopi.cz" výše)
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
  a sbalené "Už tipnuto" (oba defaultně omezené, viz krok 15 a ladění
  appky za běhu výše)
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
- [x] Sekce "Probíhající" pro zápas, který se právě hraje (28.8.2026) —
  `sync-results` teď kromě dohraných výsledků zapisuje i `status='live'`
  + průběžné skóre (zdroj: stránka ligy na livesport.cz bez přípony,
  ověřeno na reálném živém zápase), appka je zobrazí ve vlastní
  červené sekci mezi "Nadcházející" a "Proběhlé". Podrobnosti viz krok
  16 v sekci "Naplánované další kroky".
- [x] **Grafický redesign appky (29.8.2026)** — appka byla vizuálně jen
  holé černobílé Tailwind CSS bez zaoblení/pohybu; uživatel chtěl
  kompletní grafickou proměnu. Postup: nejdřív 3 vizuální směry jako
  klikací návrh přes Claude Design canvas
  (https://claude.ai/code/artifact/0e6aff80-f8c9-444a-bd9a-93838267bb43),
  uživatel vybral "Svěží a čisté" (bílá/krémová, jeden živý zelený
  akcent, hodně zaoblené karty). Realizace v 5 PR (#63–#67):
  1. **Design tokeny** (`src/app/globals.css`) — pojmenované proměnné
     pro barvy, zaoblení, stín, rychlost animací na jednom místě, ať
     jde paleta později změnit na pár řádcích, ne procházením celé
     appky. Sémantické barvy (`--success`/`--warning`/`--danger`)
     záměrně oddělené od `--accent`. Font přepnut z (nikdy reálně
     nezobrazovaného kvůli přebitému CSS) Geist na Manrope.
  2. Pilotní obrazovka `/spaces` + hlavička appky.
  3. **`/spaces/[id]` — "vysvícený" nejbližší zápas**: uživatel
     nahlásil, že mu na širší obrazovce hodně zápasů zabírá hodně
     místa. Řešení: chronologicky nejbližší netipovaný zápas je vždy
     zvýrazněný jako velká karta nahoře (žádná nová DB struktura, je
     to prostě první položka už seřazeného seznamu; při shodě
     přesného času výkopu náhodný výběr, spočítaný jednou na
     serveru). Po tipnutí se sám přesune do "Už tipnuto" a vysvítí se
     další. Zbytek zápasů (i "Už tipnuto", "Probíhající", "Proběhlé")
     na širších obrazovkách přechází z jednoho sloupce do mřížky.
  4. **"Banger" momenty** — konfety (`canvas-confetti`, ~4kB) při
     první trefě přesného skóre a nové gratulační okno při získání
     medaile týdne (appka to dřív uměla zvýraznit jen tichým počtem
     ikonek). Appka si "už jsi to viděl" pamatuje jen v `localStorage`
     tohohle zařízení, ne v appce/databázi — vědomé zjednodušení.
  5. Zbytek appky (žebříček, profil, přihlášení) přestylován na
     stejné tokeny — appka už nikde nepoužívá staré natvrdo zapsané
     barvy. Emoji nahrazena knihovnou ikon (`lucide-react`).
- [x] **Ladění appky za běhu po redesignu (29.8.2026, PR #69–#70)** —
  drobné UX vychytávky doladěné podle zpětné vazby z reálného
  používání appky uživatelem:
  - **Auto-přeskok mezi políčky skóre** (`prediction-form.tsx`) — na
    mobilu se po zadání první číslice skóre domácích fokus sám
    přesune do pole hostů. Odsouhlaseno: přeskok hned po 1. číslici
    (nejrychlejší); u vzácného dvouciferného skóre (10+) se dá
    ťuknutím vrátit a dopsat druhou číslici.
  - **Odpočet do výkopu všude** — sdílený formátovač
    `src/lib/format-kickoff.ts` (dřív jen lokální kopie u vysvícené
    kartičky, teď i na běžných kartičkách zápasu a v hlavičce detailu
    zápasu), jen u zápasů, které ještě nezačaly.
  - **Limity v detailu soutěže přeladěny** (`spaces/[id]/page.tsx`):
    "Ještě netipováno" defaultně ukazuje vysvícenou kartičku + 3 další
    zápasy (dřív se počet dalších počítal z velikosti kola — na
    širších obrazovkách to pořád zabíralo hodně místa), "Už tipnuto"
    defaultně taky jen 3 (dřív 5). Nadpisy "Nadcházející"/"Už tipnuto"
    ukazují počet zápasů v závorce. Tlačítko "Zobrazit všechny"
    (sdílená komponenta `ExpandableList`) zvýrazněné akcentní barvou
    ve všech sekcích — dřív natvrdo černá/bílá bez design tokenů,
    přehlídnuto při redesignu.
  - **Zelená fajfka u "Už tipnuto" nahrazena badge "Tipnuto"** —
    uživatel nahlásil, že fajfka u nadcházejícího (ještě
    nevyhodnoceného) zápasu působila jako "získal(a) jsi body".
- [x] **Dashboard jako vstupní stránka po přihlášení (29.8.2026)** —
  `src/app/(app)/dashboard/page.tsx`, nahrazuje dřívější přesměrování
  na `/spaces` (odsouhlaseno s uživatelem přes `AskUserQuestion`).
  Tři sekce: vysvícená kartička chronologicky nejbližšího netipovaného
  zápasu napříč VŠEMI soutěžemi hráče (ne jen jednou soutěží jako na
  `/spaces/[id]`), "Tvoje soutěže" (jen soutěže, kde je hráč
  `competition_participants`, s pozicí v žebříčku) a "Sbírka artefaktů"
  (medaile za vítězství týdne z `weekly_badges`, posbírané napříč
  soutěžemi — žádná nová databázová tabulka). `/spaces` (přehled/
  prokliknutí VŠECH soutěží v appce, i těch, do kterých hráč ještě
  nevstoupil) zůstává dál dostupné přes odkaz "Procházet všechny
  soutěže" z Dashboardu — nadpis tam přejmenován z "Tvoje soutěže" na
  "Všechny soutěže", ať nekoliduje s tím, že "Tvoje soutěže" teď vlastní
  Dashboard. Sdílené komponenty `SpotlightMatchCard`/`TeamBadge`/
  `TeamLogo` (`src/components/spotlight-match-card.tsx`) a
  `CompetitionCard` (`src/components/competition-card.tsx`) přesunuty
  z `/spaces` a `/spaces/[id]`, ať je můžou obě stránky sdílet.
- [x] **Vyhodnocování zápasů: prošetřena a částečně opravena
  nespolehlivost `sync-results` (29.8.2026, PR #78)** — uživatel
  nahlásil, že appka vyhodnocuje zápasy s velkým zpožděním. Ověřeno na
  historii běhů: mezery mezi jednotlivými automatickými spuštěními
  byly 3,5–11 hodin místo nastavených 30 minut, dva zápasy zůstaly
  zaseknuté ve špatném stavu hodiny po výkopu. Hlavní příčina je
  zdokumentovaný, celoplošně se zhoršující problém se spolehlivostí
  GitHub Actions `schedule:` triggerů (mimo dosah tohohle repa) — z
  toho šlo opravit jen to, že `sync-results` (`*/30 * * * *`) a
  `predict-reminders` (`0 * * * *`) se srážely přesně v celou/půl
  hodinu, což GitHub sám doporučuje nedělat (nejvytíženější okamžik
  pro spouštění naplánovaných úloh napříč celým GitHubem). Přeladěno
  na `7,37 * * * *` / `12 * * * *`. Nemění chování appky ani datový
  model, smergováno rovnou bez čekání na schválení.
- [x] **Podpora pro odložené zápasy (29.8.2026)** — při ručním
  spuštění `sync-results` kvůli bodu výše se navíc našel druhý,
  nesouvisející reálný zápas (Bohemians – Mladá Boleslav, Chance
  Liga), zaseknutý jako `scheduled` i 6+ hodin po výkopu a chybějící
  jak na `/vysledky/`, tak na `/program/` livesport.cz — uživatel
  potvrdil, že zápas byl skutečně odložen. Appka do té doby uměla
  jen `scheduled`/`live`/`finished` a takový zápas matoucně
  zobrazovala jako "právě začal, čekáme na skóre" donekonečna.
  Uživatel zvolil (přes `AskUserQuestion`) postavit pořádnou podporu,
  ne jen jednorázovou ruční opravu SQL:
  - Nová hodnota `matches.status = 'postponed'`
    (`supabase/migrations/20260829220000_add_postponed_match_status.sql`,
    rozšiřuje `matches_status_check`). **Potvrzeno spuštěno** (ověřeno
    přes `db-probe.yml` 10.9.2026 — v databázi existuje reálný zápas
    se `status='postponed'`).
  - **Detekce** (`scripts/sync/results.mjs`): zápas se označí jako
    odložený, když má `status='scheduled'`, `kickoff_at` je víc než 4
    hodiny v minulosti (bezpečná rezerva nad běžnou délku zápasu i s
    prodloužením) a NENÍ mezi zápasy vrácenými stránkou výsledků —
    kontroluje se proti všem scrapovaným zápasům, ne jen těm už se
    zapsaným skóre, ať se dohrávaný zápas bez skóre neoznačí omylem
    jako odložený.
  - **Zpětné odblokování** (`scripts/sync/fixtures.mjs`): dřívější
    upsert u nadcházejících zápasů `status` vůbec nezapisoval
    (spoléhal na sloupcový výchozí stav) — objevený vedlejší bug, kdy
    by PostgREST upsert při konfliktu `status` vůbec netkl a jednou
    odložený zápas by zůstal odložený navždy i po vyhlášení nového
    termínu. Opraveno explicitním `status: "scheduled"` u každého
    nadcházejícího zápasu v rozpisu — jakmile livesport.cz zápas znovu
    zařadí s novým termínem, appka ho sama odemkne.
  - **UI**: nová sekce "Odloženo" (žlutě, ikona `CalendarOff`) mezi
    "Probíhající" a "Proběhlé" na `/spaces/[id]`, i v detailu zápasu
    (`/spaces/[id]/matches/[matchId]`) — vlastní text v hlavičce i u
    "Váš tip", ať uživatel ví, že se zápas jen odložil, ne že appka
    nefunguje. Sdílený typ `Match` v
    `src/components/spotlight-match-card.tsx` rozšířen o `"postponed"`.
- [x] **"Náhodná liga" (30.8.2026)** — nová trvalá soutěž
  (`sport = 'mixed'`), které se každý den doplní 5 náhodně vybraných
  zápasů napříč skupinou 13 známých fotbalových a hokejových lig
  (`scripts/sync/lib/random-league-pool.mjs`). Rozhodnutí s uživatelem
  přes `AskUserQuestion`/v chatu:
  - **Zdroj zápasů**: vybraná skupina lig, ne úplně cokoliv z
    livesport.cz (ověřeno probe workflow 30.8.2026 — denní přehled
    `/fotbal/` má přes 450 zápasů napříč úplně všemi zeměmi světa,
    včetně krajských přeborů a mládežnických zápasů — nepoužitelné pro
    "náhodný, ale poznatelný" zápas). Pool: Chance Liga, Premier
    League, Bundesliga, La Liga, Serie A, Ligue 1, Niké liga, Brazilská
    Série A (fotbal) + Tipsport extraliga, NHL, Tipos extraliga, SHL,
    National League (hokej). Ruská KHL vědomě vynechána (uživatel
    30.8.2026). Brazilská Série A přidána speciálně kvůli pokrytí
    evropského léta (červen–půlka srpna), kdy evropský fotbal i hokej
    mají mimosezónu najednou — ověřeno reálným scrapem, že tou dobou
    skutečně hraje. Všech 10 nových `scrape_path` hodnot ověřeno
    přes `playwright-probe.yml` před zapsáním do kódu (ne odhadnuto).
  - **Model soutěže**: jedna trvalá soutěž s jedním žebříčkem, ne denní
    reset.
  - **Míň než 5 zápasů v jeden den** (např. mezinárodní reprezentační
    pauza) není chyba — appka zapíše, kolik zápasů je, klidně 0.

  **Datový model**: `competitions.sport` rozšířeno o `'mixed'`
  (`supabase/migrations/20260830090000_random_league.sql`) — signál
  appce i `sync-results`, že tahle soutěž kombinuje víc lig. Nové
  sloupce `matches.sport`/`matches.source_scrape_path`, vyplněné JEN u
  zápasů "Náhodné ligy" (jinak `null`, appka použije sport/scrape_path
  soutěže jako dřív) — potřeba, protože appka jinak měla sport a
  scrape_path jen na úrovni competition, což u soutěže kombinující
  víc lig nestačí (jeden zápas = hokej s prodloužením, druhý fotbal;
  každý navíc z jiné výsledkové stránky).

  **`scripts/sync/random-league.mjs`** (`.github/workflows/random-league.yml`):
  najde dnešní pražský den, zeptá se, jestli už "Náhodná liga" dnešní
  zápasy má (idempotence — výběr je náhodný, druhé spuštění stejný den
  by bez týhle pojistky přidalo jiných 5 zápasů navíc), pak projede
  celý pool, nascrapuje z každé ligy dnešní zápasy
  (`scrapeLivesportFixtures`, beze změny) a náhodně vybere 5. Selhání
  jedné ligy nezastaví celý běh (zbytek poolu pokračuje). **První ruční
  běh (30.8.2026, po smergování PR #81) ověřen naostro** — z 9
  kandidátů (fotbal aktivní, hokej mimosezónu, 0 zápasů) vybráno a
  zapsáno 5: Monako–Marseille, Flamengo–Botafogo RJ, Celta Vigo–Ath.
  Bilbao, Lazio–FC Janov, Sparta Praha–Slavia Praha. Po ověření zapnut
  `schedule` (`20 4 * * *`, po `sync-fixtures` a mimo celou/půl hodinu).

  **`results.mjs` rozšířeno** o `syncRandomPoolCompetition()` — na
  rozdíl od běžné soutěže (jedno `scrape_path`) se zápasy "Náhodné
  ligy" seskupí podle `source_scrape_path` a pro každou skupinu se
  výsledek dohledá na JEJÍ výsledkové stránce. Zásadní rozdíl oproti
  běžné soutěži: nikdy se nic nezakládá (jen `UPDATE` podle
  `external_id`) — `scrapeLivesportResults()` vrací všechny zápasy
  CELÉ ligy, ne jen těch pár, co appka náhodně vybrala, takže
  upsert/insert by omylem naimportoval celou ligu do Náhodné ligy.

  **UI**: appka dřív měla `sport` jen na competition (typ `"hockey" |
  "football"`, používaný mj. pro checkbox "prodloužení/nájezdy" u
  hokeje). Nově `CompetitionSport` (`"hockey" | "football" | "mixed"`)
  na competition + `Sport | null` na matches — `MatchCard`/
  `SpotlightMatchCard` počítají efektivní sport zápasu jako
  `match.sport ?? competition.sport` (sdílený fallback
  `src/lib/sport.ts`), takže zbytek appky (barvy karet, formulář tipu)
  funguje beze změny chování u běžných soutěží a správně se přepíná
  zápas od zápasu u "Náhodné ligy".

  **Vedlejší zjištění (30.8.2026, k případnému budoucímu kroku):**
  ověřeno přes probe, že livesport.cz na stránce konkrétního zápasu
  (`/zapas/.../kurzy/?mid=...`) reálně ukazuje kurzy sázkových kanceláří
  (1-X-2 desetinná čísla, víc trhů — Over/Under, oba dají gól,
  double chance...). Uživatel projevil zájem appce doplnit kurzy jako
  pomoc při tipování. Technicky proveditelné, ale jiný druh scrapování
  než appka dělá dnes — dnešní scraper stahuje JEDNU stránku za celou
  ligu a dostane všechny zápasy najednou, kurzy jsou ale jen na
  stránce KONKRÉTNÍHO zápasu, takže by to vyžadovalo otevřít prohlížeč
  zvlášť pro každý sledovaný zápas (výrazně dražší na čas/requesty).
  Neimplementováno, čeká na rozhodnutí jako samostatný krok.
- [x] **Konsolidované upozornění na medaile za vítězství týdne
  (29.8.2026, PR #80)** — appka dřív uměla vlastníka medaile potěšit
  jen modálním oknem (viz krok 4 v sekci "Grafický redesign" výše) a o
  cizí výhře nikoho neinformovala vůbec. Rozhodnutí s uživatelem přes
  `AskUserQuestion`:
  - **Vlastní výhra** → modal ("Gratuluju, jsi jednooký mezi
    slepými.") s výčtem soutěží + zmínkou, pokud ve stejném týdnu
    bodoval i někdo jiný.
  - **Cizí výhra, uživatel sám 0** → tenký odklikávací banner nad
    vysvícenou kartičkou zápasu na dashboardu ("Zlepši to a ukaž, že
    na to máš.") s výčtem vítězů.
  - Nikdy obojí zároveň (max. jedno upozornění na dashboardu) — řeší
    obavu uživatele z "3 upozornění najednou".
  - Proklik z modalu na Sbírku artefaktů → nová medaile se ze šedé
    probarví (`grayscale` → plná barva, konečně využitý token
    `--duration-celebration` z `globals.css`).

  **Technické rozhodnutí (moje, vysvětleno v chatu):** dedup přes nový
  sloupec `profiles.badges_seen_through` (datum,
  `supabase/migrations/20260829090000_profiles_badges_seen_through.sql`)
  místo dřívějšího `localStorage` — upozornění se tak neopakuje na
  jiném zařízení/po smazání dat prohlížeče. Celá logika (dřívější
  `badge-celebration-modal.tsx`+`badge-celebration-watcher.tsx`,
  globální na každé stránce) přesunuta jen na `/dashboard` — appka má
  dashboard jako vstupní stránku po přihlášení, takže flow
  modal→scroll→reveal běží na jedné stránce beze změny URL. Nová
  sdílená komponenta `src/components/badge-center.tsx` (modal + banner
  + samotná Sbírka artefaktů, sdílí stav "revealed" mezi zavřením
  modalu a probarvením karty), server akce `markBadgesSeen` v
  `dashboard/actions.ts`.

  **Ruční krok uživatele**: spustit migraci
  `20260829090000_profiles_badges_seen_through.sql` v Supabase SQL
  editoru. **Hotovo (10.9.2026)** — uživatel potvrdil, že sloupec
  založil (idempotentní `alter table ... add column if not exists`,
  doplněný do chatu 10.9.2026, protože zpětně nešlo ověřit přes
  `db-probe.yml`, jestli migrace už dřív neproběhla — viz nově
  zjištěný chybějící grant `service_role` → `profiles` níže).

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

- [x] **Podtitulek v hlavičce veřejné stránky i appky (5.9.2026)** —
  hlavička `/` (`src/app/page.tsx`) ukazovala jen "Klopi", uživatel
  chtěl vrátit i podtitulek se skrytým významem jména ("Klobása a
  pivo", viz sekce "Jméno appky" výše). Doplněno jako `– Klobása a
  pivo` za název, jen od `sm:` šířky výš (na mobilu by s tlačítkem
  "Přihlásit se"/fotečkou uživatele na stejném řádku bylo těsno) —
  patička appky se stejným textem ("Klopi — Klobása + Pivo, věci co
  nás spojujou.") beze změny. Uživatel upozornil, že stejný podtitulek
  chybí i v hlavičce uvnitř appky (`src/components/app-header.tsx`,
  sdílená napříč `/dashboard`, `/spaces`, `/profil`...) — první úprava
  se týkala jen veřejné stránky, doplněno stejným vzorem i sem.
- [x] **Ruční přepínač světlý/tmavý režim (6.9.2026)** — appka dřív
  uměla jen sledovat systémové nastavení telefonu/prohlížeče
  (`prefers-color-scheme`), takže dva lidé se stejnou appkou vidí různý
  vzhled podle toho, jak má každý nastavený svůj telefon (přesně tohle
  uživatel nahlásil — on má telefon v dark módu, žena v light módu).
  Ikonový přepínač (`src/components/theme-toggle.tsx`) v hlavičce
  appky i na veřejné úvodní stránce cykluje **Podle telefonu → Světlý →
  Tmavý**. Volba se ukládá do `localStorage` (`klopi-theme`) **per
  prohlížeč/telefon**, ne v appce/databázi — jde o preferenci
  zařízení, ne o věc, kterou by měl mít hráč stejnou všude.
  `src/app/globals.css`: tmavé tokeny teď platí buď ze systému (ale
  jen když uživatel ručně nezvolil "Světlý" — `:not([data-theme="light"])`),
  nebo natvrdo přes `<html data-theme="dark">`; žádná komponenta kromě
  přepínače samotného se neupravovala. `src/app/layout.tsx` má krátký
  blokující skript v `<head>`, který nastaví `data-theme` dřív, než
  appka cokoliv vykreslí, ať appka na zlomek vteřiny nebliká špatnou
  barvou.
- [x] **Sportovní barevný vibe -- fotbal zelený, hokej modrý (6.9.2026)**
  — na žádost uživatele, rozsah odsouhlasen přes `AskUserQuestion`:
  barva sahá úplně všude uvnitř dané soutěže (kartička soutěže,
  hlavička detailu, tlačítka Chci hrát/Uložit tip/upozornění, kartičky
  zápasů, hero kartička, žebříček, medaile). Fotbal zůstává ve výchozí
  zelené appky (`--accent` beze změny -- appka je zelená odjakživa),
  hokej dostal nový token `--accent-hockey`
  (`src/app/globals.css`, Tailwind blue-600 světlý režim / blue-400
  tmavý, stejná konvence jako `--warning`/`--danger`). "Náhodná liga"
  (sport `mixed`) zůstává na úrovni soutěže neutrální/zelená, ale
  jednotlivé zápasy uvnitř se obarví podle SVÉHO sportu.

  **Mechanismus** (`sportAccentStyle()` v `src/lib/sport.ts`): přepíše
  `--accent` na nejbližším obalujícím elementu (kartička/hlavička/
  zápas) podle sportu. Díky dědění CSS proměnných se tím automaticky
  obarví vše uvnitř používající Tailwind třídy `bg-accent`/`text-accent`/
  `border-accent`/`ring-accent`, beze změny kódu jednotlivých komponent
  (`PredictionForm`, `ExpandableList` atd.). Barva podle úspěšnosti tipu
  (zelená/žlutá, `--success`/`--warning`) byla v době týhle featury
  ještě nezávislý systém oddělený od `--accent` -- **přebarveno hned
  následující den, viz krok níže.** Mechanismus ověřen mimo appku na
  skutečně zkompilovaném CSS appky (Playwright) -- appku samotnou
  nešlo z tohohle sandboxu vyzkoušet živě (žádný přístup na Supabase),
  ověřeno až uživatelem na Vercel preview.
- [x] **Kartička zápasu: žlutá nahrazena sytostí sportovní barvy
  (6.9.2026)** — uživatel nahlásil, že žlutá u "aspoň výherce/góly
  sedí" evokuje chybu/varování, ne částečný úspěch. Kartička zápasu
  (`getResultTone()`/`RESULT_TONE_CLASSES` v
  `src/app/(app)/spaces/[id]/page.tsx`) teď místo tří barev (zelená/
  žlutá/šedá) stupňuje SYTOST jedné barvy -- sportovní `--accent` z
  kroku výše (zelená fotbal / modrá hokej): `"one"` (jen výherce NEBO
  jen góly) nejsvětlejší (`bg-accent/[0.07]`), `"both"` (obojí, ale ne
  přesně) tmavější (`/[0.14]`), `"exact"` (přesné skóre) nejtmavší
  (`/[0.22]`). Odpovídá logice `calculate_match_points()`, jen bez
  čtení bodové hodnoty, takže appka nezávisí na per-competition
  nastavení bodování -- u výchozích 3/1/1 vychází `one`→1 bod,
  `both`→2 body, `exact`→3 body přesně, jak uživatel zadal. Text u
  přesné trefy (`exact-score-celebration.tsx`) přešel z pevné zelené
  (`text-success`) na `text-accent` ze stejného důvodu.
- [x] **Odkaz "Dashboard" v hlavičkách appky (6.9.2026)** — appka uměla
  proklik zpátky na Dashboard jen skrytě přes klik na logo appky
  v horní liště, což uživatel nepovažoval za dost zjevné. Doplněn
  viditelný textový odkaz "Dashboard" (odděleno tečkou od stávajícího
  odkazu, kde nějaký byl) do hlaviček: `/spaces` (přehled soutěží, dřív
  žádný odkaz zpátky vůbec), `/spaces/[id]`, `/spaces/[id]/leaderboard`,
  `/spaces/[id]/matches/[matchId]`, `/profil/[userId]` a `/profil`.
  Stávající odkazy (`← Soutěže`, `← {competition.name}` atd.) beze
  změny cíle.
- [x] **Okno nadcházejících zápasů zkráceno na 7 dní (6.9.2026)** —
  uživatel nahlásil, že appka ukazuje příliš mnoho nadcházejících
  zápasů najednou a mate ho to. `sync-fixtures` (`scripts/sync/fixtures.mjs`)
  stahovalo klouzavé okno 21 dní dopředu; appka navíc nikdy nemazala
  starší načtené zápasy, takže "Nadcházející" sekce na `/spaces/[id]`
  postupně rostla. Řešení bez mazání dat (bezpečnější než jednorázový
  úklid v databázi):
  - `WINDOW_DAYS` v `sync-fixtures` zkráceno z 21 na 7 -- appka
    přestane přibírat nové zápasy nad 7 dní dopředu. `minExpected`
    validace snížen z 1 na 0, protože "0 zápasů v 7denním okně" může
    být legitimní reprezentační pauza/bye week, ne rozbitý scraper
    (u 21denního okna to prakticky nehrozilo).
  - `src/app/(app)/spaces/[id]/page.tsx` (`UPCOMING_WINDOW_DAYS`)
    stejný limit vynucuje i při zobrazení -- zápasy, které appka
    stihla načíst ještě podle staršího (delšího) okna, se tak schovají
    hned, ne až se postupně "vyhrají" pryč. Dotaz do databáze zůstal
    beze změny (natvrdo neomezený), filtr je až v kategorizaci zápasů,
    aby hláška "Zatím tu nejsou žádné zápasy" zůstala pravdivá i pro
    soutěž, která má zápasy jen dál než 7 dní dopředu (typicky
    hokejová extraliga před začátkem sezóny).
  - **Hláška "vše natipováno"** (`✅ Máš vyplněné tipy na všechny
    nadcházející zápasy.`) existovala už dřív, ale byla schovaná za
    podmínkou, která zmizela úplně, když appka neměla v okně vůbec
    žádný zápas (ani tipnutý, ani netipnutý) -- typicky reprezentační
    pauza. Opraveno: sekce se teď zobrazí i v tomhle případě, s
    odlišenou hláškou (`✅ Není nic k tipování — v příštích 7 dnech se
    nehraje žádný zápas.`) podle toho, jestli šlo o "vše tipnuto", nebo
    "v okně nic není".
- [x] **Značka "Vše natipováno" na kartičce soutěže (6.9.2026)** —
  uživatel chtěl na první pohled (bez prokliku do detailu soutěže)
  poznat, že u dané soutěže nemá co dalšího tipnout. `CompetitionCard`
  (sdílená mezi `/spaces` a Dashboardem) dostala nový volitelný prop
  `allCaughtUp` -- zelená pilulka "Vše natipováno" pod pozicí
  v žebříčku, zelená fixní (`success`), nezávislá na sportovní barvě
  soutěže. `UPCOMING_WINDOW_DAYS` přesunuto z `spaces/[id]/page.tsx`
  do sdíleného `src/lib/upcoming-window.ts`, ať appka na kartičce a na
  detailu soutěže nepoužívá dvě různá okna omylem. `/spaces` kvůli
  tomu poprvé načítá i `matches` (dřív žádné, celý dotaz odpadl při
  výkonové optimalizaci 28.8.2026) -- jen sloupce `id, competition_id`
  a jen zápasy v 7denním okně, ať to nic nestojí navíc. Dashboard nový
  dotaz nepotřeboval, jen zúžil už načtené `upcomingMatches` na
  7denní okno pro účel týhle značky (vysvícený zápas dál než 7 dní
  zůstává beze změny, aby appka pořád ukázala nejbližší tip i mimo
  okno, pokud nic bližšího není).
- [x] **Odložený zápas zmizí po dni, kdy se měl hrát (6.9.2026)** —
  uživatel nahlásil, že odložený zápas z detailu soutěže nikdy nezmizí.
  Appka status `postponed` uměla jen NASTAVIT (`sync-results`) a zase
  ODEBRAT, jakmile livesport.cz vyhlásí nový termín (`sync-fixtures`,
  krok "Podpora pro odložené zápasy" výše) -- bez nového termínu
  zápas zůstával v sekci "Odloženo" navždy. `src/app/(app)/spaces/[id]/page.tsx`
  teď takový zápas do "Odloženo" zařadí jen v den, kdy se měl původně
  hrát (`isSameCalendarDayInPrague()`, porovnává kalendářní den podle
  pražského času, ne UTC serveru) -- později appka zápas dál nezobrazí
  vůbec, dokud se nenajde nový termín (v tu chvíli se stejně přesune
  zpátky mezi nadcházející). Čistě zobrazovací změna, `status` v
  databázi zůstává `postponed` beze změny.
- [x] **Konfety u přesně trefeného tipu odebrány (6.9.2026)** —
  uživateli se efekt nelíbil. `exact-score-celebration.tsx` (krok
  "Banger" momenty v redesignu 29.8.2026) dál zvýrazní bodovou částku
  krátkou "pop" animací při prvním zobrazení, jen bez `canvas-confetti`
  výbuchu. Konfety u medaile za vítězství týdne (`badge-center.tsx`)
  zůstávají beze změny -- uživatel mluvil konkrétně o přesném výsledku.
- [x] **Trofej na kartičce soutěže jen na 1. místě (6.9.2026)** —
  drobná úprava `CompetitionCard`, ikona `Trophy` u "X. místo z Y" se
  vykreslí jen když `rank.rank === 1`.
- [x] **Žebříček: průměr bodů místo "X z Y vyhodnoceno" (6.9.2026)** —
  uživatel navrhoval nahradit řádek "X z Y zápasů vyhodnoceno"
  průměrem bodů na tipnutý zápas, mj. jako možný způsob spravedlivého
  srovnání hráčů, kteří se do soutěže přidali později. Rozhodnuto
  s uživatelem přes `AskUserQuestion`: **žebříček se dál řadí podle
  CELKOVÝCH bodů beze změny** -- řazení podle průměru bylo zamítnuto,
  protože trpí malým vzorkem (hráč s jedním přesně trefeným tipem by
  měl průměr 3 b./zápas a přeskočil by poctivého hráče s průměrem 2
  b./zápas za celou sezónu). Průměr je jen nová informace v řádku pod
  skóre (`spaces/[id]/leaderboard/page.tsx`, `Ø X,XX b./zápas`,
  počítáno z `entry.scoredCount`, ne z `predictionCount` -- ať appka
  nepočítá nevyhodnocené zápasy jako 0 bodů), `X× přesně` beze změny.
  Stejný vzorec "X z Y zápasů" zůstává zatím i na veřejném profilu
  hráče (`profil/[userId]/page.tsx`) -- uživatel mluvil konkrétně
  o žebříčku soutěže, změna profilu nebyla součástí zadání.
- [x] **Chybějící logo na telefonu (záložka + "Přidat na plochu"),
  opraveno (6.9.2026)** — appka měla jen `icon.svg` (favicon do
  záložky), žádnou ikonu vyhrazenou pro "Přidat na plochu". Ověřeno
  webovým vyhledáváním: moderní Safari SVG favicon v záložce umí, ale
  u "Přidat na plochu" ho ÚPLNĚ IGNORUJE a čeká vyhrazený `apple-touch-icon`
  PNG (180×180) -- bez něj iOS logo appky na plochu nedá. Android
  bere ikonu z Web App Manifestu, který appka vůbec neměla.

  **Oprava:**
  - `src/app/apple-icon.png` (180×180) + `public/icon-192.png` a
    `public/icon-512.png` -- vygenerováno z existujícího
    `public/brand/klopi-icon.svg` vyfocením přes headless Chromium
    (v sandboxu bez ImageMagick/rsvg-convert), ne uhodnuto.
  - `src/app/manifest.ts` -- nový Web App Manifest (`name`,
    `theme_color: #16a34a`, `background_color: #faf9f6`, `display:
    "standalone"`, `icons` na výše uvedené PNG). `start_url: "/"`
    funguje samo -- appka přihlášeného hráče z `/` přesměruje na
    `/dashboard`, odhlášeného na `/login`.
  - `src/app/layout.tsx` -- `appleWebApp` metadata (`capable: true`,
    `title: "Klopi"`), appka se pak na iOS z plochy spustí bez
    adresního řádku Safari.
  - **Druhý, skutečný důvod, proč appka logo neukazovala vůbec** (ne
    jen na iOS): `src/proxy.ts` middleware matcher nevyjímal
    `.webmanifest` příponu, takže appka `/manifest.webmanifest`
    nepřihlášenému hráči přesměrovávala na `/login` -- Chrome/Android
    tak místo JSON manifestu s ikonami dostal HTML přihlašovací
    stránku a nenašel v ní žádnou ikonu. Ověřeno `curl`em před i po
    opravě (307 na `/login` → 200 s JSON obsahem). Doplněno
    `webmanifest` do stejné výjimky, kde už appka měla `svg`/`png`/atd.
- [x] **Náhodná liga: přejmenování v DB duplikovalo soutěž, opraveno
  (6.9.2026)** — uživatel přejmenoval competition "Náhodná liga" přímo
  v Supabase na "Creme de la Creme liga". `random-league.mjs` ale svoji
  soutěž hledal podle JMÉNA (`ensureCompetition()`), ne podle
  `sport='mixed'` -- při dalším běhu tak přejmenovanou soutěž nenašel a
  založil si NOVOU se starým jménem "Náhodná liga", do které zapsal
  dnešní výběr 5 zápasů. Appka má z návrhu jen jednu soutěž se
  `sport='mixed'`, takže hledání podle sportu (ne jména) je robustní
  vůči budoucím přejmenováním appku bez zásahu do kódu.

  **Oprava kódu**: `ensureCompetition()` teď hledá jen podle
  `sport='mixed'`. **Úklid vzniklé duplicity**: ověřeno předem přes
  `db-probe.yml` (duplicitní competition neměla ŽÁDNÉ účastníky ani
  tipy, jen těch 5 dnešních zápasů) a proveden jednorázový GitHub
  Actions workflow (`fix-random-league-duplicate.yml`, service role
  klíč) -- přesunul dnešní zápasy pod správnou (přejmenovanou)
  competition a duplicitní prázdný řádek smazal. Workflow po použití
  smazán ze souborového stromu, ať v repu nezůstává trvalá schopnost
  mazat data (stejná konvence jako u úklidu testovacích dat 28.8.2026).
- [x] **Náhodná liga: výběr zápasů den dopředu, ne v den zápasu
  (6.9.2026)** — uživatel chtěl mít možnost tipovat zápasy Náhodné
  ligy s předstihem, stejně jako u ostatních soutěží; appka dřív
  vybírala 5 zápasů brzy ráno v TÉŽE DEN, kdy se hrálo, takže na ně
  nešlo tipovat dopředu. `scripts/sync/random-league.mjs` teď místo
  "dnešního dne" hledá a vybírá zápasy ZÍTŘEJŠÍHO pražského dne
  (`getTodayRange(new Date(), 1)` — `lib/week-range.mjs` rozšířen o
  volitelný `dayOffset`, `getTodayRange(ref, 0)` beze změny chování
  pro stávající volání z `predict-reminders.mjs`).

  **Rozvrh** (`.github/workflows/random-league.yml`): přeladěno z
  4:20 UTC (ráno) na `0 16 * * *` (16:00 UTC), tak aby vycházelo na
  18:00 pražského času v aktuálně platném letním čase (CEST, UTC+2).
  GitHub Actions cron neumí časové pásmo, jen pevné UTC — v zimě (CET,
  UTC+1) proto vyjde na 17:00 pražského času, o hodinu dřív než
  zadaných "18:00", ne později. Vědomá volba (moje, vysvětleno v
  chatu): pro "ať jde tipovat dopředu" je dřívější spuštění v zimě
  neškodné (zápasy budou k tipování jen o hodinu déle), zatímco pozdější
  spuštění by riziko neslo. Beze změny zůstává praxe nastavovat GitHub
  Actions cron na pevné UTC bez sezónního přepočtu (stejně jako
  `sync-fixtures`/`sync-results`).
- [x] **Všech 5 naplánovaných úloh přesunuto na cron-job.org, GitHubův
  vlastní `schedule:` odstraněn (6.9.2026)** — navazuje na řešení
  nespolehlivosti `sync-results` z 5.9.2026 (viz krok 19 výše), kde se
  ukázalo, že GitHubův `schedule:` trigger dokáže i po zmírňujících
  úpravách (posun mimo celou/půl hodinu) meškat 2-6 hodin. Uživatel se
  zeptal, jestli v repu nezůstaly další podobné plánované úlohy, které
  by měly stejný problém — ověřeno (`grep "schedule:"
  .github/workflows/*.yml`, ne odhadem): kromě `sync-results.yml` mají
  vlastní `schedule:` i `sync-fixtures.yml`, `random-league.yml`,
  `predict-reminders.yml` a `award-weekly-badges.yml`. Pro všechny
  čtyři založena obdobná cron-job.org úloha (stejný fine-grained GitHub
  token, jen jiná cílová URL/čas) — `sync-fixtures` denně brzy ráno,
  `random-league` denně v 18:00 **Europe/Prague** (cron-job.org umí
  časové pásmo přímo ve svém rozhraní, ověřeno v jejich REST API
  dokumentaci — díky tomu není potřeba řešit letní/zimní čas ručně jako
  u GitHubova `schedule:`, který zná jen UTC), `predict-reminders`
  každou hodinu, `award-weekly-badges` v pondělí ráno. Všechny 4 nové
  úlohy otestovány ručním "spustit hned" v cron-job.org a ověřeny přes
  historii běhů na GitHubu (`workflow_dispatch`, `conclusion: success`)
  ještě předtím, než se cokoliv v repu smazalo — ať nevznikne okno, kdy
  appka neběží automaticky vůbec.

  Po ověření všech 5 (`sync-results` byl na cron-job.org už od
  5.9.2026) odstraněny `schedule:` bloky ze všech pěti workflow
  souborů — appku už nebudí GitHubův vlastní plánovač, jen cron-job.org
  voláním `POST .../workflows/<jméno>.yml/dispatches`. `workflow_dispatch`
  (ruční spuštění/ladění) v souborech zůstává — je to zároveň přesně
  ten typ volání, který cron-job.org používá.
- [x] **Přepis veřejné úvodní stránky do hravějšího tónu (6.9.2026,
  PR #128)** — `src/app/page.tsx`. Nový hero text ("Klobása. Pivo.
  Tipovačka. Klopi."), tlačítko přejmenováno z "Přihlásit se přes
  Google" na "Jdu do toho" (ikona Google zůstává jako vizuální nápověda,
  co se pod tlačítkem skrývá), zavedeno sloveso "klopnout"
  (CTA "Tak to klopni", nadpis "Co se právě klopí?"), přidána nová
  sekce s hecovacími citáty ("Tohle je tutovka.", ...) a závěrečná
  sekce "Nejde o peníze. Jde o něco důležitějšího." Patička
  přeformulována na "Klopi — Klobása. Pivo. Tipy. Věci, co nás spojují."
  Ověřeno vizuálně (Playwright screenshot desktop i mobil) před
  smergováním — žádné rozbité rozvržení ani přetečení textu.
- [x] **Popisky soutěží na kartičkách + samostatná stránka s pravidly
  bodování (6.9.2026)** — uživatel nahlásil, že řádek "Body za přesný
  tip X · za vítěze Y · za góly celkem Z" na kartičce soutěže
  (`CompetitionCard`) není moc čitelný/zajímavý, a chtěl místo něj
  krátký popisek toho, co daná soutěž je (zvlášť u "Creme de la Creme
  ligy", kde číselné body samy o sobě nevysvětlují, jak náhodný výběr
  zápasů funguje). Zároveň appka neměla ŽÁDNÉ jiné místo, kde by šlo
  bodování souhrnně dohledat.

  **Datový model**: nový sloupec `competitions.description` (nullable
  text, `supabase/migrations/20260906120000_competitions_description.sql`)
  — appka ho teď zobrazuje na kartičce MÍSTO řádku s body. Migrace
  rovnou vyplní popisek pro všechny 4 existující soutěže. Poznámka:
  uživatel navrhoval "12 lig" u Náhodné ligy, ověřeno v kódu
  (`random-league-pool.mjs`), že jich je reálně 13 — použito správné
  číslo, ne navržené.

  Popisky (odsouhlaseno s uživatelem přes `AskUserQuestion`):
  - Hokejová extraliga 2026/27 — *"Nejvyšší česká hokejová soutěž — tip
    na každý zápas sezóny."*
  - Chance Liga — *"Nejvyšší česká fotbalová liga — tip na každé
    kolo."*
  - Premier League — *"Nejlepší anglická fotbalová liga — tip na
    každé kolo."*
  - Creme de la Creme liga — *"Každý den 5 nových zápasů namátkou ze
    13 fotbalových a hokejových lig."* (přiřazeno přes `sport='mixed'`,
    ne přes jméno — stejná robustnost vůči přejmenování jako
    `random-league.mjs`, viz oprava z předchozího kroku.)

  **Nová stránka `/pravidla`** (`src/app/(app)/pravidla/page.tsx`,
  odkaz "Pravidla" v horní liště appky, `app-header.tsx` — umístění
  odsouhlaseno s uživatelem přes `AskUserQuestion`, vidět na úplně
  každé přihlášené stránce). Vysvětluje obecné pravidlo (přesné skóre
  se počítá samostatně, jinak se body za výherce a góly celkem sčítají
  nezávisle — stejná logika jako `calculate_match_points()`) a pod tím
  živě z databáze vypisuje konkrétní počty bodů za soutěž (`points_exact`/
  `points_winner`/`points_total_goals` jsou nastavitelné per competition,
  dnes shodné 3/1/1 napříč všemi čtyřmi, ale appka na budoucí rozdílné
  hodnoty místo má). Stránka nemá vlastní auth kontrolu — spoléhá na
  middleware (`(app)` route group), stejně jako `/spaces`.

  **Landing page** (`src/app/page.tsx`, na dodatečnou žádost
  uživatele ve stejné konverzaci): kartičky lig v sekci "Co se právě
  klopí?" přepsány z jednořádkových "pilulek" na dvousloupcovou mřížku
  se stejnými popisky jako v databázi, doplněna chybějící Creme de la
  Creme liga (dřív na landing page vůbec nebyla, appka sledovala jen
  3 soutěže z původního seznamu) a pod mřížku přidán řádek s obecným
  bodováním (3/1/1, natvrdo stejně jako zbytek týhle veřejné stránky —
  nemá RLS přístup k živým datům, ty vidí přihlášený hráč na
  `/pravidla`).
- [x] **Tlačítko "Chci hrát" přímo na kartičce soutěže (6.9.2026)** —
  uživatel nahlásil, že se do soutěže dá přihlásit jen z jejího
  detailu, chtěl to rovnou z `/spaces` bez prokliku. `CompetitionCard`
  byla dřív celá jeden `<Link>` -- vnořit `<form>` (tlačítko) do `<a>`
  není platné HTML, prohlížeč by to vykreslil nepředvídatelně. Karta
  je teď `<div>` (vizuální rámeček/stín/barva) obsahující `<Link>`
  jen kolem klikatelného obsahu (logo/název/pozice/popisek) a vedle
  něj (mimo odkaz) samostatný `<form>` s tlačítkem "Chci hrát" —
  používá stejnou existující server akci `joinCompetition` jako detail
  soutěže, žádná nová logika. Nový nepovinný prop `isJoined`: `false`
  zobrazí tlačítko, `undefined` (výchozí, používá Dashboard) ho nikdy
  nezobrazí, protože Dashboard posílá jen soutěže, které hráč už hraje.
  Klik na tlačítko zůstává na `/spaces` (žádné přesměrování) — server
  akce revaliduje `/spaces`, takže karta se sama překreslí bez tlačítka
  hned po přihlášení.
- [x] **E-mailové upozornění na nevyplněný tip přehozeno na výchozí
  ZAPNUTO pro nové účastníky (6.9.2026)** — dřív bylo opt-in (vypnuto,
  viz rozhodnutí 28.8.2026), uživatel chtěl výchozí stav otočit.
  Rozsah odsouhlasen přes `AskUserQuestion`: platí jen pro NOVĚ
  vznikající řádky `competition_participants` (sloupcový default
  `email_reminders_enabled` přehozen z `false` na `true`,
  `supabase/migrations/20260906140000_email_reminders_default_enabled.sql`)
  — vědomě NEmění stávající účastníky, kteří si upozornění sami
  nezapnuli, ať appka nikomu nezačne posílat e-maily bez jeho vědomí.
  `joinCompetition` sloupec při insertu nevyplňuje, takže se nový
  default uplatní sám, žádná změna kódu nebyla potřeba — jen migrace.

  **Zjištěno 10.9.2026: migrace se mezitím nikdy nespustila.**
  Uživatel nahlásil "nefungují upozornění pro ostatní hráče" — ověřeno
  přes `db-probe.yml`: z 15 řádků `competition_participants` má
  `email_reminders_enabled = true` jen JEDEN (ručně zapnutý tlačítkem u
  jedné soutěže), včetně čtyř hráčů, kteří se přidali PO 6.9.2026 a
  podle tehdejšího rozhodnutí měli dostat `true` automaticky. Sloupcový
  default v produkční databázi byl pořád starý (`false`) — migrace
  `20260906140000_email_reminders_default_enabled.sql` čekala na ruční
  spuštění v Supabase SQL editoru (jako všechny migrace v tomhle
  projektu) a nikdy k němu nedošlo.

  **Řešení (10.9.2026):** uživatel migraci ručně spustil (`alter
  column ... set default true`) — default teď platí pro NOVĚ přidané
  účastníky od 10.9.2026 dál. Čtyři hráči, kteří se přidali mezi 6.9. a
  10.9. (tedy v okně, kdy default fakticky ještě neplatil), zůstávají
  vědomě `false` — uživatel se rozhodl NEzapínat jim to zpětně
  (`ať se to nastavuje až od teď novým hráčům`), ať appka nikomu
  nezmění chování bez jeho vlastního kliknutí. Beze změny kódu.

  **Poučení pro příště:** appka nemá žádný mechanismus, který by
  upozornil na migraci čekající v repu, ale nikdy nespuštěnou v
  Supabase — je to čistě na ruční evidenci v tomhle dokumentu/chatu.
  Při podezření na "appka se nechová podle posledního rozhodnutí" stojí
  za to nejdřív ověřit přes `db-probe.yml`, jestli sloupcový
  default/skutečná data v databázi odpovídají tomu, co říká poslední
  migrace v repu — ne jen číst kód.
- [x] **Oprava: appka na telefonu po delší pauze odhlašovala uživatele
  (6.9.2026, PR #108)** — uživatel nahlásil opakované odhlašování na
  mobilu, nejvýrazněji po delší pauze v používání appky. Rozhodující
  diagnostický vstup: screenshot Supabase Dashboardu (Authentication →
  Sessions), kde je zapnuté **"Detect and revoke potentially
  compromised refresh tokens"**.

  **Skutečná příčina** (ověřeno čtením zdrojového kódu
  `@supabase/auth-js`/`@supabase/ssr` v `node_modules`, ne odhadnuto):
  appka dřív nechávala `getCurrentUser()` (`src/lib/supabase/server.ts`,
  volané ze server komponent) volat `supabase.auth.getClaims()` přímo.
  `getClaims()` ale kromě ověření podpisu tokenu umí i obnovit
  session, když se blíží vypršení access tokenu — přesně tohle nastává
  po delší pauze. Server komponenty v Next.js ale nemají povoleno
  zapisovat cookie zpátky do prohlížeče (framework to tiše zahazuje,
  `try/catch` v `createClient()`), takže Supabase na svém serveru starý
  refresh token rotoval, ale prohlížeč se o novém nikdy nedozvěděl.
  Appka pak s prohlížečem chodila dál se starým, už jednou použitým
  refresh tokenem — a zapnutá ochrana "Detect and revoke..." na jeho
  další použití zareagovala tak, že rovnou zneplatnila CELOU session
  (ne jen ten jeden požadavek), což vypadalo přesně jako nahlášené
  časté odhlašování.

  **Oprava** (podle vlastního doporučení Supabase pro server-side
  Next.js auth): jen `src/lib/supabase/middleware.ts` (proxy, běží na
  každém požadavku jako první) teď smí volat `getClaims()`/obnovovat
  token, protože jen ono umí výsledek spolehlivě zapsat do cookie.
  Ověřenou identitu posílá dál přes vlastní hlavičky
  (`x-klopi-user-id`/`x-klopi-user-email`, mažou se na začátku KAŽDÉHO
  požadavku a nastavují se znovu jen podle kryptograficky ověřených
  claims, takže je klient nemůže podvrhnout) — `getCurrentUser()` v
  `server.ts` je teď jen čte, žádnou vlastní obnovu tokenu nespouští.
  `src/proxy.ts` kvůli tomu záměrně NEVYNECHÁVÁ prefetch požadavky
  (dřívější, nedokončený pokus o řešení stejného problému) — proxy teď
  musí běžet na úplně každém požadavku, protože je to jediné bezpečné
  místo pro obnovu session.

  Čeká se na potvrzení, že se problém po nasazení na `klopi.cz`
  na mobilu uživatele reálně vytratil.
- [x] **Nabídka soutěží novému hráči na Dashboardu (10.9.2026, PR #143)**
  — uživatel nahlásil, že nově příchozí hráč (0 soutěží) na Dashboardu
  prakticky nic nevidí, jen textovou větu s odkazem na `/spaces`.
  Uživatel navrhl a odsouhlasil v chatu: modal, který se hráči bez
  natipované soutěže ukáže hned po prvním vstupu na Dashboard a nabídne
  mu VŠECHNY soutěže s tlačítkem "Chci hrát" najednou — místo aby appka
  po prvním kliknutí zmizela zpátky na prázdný dashboard.

  Nová komponenta `src/components/join-competitions-modal.tsx` sdílí
  `CompetitionCard` (stejný vzhled/mechanismus jako na `/spaces`).
  **Technické řešení (moje, vysvětleno v chatu):** modal se otevře
  podle `myCompetitions.length === 0` čteného jen PŘI PRVNÍM vykreslení
  (`useState(shouldOpenInitially)`) — zůstane tak otevřený, i když hráč
  uvnitř přiklikne první soutěž a Dashboard (server komponenta) se
  kvůli `revalidatePath("/dashboard")` (nově doplněno do
  `joinCompetition`, dřív revalidoval jen `/spaces`) znovu vykreslí se
  zúženým seznamem. Jde tak přidat víc soutěží najednou. Zavře se jen
  ručně a při dalším načtení stránky se znovu ukáže pouze pokud hráč
  pořád nehraje nic — jakmile má aspoň jednu soutěž, appka ho tím dál
  neotravuje, na zbylé soutěže slouží `/spaces`.

  **Doladění na žádost uživatele ve stejném PR:** odkaz "Otevřít" na
  kartě uvnitř modalu byl matoucí (jediná nabízená akce má být "Chci
  hrát", proklik pryč by navíc modal opustil) — nový volitelný prop
  `CompetitionCard.linkToDetail` (výchozí `true`, beze změny na
  `/spaces`/Dashboardu) v modalu nastaven na `false`, vypíná proklik i
  odkaz zároveň.

  Před schválením ověřeno vizuálně (Playwright screenshot desktop/
  mobil/dark mode) přes dočasnou náhledovou stránku se smyšlenými daty
  — uživatel v tu chvíli hraje všechny soutěže appky, takže prázdný
  stav nešel reálně vyvolat jinak. Stránka i dočasná výjimka
  v middlewaru byly po pořízení screenshotů smazané, nešly do PR.

  **Doladění textu (10.9.2026, PR #145):** uživatel chtěl v modalu
  s gratulací k medaili za vítězství týdne (`badge-center.tsx`, jiná
  featura, ne tenhle modal) jasnější popisek — doplněno "Jsi vítěz
  týdne za soutěž(e): ...". Zmíněno tady jen kvůli časové návaznosti,
  detaily viz `BadgeCenter` výše (krok "Konsolidované upozornění na
  medaile za vítězství týdne", 29.8.2026).

- [x] **Revize a úklid zastaralých poznámek v tomhle dokumentu
  (10.9.2026)** — uživatel chtěl zrevidovat, co je na seznamu úkolů
  ještě opravdu otevřené (dokument je dlouhý a průběžně rostl, staré
  poznámky "čeká na ruční spuštění" se po doplnění migrace často
  nemazaly). Ověřeno přes `db-probe.yml` proti živým datům, ne jen
  čtením kódu/dokumentace:
  - `20260829220000_add_postponed_match_status.sql` (podpora pro
    odložené zápasy) — **potvrzeno spuštěno** (existuje reálný zápas
    se `status='postponed'`), poznámka "čeká na ruční spuštění" u
    kroku "Podpora pro odložené zápasy" výše je zastaralá.
  - `20260908130000_european_cups_description.sql` (popisky Ligy
    mistrů/Evropské ligy/Konferenční ligy) — **potvrzeno spuštěno**
    (popisky v databázi odpovídají migraci), poznámka "čeká na ruční
    spuštění" u kroku 23 níže je zastaralá.
  - `20260908070000_creme_description_variable_count.sql` (popisek
    Creme de la Creme ligy, "0–5 zápasů ze 16 lig") — **nebyla
    spuštěná**, uživatel ji spustil až při týhle revizi (10.9.2026).
  - `20260829090000_profiles_badges_seen_through.sql` — nešlo ověřit
    přes `db-probe.yml` (viz nový nález níže), uživatel potvrdil, že
    migraci nespustil dřív, a spustil ji teď (viz krok "Konsolidované
    upozornění na medaile" výše).
  - **Nový nález:** `service_role` nemá `SELECT` grant na
    `public.profiles` (osmý výskyt stejné třídy chyby jako u
    matches/competitions/predictions/weekly_badges/
    competition_participants, viz "Grants" výše) — proto šlo výše
    uvedenou migraci ověřit jen podle uživatelova slova, ne přes
    probe. Zatím neškodí, žádný sync skript pod service role klíčem
    tabulku `profiles` nečte. Uživatel se rozhodl **vyřešit později**
    (10.9.2026) — až bude potřeba, chybějící grant je stejný vzorec
    jako u předchozích sedmi výskytů (`GRANT SELECT ON
    public.profiles TO service_role;`).
  - Poznámka u kroku 18 ("Veřejná marketingová stránka") o appce
    zůstávající v Google OAuth "Testing" módu a plánu koupit
    `klopi.app` je **zastaralá** — OAuth je od 5.9.2026 veřejný (viz
    "Aktuální cíl" výše) a appka nakonec koupila `klopi.cz`, ne
    `klopi.app` (viz krok 20 níže). Ponecháno v textu jako historický
    záznam rozhodovacího procesu, ale neplatí už jako aktuální stav.
- [x] **Bodování hokejového prodloužení/nájezdů (11.9.2026)** —
  navazuje na "Hokejové prodloužení a nájezdy" ze sekce "Budoucí
  featury" výše, otevřené od začátku appky (`predicted_overtime_flag`
  se sbíral, ale nikdy nebodoval). Uživatel se zeptal, čím pokračovat
  po revizi dokumentace, a zvolil tohle — sezóna hokejové extraligy
  začíná 16.9.2026.

  **Produktová rozhodnutí (v chatu, ne přes `AskUserQuestion` — šlo o
  postupné upřesňování):**
  - Zadávané skóre je vždy **konečný výsledek** (jak je na
    výsledkovce, včetně rozhodujícího gólu z prodloužení/nájezdů) —
    žádná změna datového modelu, appka už takhle formulář měla
    postavený (dva nezávislé inputy — skóre + checkbox).
  - **Bodování**: `points_exact`/`points_winner`/`points_total_goals`
    zůstávají 3/1/1 stejné napříč VŠEMI sporty (ne jen fotbal) —
    uživatel nejdřív navrhoval snížit hodnotu přesného tipu u hokeje
    kvůli "loterii" nájezdů, pak se vrátil k původním 3 bodům
    ("přesný tip musí být odskočený"). Nový **`points_overtime`**
    (bod za správně tipnuté "bude/nebude prodloužení") se přičítá
    VŽDY nezávisle navíc, i když hráč trefí přesný tip — maximum za
    hokejový zápas je tak 4 body (3+1), o 1 víc než fotbalový strop 3.
  - Sdíleno napříč hokejem i "mixed" soutěžemi (Creme de la Creme) —
    appka totiž u KAŽDÉHO zápasu (ne soutěže) počítá efektivní sport
    (`match.sport ?? competition.sport`, `src/lib/sport.ts`), takže
    formulář checkbox "prodloužení/nájezdy" u fotbalových zápasů
    uvnitř Creme de la Creme nezobrazí a `points_overtime` se tam
    nikdy neuplatní bez jakékoliv výjimky v kódu.

  **Technické ověření (moje, přes uživatelem poslané reálné odkazy na
  zápasy + `playwright-probe.yml`):** livesport.cz uvnitř STEJNÉHO
  `.event__match` elementu, co appka už čte pro seznam výsledků,
  přidává u zápasu, co neskončil v základní hrací době, span
  `wcl-stageContent_fuKCx` s textem "Po prodl." (prodloužení) nebo
  "Po náj." (nájezdy) — u normální výhry element vůbec neexistuje.
  Ověřeno na DVOU různých ligách (běloruská hokejová liga, česká Maxa
  liga) se shodným výsledkem — vysoká jistota, že je to jednotná
  šablona napříč celým livesport.cz, včetně pěti hokejových lig v
  Creme de la Creme poolu (Tipsport extraliga, NHL, Tipos extraliga,
  SHL, National League). Appka nerozlišuje prodloužení od nájezdů
  (checkbox je jen jeden), takže detekce je jen "element existuje,
  nebo ne" — nezávisí na přesném textu.

  **Implementace:**
  - `supabase/migrations/20260911080000_competitions_points_overtime.sql`
    — nový sloupec `competitions.points_overtime` (default 1).
    `matches.overtime_flag` už existoval od úplně první migrace
    (`20260824120400_matches.sql`), jen se nikdy nezapisoval.
  - `supabase/migrations/20260911080100_scoring_trigger_overtime.sql`
    — `calculate_match_points()` rozšířen o nezávisle sčítaný OT bod
    (uplatní se jen když OBĚ strany — tip i skutečnost — mají
    vyplněnou hodnotu, takže u fotbalu, kde je `predicted_overtime_flag`
    vždy `null`, se nikdy neuplatní bez ohledu na to, co je zapsané
    v `matches.overtime_flag`).
  - `scripts/sync/lib/scrape-livesport.mjs` — `scrapeLivesportResults()`
    nově vrací `overtimeFlag` (boolean, `true` jakmile
    `wcl-stageContent_fuKCx` element existuje).
  - `scripts/sync/results.mjs` — zapisuje `matches.overtime_flag` na
    obou místech, kde appka ukládá dohraný zápas (běžná soutěž i
    "Náhodná liga"/Creme de la Creme přes `syncRandomPoolCompetition`).
  - `src/app/(app)/pravidla/page.tsx` — doplněn 4. bod vysvětlení
    ("Jen hokej — prodloužení/nájezdy") a `🏒 X b.` u soutěží se
    sportem `hockey`/`mixed` (u `football` se nezobrazuje, appka ho
    tam nikdy neuděluje).

  **Ruční krok uživatele**: spustit obě nové migrace v Supabase SQL
  editoru.

  **Vědomě neřešeno v tomhle kroku:** barevné odlišení kartičky zápasu
  (`getResultTone()`/`RESULT_TONE_CLASSES`, krok 8 výše) je postavené
  na 4 stupních sytosti jedné barvy (nic/jedno/obojí/přesně) a
  nepočítá se čtvrtou nezávislou osou OT — necháno beze změny, appka
  na to nemá zatím zadání a nový bodovací rozměr by tenhle vizuální
  systém komplikoval. Souvisí i s dřívější otevřenou otázkou "zda se
  správný tip na prodloužení boduje" ze sekce "Budoucí featury" —
  tahle featura ji řeší, položka se ze sekce odstraňuje.

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

   **Doplněno pro Premier League (5.9.2026, na žádost uživatele),
   zdroj [football-logos.cc](https://football-logos.cc).** Na rozdíl
   od Chance Ligy nejde o ZIP s PDF/AI (nutná konverze přes
   pdftoppm+ImageMagick), ale o rovnou hotové transparentní PNG přímo
   na stránce každého loga (`<meta property="og:image">` na
   `https://football-logos.cc/england/{slug}/`) — import je proto o
   dost jednodušší,
   viz `scripts/sync/import-logos-football-logos-cc.mjs` +
   `.github/workflows/import-logos-premier-league.yml` (ruční spuštění,
   bez schedule, stejná konvence jako u Chance Ligy). Mapování
   `team_name` → slug ověřeno přes `db-probe.yml` (distinct
   `home_team`/`away_team` pro Premier League) proti seznamu klubů na
   stránce ligy — 20 klubů, 20 slugů, jednoznačná shoda. Licenční
   podmínky ověřeny na `football-logos.cc/license/`: použití pro
   "informational, editorial, and fan-based purposes... non-commercial
   design work, and fan projects" povolené, komerční merchandise ne —
   Klopi jako nekomerční hra pro partu kamarádů do toho spadá. Import
   proběhl na první pokus (logo soutěže + všech 20 klubů), žádná
   změna appky/UI nebyla potřeba — appka už čte
   `competitions.logo_url`/`team_logos` obecně pro libovolnou soutěž.
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
    (odsouhlaseno přes `AskUserQuestion`): "Ještě netipováno" je
    samostatná sekce, oddělená od "Už tipnuto" (limit 5, stejný vzor
    jako "Proběhlé") — jakmile hráč zadá tip, zápas se sám přesune
    dolů. Když má hráč vyplněné úplně všechny nadcházející zápasy,
    zobrazí se místo prázdné sekce potvrzující hláška "✅ Máš vyplněné
    tipy na všechny nadcházející zápasy."

    **Výchozí počet zobrazených netipovaných zápasů = jedno kolo,
    dopřesněno uživatelem 28.8.2026** ("8 pro českou ligu, 10 pro
    Premier League"). Místo natvrdo zadrátovaných čísel podle názvu
    soutěže se počítá obecně z reálných dat: kolo odehraje každý tým
    jednou, takže počet zápasů v kole = počet týmů v soutěži ÷ 2.
    Ověřeno přes `db-probe.yml` (počet distinct `home_team`/`away_team`
    v `matches`): Chance Liga 16 týmů → 8 zápasů/kolo, Premier League
    20 týmů → 10, hokejová extraliga 14 týmů → 7 — přesně odpovídá
    zadání uživatele u prvních dvou lig, hokej dopočítán stejnou
    logikou. Řeší to obecně libovolný počet týmů/zápasů v kole
    u libovolné budoucí ligy bez zásahu do kódu. Zůstává `ExpandableList`
    (tlačítko "Zobrazit všechny") — kolo je jen výchozí zobrazení,
    nic se natrvalo neschovává, i kdyby hráč zaostal o víc než jedno
    kolo.
16. [x] Sekce "Probíhající" pro zápas, který se právě hraje —
    `src/app/(app)/spaces/[id]/page.tsx` +
    `src/app/(app)/spaces/[id]/matches/[matchId]/page.tsx` (28.8.2026,
    na žádost uživatele). Dřív zápas po výkopu rovnou spadl mezi
    "Proběhlé" (protože `isLocked` bralo v úvahu i "kickoff už
    proběhl", ne jen `status`), takže hráč tam během utkání viděl
    prázdnou kartičku bez skóre, jako by appka nevěděla, co se děje.

    **Technické zjištění (moje, vysvětleno v chatu):** `matches.status`
    už od úplně první migrace (`20260824120400_matches.sql`) povoluje
    hodnotu `'live'` vedle `'scheduled'`/`'finished'` — datový model na
    "probíhá" měl místo od začátku, jen ho scraper nikdy nevyužil
    (`sync-fixtures`/`sync-results` zapisovaly jen `scheduled`/
    `finished`). Ověřeno přes `playwright-probe.yml` na reálném živém
    zápase (Crystal Palace–Manchester City, 28.8.2026): livesport.cz
    zápas právě probíhající označí třídou `event__match--live`, ale
    **jen na stránce ligy bez přípony** (`/{scrape_path}/`) — na
    `/program/` už po výkopu zmizí, na `/vysledky/` se objeví až po
    skončení. Appka tedy zatím neměla žádný zdroj dat pro "probíhá".

    **Implementace:**
    - `scripts/sync/lib/scrape-livesport.mjs` — nová
      `scrapeLivesportLiveMatches()`, scrapuje stránku ligy bez
      přípony a vrací jen zápasy s třídou `event__match--live` (external_id
      + průběžné skóre).
    - `scripts/sync/results.mjs` — při každém běhu (stejný 30minutový
      rozvrh jako dosud) navíc zapíše `status='live'` + průběžné skóre
      pro nalezené živé zápasy. Jen `UPDATE` podle `external_id` (ne
      upsert/insert) — živý zápas byl v databázi vždy už dřív založen
      jako nadcházející přes `sync-fixtures`, a `validateResults()` u
      živého zápasu (na rozdíl od dohraných výsledků) nevyžaduje platný
      `kickoff_at` (nový parametr `requireKickoffAt: false` v
      `validate-results.mjs`) — livesport u živého zápasu místo data
      ukazuje běžící minutu.
    - Trigger `matches_calculate_points` se spouští jen na
      `status='finished'`, takže zápis `status='live'` nikdy
      nepřepočítá body předčasně.
    - Žádná nová migrace ani změna RLS nebyla potřeba — `MatchStatus`
      typ (`src/lib/supabase/database.types.ts`) i databázový `check`
      constraint `'live'` už povolovaly, a viditelnost tipů po výkopu
      (`predictions_select_own_or_locked`) se řídí `kickoff_at`/`status
      <> 'scheduled'`, což `'live'` už splňuje stejně jako dřív.

    **UI:** zápas patří do "Probíhající" (červený rámeček, 🔴), když
    `status === 'live'`, NEBO když `status` je pořád `'scheduled'`, ale
    `kickoff_at` už uplynul (mezera daná 30minutovým intervalem syncu —
    appka to přizná hláškou "Zápas právě začal, čekáme na aktuální
    skóre" místo aby zápas tiše spadl mezi "Proběhlé"). Sekce se
    zobrazuje mezi "Nadcházející" a "Proběhlé" v detailu soutěže i jako
    doplněk hlavičky na detailu zápasu.
17. [x] Dashboard jako vstupní stránka po přihlášení — viz "Stav" výše.
18. [x] **Veřejná marketingová stránka (29.8.2026).** Nejdřív navržena
    jako klikací design canvas přes `design` skill
    (https://claude.ai/code/artifact/02038569-751b-4306-a335-6b1cd8641366,
    desktop + mobilní pohled, stejné barvy/font/zaoblení jako zbytek
    appky), uživatel návrh schválil beze změn. Implementace:
    - `src/app/page.tsx` — nová veřejná úvodní stránka (dřív jen
      přesměrování na `/spaces`, pak na `/dashboard`). Hero s mottem
      appky, sekce "Co zrovna sledujeme" (reálné tři sledované ligy) a
      "Jak to funguje" (3 kroky bodování), patička s odkazem na Zásady
      ochrany osobních údajů. Tlačítka vedou na `/login` — tahle
      stránka nemá vlastní OAuth logiku, tu má pořád jen `/login`.
    - `src/app/soukromi/page.tsx` — nová stránka se Zásadami ochrany
      osobních údajů (Google vyžaduje odkaz na ni v OAuth consent
      screenu). Kontaktní e-mail pro výmaz/úpravu údajů (5.9.2026,
      odsouhlaseno přes `AskUserQuestion`): uživatelův osobní Gmail
      (`daniel.struhac@gmail.com`) — appka nemá firemní e-mail, jen
      osobní účet, a uživatel potvrdil, že jde použít ten. Případná
      změna na jinou adresu (např. po koupi vlastní domény, viz krok
      20) je čistě úprava dvou `mailto:` odkazů v tomhle souboru.
    - `src/lib/supabase/middleware.ts` — `/` a `/soukromi` přidány do
      `PUBLIC_PATHS` (dřív jen `/login`+`/auth/callback`). Přihlášený
      uživatel je z `/` (stejně jako z `/login`) rovnou přesměrován na
      `/dashboard` — landing stránku tedy reálně uvidí jen nikdy
      nepřihlášený návštěvník, přesně podle zadání.
    - `src/components/google-icon.tsx` — vícebarevné Google "G" logo
      přesunuto sem z `/login`, ať ho sdílí i nová landing stránka.

    **Vědomě odloženo:** appka zatím zůstává v Google OAuth "Testing"
    módu (viz sekce POC demo výše) — přepnutí na produkční mód je
    ruční krok v Google Cloud Console, na koupi domény `klopi.app` a
    na doplnění kontaktního e-mailu do Zásad ochrany osobních údajů.
    Uživatel avizoval, že se na obsah/vzhled týhle stránky ještě vrátí
    a bude ji ladit za běhu.
19. [x] **Spolehlivost `sync-results` (a dalších `schedule:` workflow)
    — vyřešeno (5.9.2026).** Uživatel 30.8.2026 nahlásil, že appka
    pořád nevyhodnocuje zápasy každých 30 minut, jak je nastaveno.
    Ověřeno na historii běhů `sync-results` (GitHub Actions): i po
    dřívější opravě (krok výše, PR #78 — přesun mimo celou/půlhodinu)
    jsou mezery mezi automatickými běhy 2–6 hodin místo 30 minut (např.
    30.8. 07:21→13:13 = 5 h 52 min, 29.8. 15:12→18:46 = 3 h 34 min).
    Všechny běhy skončily úspěšně (`success`) — příčina nebyla v appce
    ani síti, ale ve stejném zdokumentovaném, celoplošném problému se
    spolehlivostí GitHubova `schedule:` triggeru (GitHub Community
    Discussions #147369, #156282, viz poznámka u PR #78) — přesun mimo
    kolizní bod ho jen zmírnil, nevyřešil.

    **Řešení (moje doporučení, realizováno 5.9.2026):** appku teď
    "budí" externí bezplatná služba **cron-job.org** — každých 30
    minut zavolá GitHubovo API (`POST
    /repos/dstruhac/drew/actions/workflows/sync-results.yml/dispatches`),
    což GitHubu řekne "spusť workflow hned", nezávisle na jeho vlastním
    nespolehlivém plánovači. Uživatel si založil účet na cron-job.org a
    vytvořil fine-grained GitHub token s právem `Actions: Read and
    write` jen na `dstruhac/drew`. GitHubův vlastní `schedule:`
    (`7,37 * * * *`) zůstává navíc zapnutý jako neškodná záloha — appka
    si stejně nejdřív ověří v databázi, jestli je co dělat.

    **Cestou dvě chyby při zakládání tokenu, obě si appka/uživatel
    sami odchytili:**
    1. Token byl napoprvé vytvořený s "Repository access: Public
       Repositories (read-only)" — u týhle volby GitHub nedovolí
       nastavit VŮBEC ŽÁDNÁ oprávnění (proto se u tokenu ukazovalo "0
       repository permissions"), a je tedy natvrdo jen pro čtení bez
       ohledu na cokoliv jiného. Náš repozitář je veřejný, takže GitHub
       tuhle volbu nabízí jako lákavou zkratku — je to ale slepá cesta
       pro cokoliv, co má appka umět spouštět. Oprava: založit token
       znovu s "Only select repositories" → `dstruhac/drew`.
    2. cron-job.org v bezplatném tarifu neukazuje doslovné tělo
       odpovědi od GitHubu, jen vlastní parafrázi ("may block automated
       requests..."), takže z něj nešlo přesně poznat, o jakou chybu
       jde. Doplněna podpora pro HTTP metodu/tělo/`Authorization`
       hlavičku do existujícího diagnostického
       `.github/workflows/api-probe.yml` (token čtený z repository
       secretu `PROBE_AUTH_TOKEN`, nikdy z workflow_dispatch inputu, ať
       se nezobrazí nezamaskovaný) — tím se dal z GitHubu vytáhnout
       přesný text chyby (`"Resource not accessible by personal access
       token"`), který teprve ukázal skutečnou příčinu (bod 1 výše).
       `api-probe.yml` má tuhle podporu (metoda/tělo/auth hlavička)
       trvale, ať se dá použít i příště na jiný podobný problém.

    Ověřeno end-to-end 5.9.2026: ruční test v cron-job.org vrátil `204`
    a na GitHubu se podle toho reálně spustil běh `sync-results`
    (run #58, událost `workflow_dispatch`).
20. [x] **Vlastní doména `klopi.cz`** — koupena u Forpsi, připojena k
    Vercelu a ověřena 5.9.2026. Původní produkční URL se na ni
    přesměrovává; podrobnosti jsou v sekci „Jméno appky“ výše.
21. [x] **Diagnostika: přihlášení přes Google z klopi.cz skončí zpátky
    na nepřihlášené stránce — vyřešeno (5.9.2026).** Appka po
    dokončení Google OAuth měla skončit na `/dashboard` (kód v
    `src/app/auth/callback/route.ts` to už dělá — `next` parametr má
    výchozí hodnotu `/dashboard` od 29.8.2026), ale uživatel skončil
    zpátky na veřejné (nepřihlášené) stránce.

    **Ověřeno (GitHub Actions probe), co to NENÍ:** zavolání
    `https://rvcxdlmwxdykkxpqegzr.supabase.co/auth/v1/authorize?provider=google&redirect_to=https://klopi.cz/auth/callback`
    reálně doputuje až na skutečnou přihlašovací stránku Google se
    správným `client_id` appky — první část OAuth řetězu (Supabase →
    Google) tedy funguje a Google Cloud Console (Authorized origins) v
    tom problém není.

    **Pracovní hypotéza (nejde ověřit odsud, viz níže):** Supabase
    Auth má vlastní, samostatný seznam povolených návratových adres
    ("Redirect URLs" v Dashboardu), oddělený od Google Cloud Console.
    Když se appka 5.9.2026 přesunula na `klopi.cz`
    (`5f9fe45`), aktualizovalo se jen Google Cloud Console (Authorized
    origins) a `docs/PROJECT.md` — nikde není záznam, že by se zároveň
    přidalo `https://klopi.cz/**` do Supabase Auth Redirect URLs.
    Pokud tam chybí, Supabase po přihlášení v Google tichem přesměruje
    zpátky na svoji nastavenou výchozí "Site URL" (nejspíš pořád
    `drew-pink.vercel.app`, která se sice přesměruje na `klopi.cz`, ale
    už BEZ proběhlého `exchangeCodeForSession()`) — což by vypadalo
    přesně jako nahlášený bug. Nejde to ověřit z týhle session (seznam
    Redirect URLs není přes veřejné API čitelný, ověřeno probe
    workflow — `/auth/v1/settings` bez API klíče vrací jen 401, a i s
    klíčem podle Supabase dokumentace tenhle endpoint neobsahuje
    redirect URL seznam, jen zapnuté providery).

    **Potvrzeno uživatelem (5.9.2026, i v anonymním okně):** po
    přihlášení v Google appka reálně skončila na
    `https://www.klopi.cz/?code=...` — kód z Google tedy dorazil, ale
    na úvodní stránku (`/`), ne na `/auth/callback`, takže appka ho
    nikdy nepoužila k dokončení přihlášení (`exchangeCodeForSession`
    se nezavolal). Adresa navíc obsahuje `www.`, což appka jinde
    nikde nepoužívá — silný důkaz, že Supabase Auth má jako "Site URL"
    (svoji záložní adresu, na kterou skočí, když jí appkou poslaná
    návratová adresa `redirect_to` nesedí do jejího seznamu
    "Redirect URLs") nastavené něco s `www.`, ne holé `klopi.cz`.
    Hypotéza z minulého odstavce tím potvrzena.

    **Ruční oprava** (Supabase Dashboard → Authentication → URL
    Configuration, https://supabase.com/dashboard/project/rvcxdlmwxdykkxpqegzr/auth/url-configuration):
    Site URL přepsat na `https://klopi.cz` (bez `www.`) a do Redirect
    URLs přidat `https://klopi.cz/**` (`https://www.klopi.cz/**`
    přidáno pro jistotu navíc, staré řádky nemazat).

    **Ověřeno uživatelem 5.9.2026: funguje** — po opravě v Supabase
    Dashboardu přihlášení přes Google z `klopi.cz` teď doputuje až na
    `/dashboard`. Čistě konfigurační oprava mimo appku/repo, žádná
    změna kódu nebyla potřeba (diagnostika v kódu — výchozí `next` na
    `/dashboard` v `src/app/auth/callback/route.ts` — byla od začátku
    v pořádku).
22. [x] **"Creme de la Creme liga": noční kickoffy z výběru vyřazeny,
    doplněny 3 evropské poháry (8.9.2026)** — uživatel nahlásil, že mu
    ráno appka ukázala prázdno, i když `random-league.yml` proběhl
    večer předtím v pořádku. Diagnóza (log běhu +
    `db-probe.yml`): appka napříč všemi 13 tehdejšími ligami v poolu
    našla jen 1 kandidáta (Vitória–Grêmio, brazilská Série A) — všech
    12 evropských/severoamerických lig hlásilo 0 zápasů kvůli
    mezinárodní reprezentační přestávce. Ten 1 zápas appka správně
    zapsala, ale jeho kickoff (`2026-09-07 23:00 UTC` = `01:00`
    pražského času) vychází kvůli časovému posunu Brazílie (-5h) vždy
    na naši hlubokou noc — než se hráč ráno podíval do appky, zápas byl
    už dávno dohraný (appka ho stihla i vyhodnotit), takže "Nadcházející"
    sekce vypadala prázdná, i když appka technicky nic nerozbila.

    Rozhodnuto s uživatelem (přes `AskUserQuestion` + upřesnění v
    chatu):
    - **Noční kickoffy (0:00–5:59 pražského času) appka od teď do
      denního výběru vůbec nezahrne** (`NIGHT_HOUR_START`/`NIGHT_HOUR_END`
      v `random-league.mjs`, nová `getPragueHour()` v
      `scrape-livesport.mjs`) — týká se hlavně brazilské ligy, kde je to
      systémová vlastnost (kdykoliv appka vybere brazilský zápas, bude
      mít takhle nevhodný kickoff), ne jednorázová náhoda. V den, kdy by
      to znamenalo 0 zápasů, appka ukáže 0 — to už uměla a je to v
      pořádku (viz `PICK_COUNT` komentář).
    - **Doplněny 3 evropské poháry do poolu**: Liga mistrů, Evropská
      liga, Konferenční liga (`fotbal/evropa/liga-mistru` /
      `evropska-liga` / `konferencni-liga`, všechny 3 `scrape_path`
      ověřeny přes `playwright-probe.yml` 8.9.2026 na reálných zápasech
      — Real Madrid–Inter, AC Milán–Benfica, CSKA Sofia–Monako). Na
      rozdíl od domácích lig se hrají i během reprezentačních přestávek,
      takže doplňují přesně tu díru v poolu, kde dnešní incident vznikl.
      Pool má teď 16 lig (dřív 13).
    - **Popisek soutěže upraven** (`competitions.description`,
      `supabase/migrations/20260908070000_creme_description_variable_count.sql`)
      z napevno "5 nových zápasů" na "0–5 nových zápasů... ze 16 lig" —
      uživatel chtěl mít proměnlivý počet zápasů rovnou zapsaný
      v popisku appky, ať den s méně než 5 zápasy nepůsobí jako chyba.
23. [x] **Liga mistrů, Evropská liga a Konferenční liga jako 3 nové
    samostatné soutěže (8.9.2026)** — na žádost uživatele, pár hodin po
    kroku 22 výše, kde se stejné tři poháry přidaly jen jako zdroj
    zápasů uvnitř Creme de la Creme ligy. Uživatel chtěl navíc/odděleně
    i plnohodnotné sledované soutěže s vlastním žebříčkem — rozsah
    odsouhlasen přes `AskUserQuestion`:
    - **3 samostatné soutěže** (ne jedna sloučená "Evropské poháry"),
      stejná konvence jako Chance Liga vs. Premier League — každá má
      vlastní žebříček/kartičku/přihlašování hráčů.

    **Žádná změna kódu nebyla potřeba** — appka je od začátku napsaná
    obecně pro libovolnou soutěž na livesport.cz
    (`scripts/sync/fixtures.mjs`/`results.mjs` iterují přes VŠECHNY
    competitions s vyplněným `scrape_source`/`scrape_path`, ne přes
    natvrdo vyjmenovaný seznam). `scrape_path` hodnoty
    (`fotbal/evropa/liga-mistru` / `evropska-liga` / `konferencni-liga`)
    už byly ověřené z kroku 22 týž den. Postup stejný jako u dřívějšího
    přidání Premier League:
    1. `ensure-competition.yml` spuštěn 3× (založil "Liga mistrů",
       "Evropská liga", "Konferenční liga", `sport=football`,
       `scrape_source=livesport`).
    2. `sync-fixtures.yml` spuštěn ručně — rovnou zapsal rozpis i pro
       tyhle tři nové soutěže spolu se zbytkem.
    3. `sync-results.yml` spuštěn ručně — zpětně dotáhl případné už
       odehrané zápasy (ligová fáze Ligy mistrů/Evropské ligy/
       Konferenční ligy 2026/27 začíná v druhé půlce září, takže v
       době přidání šlo nanejvýš o předkola).
    4. Popisky (`competitions.description`) doplněny migrací
       `supabase/migrations/20260908130000_european_cups_description.sql`
       stejným vzorem jako u ostatních soutěží
       (`20260906120000_competitions_description.sql`). **Potvrzeno
       spuštěno** (ověřeno přes `db-probe.yml` 10.9.2026 — viz revize
       níže).

    Appka teď sleduje sedm soutěží: Hokejová extraliga 2026/27, Chance
    Liga, Premier League, Creme de la Creme liga, Liga mistrů, Evropská
    liga, Konferenční liga.

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

**Časté pády — vyřešeno (5.9.2026).** Uživatel nahlásil, že
`predict-reminders` často padá. Ověřeno na historii běhů (GitHub
Actions): opakovaná chyba `JWT issued at future` na jinak platný
service role klíč — přicházela v **shlucích** (víc běhů za sebou ve
stejném časovém okně, pak zase hodiny v pořádku), ne rovnoměrně napříč
dnem. To ukazuje na dočasný problém na straně **Supabase** (nesoulad
hodin mezi jejich servery), ne na appku — klíč je statický, jeho `iat`
se mezi voláními nemění, takže appka sama chybu nezpůsobuje.

Oprava (`scripts/sync/predict-reminders.mjs`): krátký automatický
retry (`withJwtRetry`, max 2 opakování po 3 s) na všech dotazech, kde
se tahle chyba objevila — čeká se jen pár sekund na to, až se Supabase
zase srovná. Vedlejší zjištění při vyšetřování: chyba vzniklá PŘED
per-uživatelskou smyčkou (např. tahle) dřív jen shodila proces s exit
code 1, aniž by se založil GitHub Issue — přestože skript má vlastní
hlášení chyb (`reportFailure`). Doplněn top-level `try/catch` okolo
`main()`, ať se nahlásí i tenhle typ pádu, ne jen selhání jednotlivého
odeslání e-mailu.

### Budoucí featury mimo současný rozsah (model na ně má místo, ale nestavíme)

Ze zadání explicitně odloženo, dokud si je uživatel nevyžádá:
- bonusové otázky ke dni
- skupiny/týmy uvnitř competition s vlastní tabulkou
- grace perioda na pozdní tip
- self-service zakládání competitions/matches běžnými uživateli (teď
  jen service role / SQL editor, viz RLS rozhodnutí výše)

### Pilotní stabilizace a automatické kontroly (5.9.2026)

- Google OAuth je otevřený všem a základní fungování aplikace je
  uživatelsky ověřené; začíná pilotní provoz.
- E-mailové upozornění bylo reálně doručeno. Odkaz na zápas se skládá z
  výchozího `https://klopi.cz` a cesty konkrétního zápasu; automatický
  test kontroluje, že se URL sestaví správně.
- Přidána společná kontrola chyb databázových dotazů. Neočekávaná chyba
  už nevypadá jako prázdná soutěž nebo chybějící tipy, ale zobrazí
  srozumitelnou obrazovku „Data se nepodařilo načíst“ s opakováním.
- Kořenové `pnpm check` spouští TypeScript a automatické testy. GitHub
  Actions je spouští na každém pull requestu a po změně `main`; zatím
  fungují jako viditelné upozornění, nikoliv povinná brána pro nasazení.

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
