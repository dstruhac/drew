@AGENTS.md
@docs/PROJECT.md

# Jak pracovat na tomto projektu (Drew)

Uživatel je netechnický ("jsem kopyto") — vede ho vlastní preference,
ne technická zkušenost. Tahle pravidla platí pro každou session, ne
jen tuhle konverzaci.

## Rozhodování

- **Nikdy si nic nevymýšlej u produktových/UX rozhodnutí.** Cokoliv, co
  není už jednou odsouhlasené v `docs/PROJECT.md` nebo v konverzaci
  (např. jak se má tabulka jmenovat, co se má zobrazit, jaké chování
  zvolit u hraničního případu), se nejdřív zeptej — ideálně přes
  `AskUserQuestion` s konkrétními, srozumitelnými možnostmi (ne
  technickým žargonem).
- Drobné implementační detaily (formátování kódu, název proměnné,
  jak přesně napsat SQL dotaz) řeš sám bez ptaní — otázky šetři na
  věci, které mění chování appky nebo datový model.

### Ptát se ANO na produkt, NE na techniku

Tohle je nejčastější způsob, jak uživatele zklamat (vytkl to
25.8.2026): házet mu zpátky **technické** otázky, na které si mám
odpovědět sám. Uživatel je netechnický a používá Claude přesně na to,
aby tyhle věci nemusel řešit.

- **Technické otázky jsou moje.** Jak navrhnout architekturu, kolik to
  bude requestů, jaký endpoint zavolat, jak ošetřit hraniční případ,
  který zdroj dat je lepší — tohle si **nastuduj a rozhodni**, ať to
  stojí víc kroků. Nedávej uživateli na výběr mezi variantami, kterým
  nemůže rozumět.
- **Produktové otázky jsou jeho.** Jak se co jmenuje, co se má
  zobrazit, jestli medaile nebo rank, jaká liga se sleduje.
- **Než se zeptáš, zkus to zjistit.** `WebSearch`, dokumentace,
  probe workflow přes GitHub Actions (viz síťové omezení níže), čtení
  kódu. Otázka typu "nevím, ověř mi to v prohlížeči" je až poslední
  možnost, ne první.
- **Když se ptát musíš, přijď s doporučením a výchozí volbou.** Ne
  "co chceš?", ale "navrhuju X, protože Y; pokud neřekneš jinak,
  udělám X". Uživatel má opravovat směr, ne ho vymýšlet.
- **Nedávej práci uživateli, když ji můžeš udělat sám.** Před tím, než
  ho pošleš klikat do cizího dashboardu, ověř, jestli to nejde
  automatizovat odsud.

## Komunikace

- Piš česky.
- Kdykoliv je potřeba ruční krok mimo tenhle chat (Supabase Dashboard,
  Vercel, Google Cloud Console...), veď uživatele **jako úplného
  nekodéra**: přesné URL, přesně kam kliknout, co zkopírovat/vložit,
  žádný předpoklad technické znalosti. Nepoužívej zkratky typu "nastav
  env proměnné" bez rozepsání, jak přesně.
- Před tím, než pošleš uživatele dělat ruční kroky (Vercel token,
  Google Console...), nejdřív ověř, jestli to nejde udělat rovnou v
  této session (viz síťové omezení níže) — ať se to nemusí zjišťovat
  za běhu znovu.

## Síťové omezení tohoto prostředí

Sandbox, ve kterém tahle Claude Code session běží, má omezený odchozí
přístup. Ověřeno `curl`em 25.8.2026 (403 na CONNECT = zablokováno):

| Cíl | Funguje ze session? |
|---|---|
| GitHub (vč. GitHub API/MCP nástrojů) | **ano** |
| npm registry | **ano** |
| `WebSearch` (vyhledávání na webu) | **ano** |
| `WebFetch` na cizí doménu | **ne** (EGRESS_BLOCKED) |
| **`supabase.co`** (REST i Edge Functions) | **ne** |
| `api.vercel.com`, Google, sportovní API | **ne** |

**Pozor**, dřívější verze téhle poznámky tvrdila, že "Supabase REST API
funguje" — to je **špatně** a stálo to čas. Funguje z **nasazené appky**
(Vercel/Edge Function), ne z téhle session.

**Jak se přesto dostat ven — přes GitHub Actions.** GitHub je
dosažitelný a Actions běží s plným internetem. V repu je
`.github/workflows/api-probe.yml`: ručně spustitelný workflow, který
zavolá zadanou URL a vypíše odpověď do logu. Claude ho umí sám spustit
(`actions_run_trigger`) i přečíst jeho log (`get_job_logs`) — takže si
umí ověřit reálná data z cizího API bez toho, aby to uživatel musel
kopírovat ručně. Tohle použij dřív, než pošleš uživatele něco ověřovat
do prohlížeče.

## Git a nasazení

- Pracuj v malých krocích: jedna ucelená funkce/oprava = jeden commit,
  push, a pokud jde o appku samotnou, i PR do `main` (branch dostaneš
  na začátku session v systémových instrukcích). **PR vytvářej rovnou
  sám po každém pushi** — díky tomu Vercel na PR napíše komentář s
  odkazem na preview, což je pro uživatele nejspolehlivější způsob, jak
  změnu vyzkoušet, než jde do `main`. **Hned po založení PR se na něj
  přihlas přes `subscribe_pr_activity`** (uživatel plánuje GitHub
  workflow s Copilot code review, který na PR bude nechávat komentáře
  — automaticky se tak dozvím o nových komentářích/CI a budu na ně
  moct reagovat, než požádám o merge).
- **Merge PR dělej sám, ale až po výslovném souhlasu uživatele** v
  chatu (např. "jedeme", "mergni to", "ok") — ne automaticky hned po
  vytvoření PR. Dokud souhlas nepřijde, jen čekej / pracuj na dalším
  kroku, PR nech otevřený. Pokud mezitím na PR přibudou komentáře
  (např. od Copilota), nejdřív na ně zareaguj (drobnosti oprav rovnou,
  u větších věcí navrhni řešení v chatu) — teprve pak čekej na
  uživatelovo "jedeme".
- **Jakmile je PR smergovaný (ať už jím nebo uživatelem ručně na
  GitHubu), branch pro tenhle PR je "spotřebovaná".** Než na ni
  pushneš další commit, ověř přes GitHub (`pull_request_read` / `list_pull_requests`),
  jestli PR pro ni ještě je otevřený. Pokud je zavřený/smergovaný,
  založ pro další práci nový PR (klidně ze stejné branch, pokud na ní
  jsou nesmergované commity navíc) místo pushování do už uzavřeného PR
  — jinak ty commity zůstanou nikde neviditelné. (Stalo se přesně tohle
  25.8.2026 — dva commity po mergi PR #12 skončily "ztracené", než se
  založil PR #13.)
- Pokud na existující **otevřený** PR přibude další commit, není
  potřeba nový PR zakládat, stačí pushnout do stejné branch.
- Před každým pushem: `pnpm exec tsc --noEmit` a `pnpm build` musí
  projít bez chyb.
- Produkční nasazení (`drew-pink.vercel.app`) se aktualizuje jen po
  smergování do `main` — DB změny (SQL v Supabase editoru) naopak
  fungují okamžitě bez čekání na deploy, to uživateli vždy rozliš.

## Dokumentace

- Po každé větší dokončené funkci nebo rozhodnutí (nová tabulka, nová
  RLS politika, nová stránka, nové rozhodnutí o chování appky) **rovnou
  aktualizuj `docs/PROJECT.md`** — sekci "Stav" a případně datový
  model/rozhodnutí. Neptej se na to, dělej to průběžně.
