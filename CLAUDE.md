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
přístup: GitHub, npm registry a Supabase REST API (server-side) fungují;
**Vercel API, Google, a obecně cizí domény ne** — ani přes CLI/token,
ani přes Playwright prohlížeč. Ověřeno na `api.vercel.com` (403 na
CONNECT) a `accounts.google.com`/`supabase.co` z Playwrightu
(`ERR_TUNNEL_CONNECTION_FAILED`). Neztrácej čas opakovaným zkoušením
téhle cesty — rovnou navrhni ruční postup přes uživatelův prohlížeč.

## Git a nasazení

- Pracuj v malých krocích: jedna ucelená funkce/oprava = jeden commit,
  push, a pokud jde o appku samotnou, i PR do `main` (branch dostaneš
  na začátku session v systémových instrukcích). **PR vytvářej rovnou
  sám po každém pushi** — díky tomu Vercel na PR napíše komentář s
  odkazem na preview, což je pro uživatele nejspolehlivější způsob, jak
  změnu vyzkoušet, než jde do `main`.
- **Merge PR dělej sám, ale až po výslovném souhlasu uživatele** v
  chatu (např. "jedeme", "mergni to", "ok") — ne automaticky hned po
  vytvoření PR. Dokud souhlas nepřijde, jen čekej / pracuj na dalším
  kroku, PR nech otevřený.
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
