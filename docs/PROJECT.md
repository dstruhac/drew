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
- [x] Leaderboard / žebříček za competition — `src/app/spaces/[id]/leaderboard/page.tsx`
- [x] Sekce "Nadcházející"/"Proběhlé" v detailu soutěže

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
5. [ ] Import zápasů/výsledků z externího API (hokej, fotbal) +
   Edge Function + `pg_cron` — teprve až bude jasné, který API zdroj
   se použije (nevybráno, nutno probrat s uživatelem).

   **➡️ Podrobný návrh architektury je v
   [`docs/IMPORT-ARCHITECTURE.md`](./IMPORT-ARCHITECTURE.md)** —
   klouzavé okno místo "kol", dvě naplánované úlohy, odhad spotřeby
   requestů, potřebné změny datového modelu.

   **Sledované soutěže (odsouhlaseno 2026-08-25):** hokej = česká
   hokejová **Tipsport extraliga**, fotbal = česká **Chance Liga**.
   Tohle je důležité, protože dostupnost/cena API se dost liší podle
   toho, jde-li o velkou mezinárodní ligu, nebo lokální českou soutěž.

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

   **Můj (Claude) doporučený výchozí bod:** TheSportsDB, protože
   pokrývá obě ligy jedním API a je nejlevnější na rozjezd — ale
   uživatel to zatím nepotvrdil, čeká se na finální rozhodnutí.
6. [ ] Loga lig — zobrazit logo soutěže (competition) na `/spaces` a
   v jejím detailu. Otevřená otázka: odkud logo bere (upload do
   Supabase Storage vs. URL sloupec u `competitions`) — probrat při
   implementaci.
7. [ ] Loga týmů u zápasů. **Otevřená otázka (2026-08-25, vědomě
   odloženo):** `matches.home_team`/`away_team` jsou dnes prostý text,
   žádná centrální evidence týmů neexistuje. Při implementaci nejdřív
   s uživatelem probrat a rozhodnout mezi (a) centrální tabulkou týmů
   s logem, na kterou by se zápasy musely přepsat, nebo (b) samostatnou
   mapovací tabulkou "název týmu → logo" bez zásahu do `matches`.
8. [ ] Barevné odlišení kartičky zápasu podle skóre. **Otevřená otázka
   (2026-08-25, vědomě odloženo):** není určeno, jestli barva má
   odrážet body získané za vlastní tip uživatele (zelená/žlutá/šedá
   podle úspěšnosti tipu), nebo výsledek zápasu samotného (výhra
   domácích/hostů/remíza). Rozhodnout s uživatelem před implementací.
9. [x] Rozdělení zápasů v detailu soutěže do sekcí "Nadcházející" a
   "Proběhlé" — `src/app/spaces/[id]/page.tsx`. Zápas patří do
   "Proběhlé", jakmile je zamčený (stejná podmínka jako dřívější
   `isLocked`: `status <> 'scheduled'` nebo `kickoff_at` v minulosti),
   jinak do "Nadcházející". "Nadcházející" řazeno vzestupně (nejbližší
   nahoře), "Proběhlé" sestupně (nejnovější výsledek nahoře). Sekce se
   zobrazí jen když v ní jsou nějaké zápasy.

### Nápad: medaile/odznaky za vítězství (2026-08-25, nerozpracováno)

Uživatel navrhl herní prvek navíc k celkovému žebříčku: nějaká forma
odměny (medaile/odznak/kartička, případně "rank"/level), kterou hráč
dostane za vítězství v kratším časovém úseku — např. samostatná
tabulka/žebříček **za daný týden**, a vítěz týdne dostane medaili nebo
mu stoupne rank. Úmysl je zvýšit motivaci hrát pravidelně, ne jen
sledovat jeden dlouhodobý celkový žebříček.

Uživatel to ještě nemá plně rozmyšlené — než se začne implementovat,
je potřeba společně probrat aspoň:
- **Perioda**: přesně týden (po-ne)? Herní kolo/matchday? Nebo
  konfigurovatelné za competition?
- **Co uživatel reálně dostane**: vizuální odznak/medaile (obrázek),
  číselný "rank"/level, který roste, nebo obojí?
- **Kde se to zobrazí**: u jména na leaderboardu, na nějakém profilu
  hráče (ten zatím v appce vůbec neexistuje jako samostatná stránka),
  obojí?
- **Řešení remíz**: co když je na první příčce daného týdne víc hráčů
  se stejným počtem bodů?
- **Rozsah**: platí to napříč celou competition (viz. napříč sporty?),
  nebo je to nezávislé pro každou competition zvlášť?
- **Datový model**: pravděpodobně nová tabulka na "úspěchy"/odznaky
  (např. `achievements`/`user_achievements`) + logika, která
  periodicky (podobně jako budoucí import výsledků) vyhodnotí
  vítěze periody. Nic z tohoto zatím neexistuje.

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

**2) Vlastní přezdívka** — uživatel by si mohl změnit `display_name`,
který se ukazuje na leaderboardu (dnes se nastaví automaticky při
signupu z Google jména). Dobrá zpráva: RLS politika
`profiles_update_own` už existuje a update vlastního profilu povoluje
— jde tedy hlavně o UI (formulář/stránka nastavení), ne o změnu
zabezpečení.

**3) Detail/profil uživatele** — nová stránka, která by u daného
hráče ukázala, kterých soutěží se účastní. Otevřené otázky: má to být
veřejné (kdokoliv přihlášený vidí cizí profil), nebo jen svůj vlastní?
Ukazovat jen seznam soutěží, nebo i statistiky/historii tipů?

**4) Upozornění na nevyplněný den** — např. e-mail (uživatel má
mail z Google OAuth) cca 2 hodiny před prvním zápasem daného dne v
dané soutěži, pokud na ten den ještě nemá tip. Technicky pravděpodobně
sdílí infrastrukturu s budoucím importem výsledků (krok 5 v plánu) —
periodická úloha (`pg_cron` + Supabase Edge Function), která by
kontrolovala nadcházející zápasy a chybějící tipy a přes nějakou
e-mailovou službu (např. Resend) poslala zprávu s odkazem zpět do
appky. Otevřené otázky: e-mail vs. jiný kanál, přesné časování, jestli
se posílá jednou za den souhrnně, nebo per zápas.

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
