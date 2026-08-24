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

### RLS rozhodnutí (odsouhlaseno s uživatelem)

- **Viditelnost tipů**: před výkopem vidí uživatel jen svůj vlastní
  tip; po výkopu (`kickoff_at <= now()`) se odemknou tipy všech.
  Zabraňuje opisování.
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
  `authenticated` roli přístup k novým tabulkám ve `public` schématu —
  bez explicitního `GRANT` selhávají dotazy s "permission denied for
  table ...", ještě před vyhodnocením RLS politik. Viz
  `supabase/migrations/20260825090000_grants.sql`.

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
- `src/app/spaces` — server komponenta, načítá `competitions` z DB,
  zobrazuje kartičky + odhlašovací tlačítko (server action)
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

## Stav (aktualizováno 2026-08-25)

Hotovo:
- [x] Scaffold Next.js + TS + Tailwind
- [x] SQL migrace (profiles, competitions, matches, predictions + RLS + grants)
- [x] Supabase klienti (browser/server/proxy)
- [x] Login stránka + funkční Google OAuth
- [x] Ochrana stránek podle přihlášení
- [x] Nasazení na Vercel (https://drew-pink.vercel.app)
- [x] `/spaces` načítá reálné competitions z DB
- [x] První competition založená ručně: "Hokejová extraliga 2026/27" (hockey)
- [x] `/spaces/[id]` — detail soutěže se seznamem zápasů
- [x] Formulář na tip (predictions) — upsert přes server action, disabled/readonly po zamčení (kickoff_at v minulosti)

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
4. [ ] Leaderboard / žebříček za competition
5. [ ] Import zápasů/výsledků z externího API (hokej, fotbal) +
   Edge Function + `pg_cron` — teprve až bude jasné, který API zdroj
   se použije (nevybráno, nutno probrat s uživatelem)

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
