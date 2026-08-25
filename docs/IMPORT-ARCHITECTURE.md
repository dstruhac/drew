# Import zápasů a výsledků — návrh architektury

Návrh, jak se do appky budou automaticky dostávat zápasy (rozpis) a
jejich výsledky, aby je nikdo nemusel zadávat ručně přes SQL editor.

Stav: **návrh, neimplementováno.** Čeká na ověření dostupnosti lig
u konkrétního API (viz "Co je ještě potřeba ověřit" na konci).

Sledované soutěže (odsouhlaseno s uživatelem):
- fotbal — česká **Chance Liga**
- hokej — česká **Tipsport extraliga**

## Klíčové rozhodnutí: nepracujeme s pojmem "kolo"

Uživatel původně uvažoval "v pondělí načtu zápasy na celé kolo". To je
křehké — kolo se může hrát přes víkend, ale i ve středu, a jednotlivé
zápasy se **přesouvají** (počasí, televizní přenosy, poháry).

Místo toho se používá **klouzavé okno**: každý den se znovu načte
rozpis na následujících ~21 dní a zapíše se přes `upsert`. Tím se
samo vyřeší všechno najednou:

- **nový zápas** v rozpisu → vloží se
- **přesunutý zápas** → jen se přepíše `kickoff_at` u stávajícího
  řádku (klíčem je `external_id`, ne datum), nevznikne duplikát
- **středeční/nestandardní termín** → není co řešit, okno pokrývá
  všechny dny bez ohledu na "kolo"

Tohle funguje díky tomu, že `matches` už dneska má sloupec
`external_id` a nad ním unikátní index
`matches_competition_external_id_key (competition_id, external_id)`
— přesně na tohle byl od začátku připravený.

## Dvě naplánované úlohy

### Úloha A — `sync-fixtures` (rozpis zápasů)

- **Kdy**: 1× denně, ~04:00
- **Co dělá**: pro každou aktivní soutěž s vyplněným mapováním na API
  stáhne rozpis zápasů v okně `[dnes, dnes+21 dní]`
- **Kam zapisuje**: `upsert` do `matches` podle
  `(competition_id, external_id)` — aktualizuje `home_team`,
  `away_team`, `kickoff_at`, `status`
- **Spotřeba**: 1 požadavek na soutěž = **2 požadavky/den**

### Úloha B — `sync-results` (výsledky)

- **Kdy**: každých 30 minut, ale jen v okně ~15:00–01:00
- **Nejdřív se ptá vlastní databáze (zdarma!)**: existují dnes (nebo
  včera) zápasy, které mají `kickoff_at` v minulosti a zároveň
  `status <> 'finished'`? Pokud ne → **skončí bez jediného volání
  API**. Tohle ušetří většinu požadavků, protože ani jedna liga nehraje
  každý den.
- **Co dělá**: jen pro soutěže, kde takový zápas existuje, stáhne
  zápasy daného dne a u dohraných zapíše `home_score`, `away_score`,
  `status='finished'` (u hokeje i `overtime_flag`)
- **Body se přepočítají samy**: v databázi už existuje trigger
  `matches_calculate_points`, který se spustí přesně ve chvíli, kdy
  zápas dostane `status='finished'` a skóre. Import tedy body vůbec
  nemusí počítat.
- **Spotřeba**: 0 ve dnech bez zápasů; ve dnech se zápasy zhruba
  4–10 požadavků na ligu (začne se ptát až ~100 minut po prvním
  výkopu a přestane, jakmile jsou všechny dnešní zápasy dohrané)

### Proč nemusíme řešit "kdy přesně zápas skončí"

Uživatel správně poznamenal, že zápasy končí v různé časy. Nemusíme to
ale vůbec počítat — API u každého zápasu vrací **stav** (např. `FT` =
konec, `NS` = ještě nezačal). Úloha B se prostě periodicky ptá a
reaguje na stav. Jakmile jsou všechny dnešní zápasy ve stavu "dohráno",
přestane se ptát.

## Odhad spotřeby požadavků

| | požadavků/den |
|---|---|
| Úloha A (rozpis) | 2 |
| Úloha B, den bez zápasů | 0 |
| Úloha B, hraje jedna liga | ~4–10 |
| Úloha B, hrají obě ligy | ~8–20 |
| **Nejhorší reálný den celkem** | **~22** |

Free tarif API-Football/API-Sports má **100 požadavků/den** (a 10/min).
Vejdeme se s velkou rezervou i na opakování při chybách.

## Kde to poběží

- **Supabase Edge Functions** (TypeScript/Deno) — dvě funkce,
  `sync-fixtures` a `sync-results`
- **`pg_cron`** je spouští podle rozvrhu (voláním přes `pg_net`)
- Proč ne Vercel Cron: free tarif Vercelu neumožňuje běh častěji než
  1×/den, což pro úlohu B nestačí

Edge Function běží se **service role** klíčem, takže obchází RLS a může
zapisovat do `matches` (běžný uživatel na to nemá právo — to je
záměr, viz RLS rozhodnutí v `PROJECT.md`).

**API klíč se ukládá jako Edge Function secret v Supabase Dashboardu,
nikdy do repozitáře.**

## Potřebné změny v datovém modelu

Aby se vědělo, která soutěž odpovídá které lize v API:

```sql
alter table public.competitions
  add column external_provider text,     -- např. 'api-sports'
  add column external_league_id text,    -- id ligy v tom API
  add column external_season text;       -- např. '2026'
```

Soutěž bez vyplněného mapování se prostě přeskočí (ruční soutěže jako
současné demo tak fungují dál beze změny).

Dále tabulka na log běhů, ať je vidět, co se kdy stáhlo a co selhalo:

```sql
create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references public.competitions (id) on delete cascade,
  job text not null,              -- 'fixtures' | 'results'
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  requests_used int,
  matches_upserted int,
  error text
);
```

## Mapování stavů zápasu

API vrací vlastní kódy stavů, které se musí přeložit na naše
`scheduled` / `live` / `finished`:

| API (fotbal) | naše `status` |
|---|---|
| `NS` (not started) | `scheduled` |
| `1H`, `HT`, `2H`, `ET` | `live` |
| `FT`, `AET`, `PEN` | `finished` |
| `PST` (odloženo), `CANC` (zrušeno) | viz níže |

U hokeje navíc stav "po prodloužení/nájezdech" → `overtime_flag = true`
(zatím se nebodu­je, ale ukládá se).

## Otevřené otázky k rozhodnutí

1. **Odložený/zrušený zápas.** Když API řekne `PST`/`CANC`, co s ním?
   *Návrh:* zápas nemazat (smazáním by kvůli `on delete cascade`
   zmizely i tipy hráčů). Odložený s novým datem → jen se přepíše
   `kickoff_at` a zůstane `scheduled`. Zrušený → potřebovali bychom
   nový stav `cancelled` a vyloučit ho z bodování.
2. **Názvy týmů.** API má vlastní podobu názvů (např. "Sparta Prague"
   vs "Sparta Praha"). *Návrh:* brát názvy z API jako závazné —
   `matches.home_team`/`away_team` jsou dnes prostý text, takže to nic
   nerozbije. Bonus: API obvykle vrací i **URL loga týmu**, což by
   skoro zadarmo vyřešilo odložený krok 7 (loga týmů) v plánu.

## Ověřeno na reálných datech (25.8.2026)

Přes `api-probe.yml` (GitHub Actions) byly zavolány reálné endpointy
TheSportsDB s veřejným testovacím klíčem `3`. Výsledky:

**TheSportsDB má obě sledované ligy, s daty na aktuální sezónu
2026-2027** — potvrzeno konkrétními zápasy:

| liga | `idLeague` | ukázka z odpovědi |
|---|---|---|
| Czech First League (Chance Liga) | `4631` | Baník Ostrava vs Sigma Olomouc, 29.8.2026 18:00 UTC, 6. kolo |
| Czech Extraliga (Tipsport extraliga) | `4923` | Motor České Budějovice vs Mladá Boleslav, 16.9.2026 15:30 UTC, 1. kolo |

**Odpověď obsahuje všechna pole, která import potřebuje:**

| pole v API | použití u nás |
|---|---|
| `idEvent` | `matches.external_id` (stabilní klíč pro upsert) |
| `strTimestamp` (UTC) | `matches.kickoff_at` |
| `strHomeTeam` / `strAwayTeam` | `matches.home_team` / `away_team` |
| `intHomeScore` / `intAwayScore` | `matches.home_score` / `away_score` |
| `strStatus` (`NS`, …) | `matches.status` |
| `strPostponed` (`yes`/`no`) | **řeší otevřenou otázku s odloženými zápasy** |
| `intRound` | zatím nepoužito, ale k dispozici |
| `strHomeTeamBadge` / `strAwayTeamBadge` | **loga týmů — krok 7 plánu skoro zadarmo** |
| `strLeagueBadge` | **logo ligy — krok 6 plánu skoro zadarmo** |

**Zásadní omezení: bezplatný klíč ořezává počet výsledků.**
`eventsday.php` vrátil pro 29.8. i 30.8. shodně přesně **3 položky**,
což odpovídá dokumentovanému limitu tohoto endpointu ("Free Limit: 3",
Premium 1500). U `eventsnextleague.php` vrátil dokonce jen 1 položku.
Není to tedy skutečný počet zápasů toho dne — chybějící zápasy by se
prostě **tiše nenaimportovaly**, což je horší než chyba, protože by si
toho nikdo nemusel všimnout.

→ **Pro ostrý provoz je potřeba placený klíč** (TheSportsDB Patreon,
$9/měsíc). Návrh architektury výše zůstává beze změny, jen se nedá
provozovat na testovacím klíči.

Mimochodem, TheSportsDB u každého zápasu vrací i `idAPIfootball`
(např. `1560005`) — což je nepřímé potvrzení, že **API-Football tuhle
ligu taky má**, kdyby padla volba na něj.

## Jak se ověřuje (probe workflow)

Nic z toho nejde ověřit přímo z Claude Code session — sandbox blokuje
odchozí přístup na sportovní API i na `supabase.co` (ověřeno curlem,
403 na CONNECT). Proto vznikl **probe workflow**
(`.github/workflows/api-probe.yml`): GitHub Actions běží s plným
internetem, zavolá zadanou URL a vypíše odpověď do logu, který si
Claude umí přečíst zpátky přes GitHub API — takže si ověřuje reálná
data sám, bez ručního kopírování.

Workflow jde spustit i z větve (`ref` = jméno větve), takže se dá
testovat i jeho vlastní úprava, dokud není v `main`.

## Zbývá rozhodnout / ověřit

## api-sports.io — ověřeno reálnými dotazy (25.8.2026)

Se skutečným klíčem (GitHub secret `API_SPORTS_KEY`) byly přes probe
workflow zavolány oba jejich API. Výsledek:

**Obě naše ligy tam jsou:**

| sport | endpoint | liga | id |
|---|---|---|---|
| fotbal | `v3.football.api-sports.io` | Czech Liga (Chance Liga) | **345** |
| hokej | `v1.hockey.api-sports.io` | Extraliga | **10** |

U fotbalu je celkem 17 českých soutěží (FNL `346`, pohár `347`, …),
u hokeje má Extraliga sezónu 2026 od 16.9.2026 do 5.3.2027.

**Kvóty se skutečně počítají zvlášť pro každé API** (potvrzeno
z hlaviček: po dotazu na fotbal `requests-remaining: 98`, na hokej
současně `99`):

```
x-ratelimit-limit: 10             (za minutu)
x-ratelimit-requests-limit: 100   (za den, na každé API zvlášť)
```

**❌ Ale bezplatný tarif nepustí aktuální sezónu.** Dotaz na zápasy
vrátí u fotbalu i hokeje shodně:

```json
"errors": { "plan": "Free plans do not have access to this season,
                     try from 2022 to 2024." }
```

Seznam lig a sezón se načte, **zápasy sezóny 2026 ale ne**. Bezplatný
tarif je tedy pro živou tipovací hru nepoužitelný.

**Cena za zpřístupnění aktuální sezóny:** tarify jsou per-API, takže
fotbal i hokej = **dvě předplatná**, nejlevnější Pro à $19/měsíc →
**~$38/měsíc**.

## SportAPI7 (RapidAPI) — ověřeno reálným dotazem (25.8.2026)

Uživatel navrhl k prozkoumání i https://rapidapi.com/rapidsportapi/api/sportapi7/pricing
(wrapper nad daty Sofascore). Klíč uživatel vložil přímo do chatu —
protože je repo `dstruhac/drew` **veřejné** a logy Actions běhů jsou
tedy čitelné komukoliv, klíč se **nikdy neposlal jako obyčejný vstup
workflow** (to by ho vypsalo do veřejného logu). Místo toho ho uživatel
sám vložil jako GitHub secret (`Settings → Secrets → Actions →
RAPIDAPI_KEY`) a `api-probe.yml` byl upraven, aby ho automaticky použil
(rozpozná se podle názvu hlavičky `x-rapidapi-key`) a zároveň doplnil
povinnou druhou hlavičku `x-rapidapi-host`, kterou RapidAPI vyžaduje.

**Data reálně fungují** — dotaz `search/all?q=czech` vrátil HTTP 200 a
skutečná data (českou reprezentaci, ligy, `Czech First League` id `172`
atd.), takže by šlo najít i Chance Ligu a Tipsport extraligu.

**❌ Ale kvóta bezplatného plánu je pro provoz appky nepoužitelná.**
Odpověď obsahovala tyto hlavičky:

```
x-ratelimit-requests-limit: 50
x-ratelimit-requests-remaining: 49
x-ratelimit-requests-reset: 2678114        (≈ 31 dní)
```

Tedy **50 požadavků za měsíc celkem**, ne za den. Pro srovnání: i jen
samotná Úloha A (rozpis zápasů, 1× denně) by potřebovala ~30–60
požadavků měsíčně podle počtu soutěží — tedy by vyčerpala **celou**
měsíční kvótu sama o sobě, ještě než by se vůbec začaly stahovat
výsledky (Úloha B). Nemá tedy smysl dál ověřovat, jestli SportAPI7 obě
ligy skutečně obsahuje (u task A i B dohromady bychom kvótu překročili
o řád) — na rozdíl od TheSportsDB (limit je "jen" na počet výsledků v
jedné odpovědi, ne na počet požadavků) nebo api-sports.io (100/den =
~3000/měsíc, na každé API zvlášť) je 50/měsíc o dva řády míň, než appka
potřebuje. Zbylých 49 z 50 požadavků zůstává nevyčerpaných pro jiné
budoucí ověřování.

## Závěr: doporučený zdroj

**TheSportsDB Premium, $9/měsíc.**

| | TheSportsDB | api-sports.io |
|---|---|---|
| obě ligy | ✅ ověřeno | ✅ ověřeno |
| aktuální sezóna zdarma | ✅ ano (data 2026-2027 přišla) | ❌ ne (jen 2022–2024) |
| omezení zdarma | max 3 výsledky na dotaz | aktuální sezóna zablokovaná |
| cena za plný provoz | **$9/měsíc** (jedno API pro oba sporty) | **~$38/měsíc** (2× $19) |
| loga týmů a ligy | ✅ v odpovědi | ✅ v odpovědi |

Rozdíl je zásadní v tom, **co si za peníze kupuješ**: u TheSportsDB
platíš za odstranění stropu na počet výsledků (data aktuální sezóny
chodí i zdarma), u api-sports.io platíš za vůbec jakýkoliv přístup
k aktuální sezóně, a to dvakrát.

Záložní zdroje (Sportmonks, oficiální API Českého hokeje) jsou
popsané v `PROJECT.md` u kroku 5.

## Poučení k probe workflow

Při ověřování se stala chyba, která vedla k opačnému závěru, než jaká
byla pravda: `max_chars` ořezává **i cílený jq výběr**, takže při
`max_chars=150` zmizela hledaná liga z výpisu a vypadalo to, že ji API
nemá. Workflow proto teď u oříznutého výběru vypisuje varování.
**U výběru, ze kterého se dělá závěr, dávej `max_chars` velkoryse.**
