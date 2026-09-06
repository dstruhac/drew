-- Sběratelské kartičky za medaili (výhru kalendářního týdne) --
-- nahrazuje dosavadní pouhou ikonku medaile v "Sbírce artefaktů" na
-- Dashboardu (rozhodnuto s uživatelem 6.9.2026 přes AskUserQuestion).
--
-- Mechanika (odsouhlaseno): za KAŽDÝ kalendářní týden, kdy hráč vyhraje
-- aspoň jednu soutěž, dostane PRÁVĚ JEDNU kartu. Vzácnost karty se
-- odvíjí od toho, kolik soutěží ten týden vyhrál najednou (appka dnes
-- sleduje 4 soutěže): 1 soutěž = běžná, 2 = vzácná, 3 nebo 4 (všechny)
-- = legendární. Karta je náhodná z dané vzácnostní skupiny, BEZ
-- duplicit dokud hráč nemá všechny karty té vzácnosti -- teprve pak se
-- objevují duplicity (appka si pamatuje, kolikrát kterou kartu má).
-- Viz scripts/sync/lib/cards.mjs pro samotnou losovací logiku.
--
-- Katalog karet (`cards`) je pevný, číslovaný obsah (1-50, zatím jen
-- prvních 10) -- kdo je vyhrává, appka drží v `user_cards`. `card_draws`
-- je jen technická evidence "komu se už za tenhle týden karta
-- vylosovala" (idempotence běhu award-weekly-badges.mjs) a zároveň
-- zdroj pro "novou kartu" v gratulačním modalu na Dashboardu.
--
-- Žebříček/profil dál ukazují jen POČET medailí (weekly_badges beze
-- změny) -- kartičky jsou navíc v "Sbírce artefaktů" na Dashboardu,
-- jako miniatura nejvzácnější/poslední karty na žebříčku soutěže a
-- jako celá galerie na veřejném profilu hráče.

create table public.cards (
  id smallint primary key,
  rarity text not null check (rarity in ('common', 'rare', 'legendary')),
  name text not null,
  club text not null,
  position text not null,
  sport text not null check (sport in ('football', 'hockey')),
  flavor_text text not null,
  -- Skutečný soubor žije ve Supabase Storage (bucket "cards"), stejná
  -- architektura jako competitions.logo_url/team_logos.logo_url --
  -- appka jen vypíše URL, obrázek se dá kdykoliv vyměnit (např. za
  -- fotku konkrétního kamaráda) bez zásahu do appky. Nullable, dokud
  -- neproběhne scripts/sync/import-card-images.mjs.
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.cards enable row level security;

create policy "cards_select_authenticated"
  on public.cards for select
  to authenticated
  using (true);

grant select on public.cards to authenticated;
grant select, insert, update on public.cards to service_role;

create table public.user_cards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id smallint not null references public.cards (id) on delete cascade,
  quantity integer not null default 1,
  first_obtained_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

alter table public.user_cards enable row level security;

-- Stejný důvěryhodný model jako weekly_badges/team_logos -- appka je
-- pro uzavřenou partu kamarádů, kdokoliv přihlášený vidí cizí sbírku
-- (potřeba pro miniaturu na žebříčku a galerii na veřejném profilu).
-- Zapisuje jen award-weekly-badges.mjs pod service rolí.
create policy "user_cards_select_authenticated"
  on public.user_cards for select
  to authenticated
  using (true);

grant select on public.user_cards to authenticated;
grant select, insert, update on public.user_cards to service_role;

create table public.card_draws (
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null,
  card_id smallint not null references public.cards (id),
  rarity text not null check (rarity in ('common', 'rare', 'legendary')),
  win_count integer not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.card_draws enable row level security;

-- Jen vlastní řádky -- appka to používá k odhalení "tenhle týden jsi
-- dostal tuhle kartu" v gratulačním modalu na Dashboardu, cizí
-- losování appka nikde nezobrazuje (na rozdíl od user_cards výše).
create policy "card_draws_select_own"
  on public.card_draws for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.card_draws to authenticated;
grant select, insert on public.card_draws to service_role;

-- Veřejný Storage bucket pro obrázky karet -- stejná konvence jako
-- bucket "logos" (viz 20260827150000_team_logos.sql).
insert into storage.buckets (id, name, public)
values ('cards', 'cards', true)
on conflict (id) do nothing;

create policy "cards_bucket_public_read"
  on storage.objects for select
  using (bucket_id = 'cards');

-- Prvních 10 karet (z plánovaných 50, číslovaných 1-50). Obsah i
-- vzácnostní rozdělení (6 běžných / 3 vzácné / 1 legendární)
-- odsouhlaseno s uživatelem 6.9.2026 -- fiktivní hráči "z okresního
-- přeboru" v duchu příkladu "Pepík Hnátek", žádná reálná osoba.
-- `image_url` se doplní samostatně přes import-card-images.mjs
-- (fotky reálných lidí z bezplatné knihovny Pexels).
insert into public.cards (id, rarity, name, club, position, sport, flavor_text) values
  (1, 'common', 'Pepík Hnátek', 'FK Dolní Bahno', 'útočník', 'football', 'Gólman ho ještě dneska vidí ve snu.'),
  (2, 'common', 'Brambora Novák', 'TJ Sokol Zadní Lhota', 'obránce', 'football', 'Nohy jak sloup, srdce jak lev.'),
  (3, 'common', 'Standa "Kotel" Svoboda', 'FC Horní Dolní', 'brankář', 'football', 'Chytil i to, co neviděl.'),
  (4, 'common', 'Mireček Půlnoc', 'Slavoj Zapadákov', 'záložník', 'football', 'Běhá, jako by šlo o poslední pivo v hospodě.'),
  (5, 'common', 'Ládík Kladivo', 'TJ Baník Kaluž', 'obránce', 'football', 'Skluz do mokra bez váhání, i v civilu.'),
  (6, 'common', 'Frantík Vosa', 'Sokol Suchá Louka', 'útočník', 'football', 'Rychlejší než fáma v hospodě.'),
  (7, 'rare', 'Zdenda "Bulhar" Pařízek', 'HC Ledová Pěst', 'útočník', 'hockey', 'Nájezd, po kterém i gólman zatleská.'),
  (8, 'rare', 'Věra "Kanónka" Malá', 'FK Jižní Vítr', 'útočnice', 'football', 'Kope tak, že se míč bojí vrátit.'),
  (9, 'rare', 'Otesánek z Přebrání', 'TJ Spartak Bažina', 'brankář', 'hockey', 'Za 15 let jediná inkasovaná branka padla na tréninku.'),
  (10, 'legendary', 'Karel "Nesmrtelný" Dvořák', 'Sokol Budoucnost', 'kapitán', 'football', 'Hrál v dešti, ve sněhu i v den vlastní svatby. Prohráli jen jednou -- bez něj.')
on conflict (id) do nothing;
