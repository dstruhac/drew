# Klopi — kontext projektu

Živý dokument. Aktualizuje se po každé větší funkci nebo rozhodnutí, ať
kdokoliv (včetně budoucí Claude Code session) může kdykoliv navázat bez
ztráty kontextu. Viz `CLAUDE.md` pro trvalá pravidla, jak s tímto
repozitářem pracovat.

**Tohle je stručný přehled**, který se načítá automaticky na začátku
každé session (přes `@docs/PROJECT.md` v `CLAUDE.md`) — proto je záměrně
krátký a drží se jen toho, co je potřeba vědět pokaždé. Podrobná historie
rozhodnutí, objevených bugů a jejich oprav je v
**[`docs/HISTORY.md`](./HISTORY.md)** (nenačítá se automaticky, čti ho
na vyžádání — každý bod níže na relevantní místo v něm odkazuje). Viz
sekce "Údržba dokumentace" na konci pro to, kam psát co.

## Co to je

Tipovací hra na sportovní zápasy (hokej a fotbal) pro malou uzavřenou
skupinu uživatelů (kolegové, kamarádi). Uživatelé tipují skóre zápasů
před výkopem, po zápase se jim spočítají body.

Appka se jmenuje **Klopi** (zkrácenina "Klobása + Pivo" — věci, co podle
uživatele appku a partu kamarádů reálně spojují) a běží na vlastní doméně
**`klopi.cz`**. Historie přejmenování a volby domény: `HISTORY.md` →
"Jméno appky: Klopi" a "Vlastní doména klopi.cz".

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
    tuhle adresu)
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

- **profiles** — 1:1 k `auth.users`, `display_name` + `avatar_url` +
  `email_reminders_enabled` (globální přepínač e-mailových upozornění)
  + `badges_seen_through` (dedup upozornění na medaile). Auto-vytváří se
  triggerem `on_auth_user_created` při signupu.
- **competitions** ("spaces") — jedna tipovací soutěž/sezóna. `sport`
  (`hockey`/`football`/`mixed`) a `status` jsou `text` + `check`
  constraint (ne Postgres enum). Bodování (`points_exact`/
  `points_winner`/`points_total_goals`/`points_overtime`, výchozí
  3/1/1/1) je per-competition. `visibility` (`public`/`private`) —
  soukromé jsou uživatelsky založené "hecovačky" (vlastní
  `start_date`/`end_date`/`max_matches_per_day`/`invite_token`).
  `description` — krátký popisek zobrazený na kartičce.
- **matches** — zápasy uvnitř competition. `external_id` nullable
  (`NULL` = ručně vytvořený zápas mimo scraping). `status`:
  `scheduled`/`live`/`finished`/`postponed`. `sport`/
  `source_scrape_path`/`source_match_id` — vyplněné jen u zápasů
  sdílených napříč soutěžemi (Creme de la Creme liga, hecovačky), jinak
  `null` a appka použije sport/scrape_path z competition.
  `overtime_flag` — jen hokej.
- **predictions** — tip jednoho uživatele na jeden zápas
  (`predicted_overtime_flag` u hokeje). `is_locked` je jen zobrazovací
  flag; skutečné zamykání dělá RLS (`kickoff_at` **nebo** `status <>
  'scheduled'`, obě podmínky nezávisle — viz `HISTORY.md` → "Zamykání
  tipů").
- **competition_participants** — explicitní "hraju tuhle soutěž"
  (`competition_id`, `user_id`, `joined_at`, `email_reminders_enabled`
  — starý, dnes nepoužívaný sloupec, viz `HISTORY.md`, `added_by`,
  `notified_at`). Bez řádku tady appka nedovolí zadat tip v dané
  competition a hráč se neukáže v leaderboardu.
- **weekly_badges** — vizuální odznak za nejvíc bodů v kalendářním
  týdnu, zvlášť za každou competition (`competition_id, week_start,
  user_id, points` — všechny tři tvoří primární klíč, remíza = víc
  vítězů). Zapisuje jen `award-weekly-badges` (service role).
- **team_logos** — mapovací tabulka `(competition_id, team_name,
  logo_url)`, loga v Supabase Storage bucketu `logos`.
- **hecovacka_sources** — many-to-many, které veřejné soutěže smí
  appka použít jako zdroj zápasů pro danou hecovačku.
- **prediction_reminders_sent** — interní evidence "komu už dnes bylo
  posláno upozornění", žádná policy pro `authenticated`.

### RLS — trvalá pravidla (odsouhlaseno s uživatelem)

- **Viditelnost tipů**: před výkopem jen vlastní tip; po výkopu
  (`kickoff_at <= now()` NEBO `status <> 'scheduled'`) se odemknou tipy
  všech. Obě podmínky nezávisle — objevený bug, viz `HISTORY.md`.
- **Přihlášení do soutěže je podmínka pro tip** — vynuceno v DB
  (`competition_participants` řádek musí existovat), ne jen v UI.
- **Zakládání competitions/matches**: žádná insert/update/delete
  policy pro běžné uživatele u `public` soutěží (jen service role/SQL
  editor). Soukromé "hecovačky" má jejich zakladatel (přes
  `create_hecovacka()` SECURITY INVOKER funkci).
- **Soukromá viditelnost** (`visibility='private'`): `competitions` i
  `matches` pod nimi vidí jen tvůrce/participant, ne kdokoliv
  přihlášený.
- **Grants — opakovaně se vracející chyba (10+ výskytů):** Supabase u
  čerstvého projektu automaticky negrantuje přístup k novým tabulkám ve
  `public` schématu — bez explicitního `GRANT` selhává dotaz s
  "permission denied for table ...", ještě před vyhodnocením RLS.
  **Pravidlo do budoucna: u KAŽDÉ nové tabulky rovnou v migraci
  přidat `GRANT` pro `authenticated` i `service_role` na sloupce/akce,
  co budou reálně používané** — šetří to kolo "založ migraci → čekej na
  ostrý běh → zjisti chybějící grant → další migrace". Detailní seznam
  všech výskytů: `HISTORY.md` → "Grants".

### Vědomě NEimplementováno (ale místo v modelu na to je)

Bonusové otázky ke dni, skupiny/týmy uvnitř competition (mimo
hecovaček), grace perioda na pozdní tip. Přidají se jako nové
tabulky/sloupce, až budou potřeba.

## Aplikace (`src/`)

- `src/app/page.tsx` — veřejná landing stránka (nepřihlášení), `/login`
  — přihlašovací stránka (Google OAuth).
- `src/app/auth/callback/route.ts` — vymění OAuth `code` za session,
  přesměruje na `/dashboard` (nebo `?next=`).
- `src/app/(app)/` — route group (nemění URL) pro celou přihlášenou
  část appky: `dashboard/`, `spaces/`, `spaces/[id]/`,
  `spaces/[id]/leaderboard/`, `spaces/[id]/matches/[matchId]/`,
  `profil/`, `profil/[userId]/`, `pravidla/`, `hecovacky/`,
  `hecovacky/nova/`. Sdílí `layout.tsx` → `AppHeader`.
- `src/app/pozvanka/[token]/` — veřejná trasa (mimo `(app)`) pro
  pozvánkové odkazy do hecovaček, funguje i bez existujícího účtu.
- `src/components/app-header.tsx` — horní lišta: fotečka uživatele →
  `/profil`, odkaz Dashboard/Pravidla, `ThemeToggle`,
  `EmailRemindersToggle`, na mobilu schované v `MobileMenu`
  (hamburger).
- `src/proxy.ts` + `src/lib/supabase/middleware.ts` — na každém
  requestu ověří/obnoví session (`getClaims()`, jediné bezpečné místo
  pro obnovu tokenu — viz `HISTORY.md` → "odhlašování na mobilu"),
  nepřihlášené přesměruje na `/login`, identitu předává dál přes
  `x-klopi-user-id`/`x-klopi-user-email` hlavičky.
- `src/lib/supabase/{client,server}.ts` — browser/server Supabase
  klienti, `getCurrentUser()` (React `cache()`) jen ČTE ověřenou
  identitu z hlaviček, neobnovuje token sám.
- `src/lib/supabase/database.types.ts` — ručně psané typy podle
  migrací (žádné `supabase link`, takže ne generované). **Pozor**:
  každá tabulka musí mít i `Relationships: [...]` klíč, jinak
  postgrest-js typuje `select()` jako `never`.
- `src/lib/sport.ts` — efektivní sport zápasu (`match.sport ??
  competition.sport`) + `sportAccentStyle()` (barevný vibe fotbal
  zelená/hokej modrá).

## Aktuální stav: pilotní provoz ✅ (od 5.9.2026)

Základní tok appky je otestovaný, běží s reálnými hráči. Google OAuth
je veřejný (ne omezený testovacími e-maily). Appka sleduje **7
veřejných soutěží** (Hokejová extraliga, Chance Liga, Premier League,
Creme de la Creme liga, Liga mistrů, Evropská liga, Konferenční liga) s
rozpisy/výsledky automaticky importovanými scrapingem z livesport.cz,
plus uživatelsky zakládané soukromé "hecovačky".

## Co appka umí (shrnutí, chronologicky nejnovější dole)

Kompletní feature set — detailní historie/zdůvodnění každého bodu je v
`HISTORY.md` → "Stav appky — detailní log", stejné pořadí a nadpisy:

- [x] Základ: Next.js scaffold, SQL migrace (profiles/competitions/
  matches/predictions + RLS/grants), Supabase klienti, Google OAuth
  login, ochrana stránek, nasazení na Vercel/`klopi.cz`.
- [x] `/spaces` (přehled soutěží), `/spaces/[id]` (detail + zápasy),
  formulář na tip s auto-save a zamykáním po výkopu.
- [x] Leaderboard (celkový + živý týdenní, s přepínačem řazení
  Celkem/Průměr), detail zápasu se seznamem tipů všech hráčů.
- [x] Sekce Nadcházející (Ještě netipováno/Už tipnuto,
  okno 7 dní)/Probíhající/Odloženo/Proběhlé v detailu soutěže; na
  mobilu jako swipe carousel.
- [x] Skutečné členství (`competition_participants`) — "Chci hrát" jako
  podmínka pro tip, i přímo z kartičky na `/spaces`.
- [x] `sync-fixtures`/`sync-results` (scraping livesport.cz) — rozpis,
  výsledky, živé skóre, odložené zápasy, prodloužení/nájezdy u hokeje
  — všechno běží automaticky přes cron-job.org (GitHubův vlastní
  `schedule:` je nespolehlivý, viz `HISTORY.md`).
- [x] Medaile za vítězství týdne (`weekly_badges`) + konsolidované
  upozornění (modal/banner na Dashboardu).
- [x] Výkonová optimalizace (Dublin region, `getClaims()`, souběžné
  dotazy) — appka byla pomalá kvůli vzdálené databázi + sekvenčním
  dotazům, teď vyřešeno.
- [x] Loga soutěží a klubů (lfafotbal.cz, football-logos.cc, hokej.cz,
  footylogos.com) napříč všemi 7 soutěžemi.
- [x] Barevné odlišení kartičky zápasu podle úspěšnosti vlastního tipu
  (sytost sportovní barvy, ne tři různé barvy).
- [x] Veřejný profil hráče (`/profil/[userId]`).
- [x] Upozornění na nevyplněný tip e-mailem (Gmail SMTP) — dnes
  **jeden globální přepínač** v hlavičce appky (dřív per-competition,
  zjednodušeno 11.9.2026).
- [x] Grafický redesign (design tokeny, vysvícený nejbližší zápas,
  "banger" momenty, ikony `lucide-react`) + Dashboard jako vstupní
  stránka po přihlášení.
- [x] Ruční přepínač světlý/tmavý režim, sportovní barevný vibe
  (fotbal zelená/hokej modrá).
- [x] Hamburger menu na mobilu, odkaz Dashboard v hlavičkách všude.
- [x] "Creme de la Creme liga" (dřív "Náhodná liga") — denně 0–5
  náhodných zápasů ze 16 lig, noční kickoffy vyřazené z výběru.
- [x] Liga mistrů/Evropská liga/Konferenční liga jako 3 samostatné
  sledované soutěže (navíc k Creme de la Creme, kde jsou i zdrojem).
- [x] Veřejná landing stránka (`/`) + Zásady ochrany osobních údajů
  (`/soukromi`) + stránka `/pravidla` s bodováním.
- [x] **"Hecovačky"** — uživatelsky založené soukromé soutěže na
  pozvánku (sdílený odkaz i pro lidi bez účtu), appka duplikuje zápasy
  ze zvolených veřejných soutěží, zápasy se doplní hned při založení.
- [x] Oprava odhlašování na mobilu po delší pauze (token refresh jen
  v middlewaru, ne v server komponentách).
- [x] Nabídka soutěží novému hráči na Dashboardu (modal při 0
  soutěžích).
- [x] Náhledový obrázek appky při sdílení odkazu (`opengraph-image.tsx`).
- [x] Automatické kontroly: `pnpm check` (TypeScript + testy) v CI na
  každém PR a po změně `main` (zatím jen upozornění, ne povinná brána).

### Vědomě odloženo / mimo současný rozsah

Zadání explicitně odkládá, dokud si to uživatel nevyžádá: bonusové
otázky ke dni, obecné skupiny/týmy uvnitř competition (mimo
hecovaček), grace perioda na pozdní tip, kurzy sázkových kanceláří u
zápasů (technicky ověřeno proveditelné, ale dražší na scraping —
`HISTORY.md`).

## Otevřené / nerozpracované nápady

Zapsáno k budoucímu rozboru, **při navázání se nejdřív zeptej
uživatele, čím pokračovat** — pořadí níže není závazné:

1. **Týdenní reporty** (12.9.2026) — co obsahují, komu/jak/kdy se
   posílají, zatím neupřesněno s uživatelem.
2. **Rozšíření nastavení profilu hráče** (12.9.2026) — vlastní
   avatar/oblíbený tým/bio, zatím neupřesněno s uživatelem.

## Ruční kroky, na které appka čeká

Appka nemá mechanismus, který by sám upozornil na migraci ležící v
repu, ale nikdy nespuštěnou v Supabase — hlídá se to jen ručně tady a v
chatu. **Aktuálně nic nečeká** (revize 16.9.2026, po sloučení
"hecovaček" — všechny migrace k tomu datu potvrzené jako spuštěné).
Kdykoliv přibude nespuštěná migrace, zapiš ji sem jako checklist, ať se
neztratí (viz `HISTORY.md` → "Poučení pro příště" u e-mailových
upozornění, kde se přesně tohle jednou stalo).

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
(GitHub, npm, `WebSearch` ano; Supabase REST/Edge Functions, Vercel
API, Google, obecný internet z prohlížeče/Playwrightu ne). Proto nejde
nasazovat na Vercel ani ověřovat OAuth flow end-to-end automaticky —
tyhle kroky vždy provede uživatel ručně ve svém prohlížeči podle
instrukcí v chatu. Na ověřování dat/API z cizích domén slouží
`.github/workflows/api-probe.yml`/`db-probe.yml`/`playwright-probe.yml`
(GitHub Actions běží s plným internetem) — použij je dřív, než pošleš
uživatele něco ověřovat ručně.

## Údržba dokumentace (kam psát co)

Dokument je rozdělený na dva soubory od 16.9.2026 (appka do té doby
rostla jako jeden `PROJECT.md`, který se vyšplhal na ~2800 řádků a
načítal se celý při úplně každém promptu v každé session — zbytečný
tokenový náklad na věci, co se čtou jen zřídka).

- **`docs/PROJECT.md`** (tenhle soubor, auto-načítaný) — jen aktuální
  stav: co appka teď umí (jedna věta na featuru), aktuální datový
  model, účty/odkazy, jak navázat. Piš sem stručně — pokud popis
  featury přesáhne 2-3 řádky, patří detail do `HISTORY.md` a sem jen
  odkaz.
- **`docs/HISTORY.md`** (archiv, čte se jen na vyžádání) — všechno
  ostatní: proč jsme se rozhodli právě takhle, jaké bugy se cestou
  objevily a jak se opravily, jaké alternativy jsme zvažovali a
  zamítli, přesné datace a čísla PR. Piš sem stejně podrobně jako
  dosud — tahle podrobnost už jednou zachránila čas (např. historie
  opakovaně chybějících `GRANT`ů), jen ať se nečte pokaždé znovu.

Po každé větší dokončené funkci/rozhodnutí: krátký záznam do "Co appka
umí" v `PROJECT.md` (nebo do "Otevřené nápady", pokud se teprve
plánuje) + podrobný zápis do `HISTORY.md`. Neptej se na to, dělej to
průběžně — stejně jako dřív.
