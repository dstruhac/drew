-- Loga soutěží a klubů (krok 6+7 v docs/PROJECT.md, zdroj lfafotbal.cz,
-- 27.8.2026). Rozhodnutí o architektuře:
--
-- 1. Skutečné soubory (PNG) žijí ve Supabase Storage, ne v repu/`public/`
--    -- dá se je pak vyměnit/doplnit bez nového nasazení appky.
-- 2. `competitions.logo_url` -- prostý sloupec s veřejnou URL, appka ho
--    jen vypíše do <img src>, žádná další tabulka pro tohle není potřeba.
-- 3. Loga klubů jako samostatná mapovací tabulka `team_name -> logo_url`,
--    BEZ zásahu do `matches` (ta zůstává u prostého textu home_team/
--    away_team, jak je scrapuje sync-fixtures) -- to byla varianta (b)
--    ze dvou zvažovaných v PROJECT.md, protože zavedení plné tabulky
--    týmů by vyžadovalo přepsat matches na cizí klíče, což si tahle
--    featura nevyžaduje.

alter table public.competitions add column logo_url text;

create table public.team_logos (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  team_name text not null,
  logo_url text not null,
  primary key (competition_id, team_name)
);

alter table public.team_logos enable row level security;

-- Stejný důvěryhodný model jako zbytek appky (matches, weekly_badges):
-- kdokoliv přihlášený vidí všechna loga, zapisuje jen import skript pod
-- service role.
create policy "team_logos_select_authenticated"
  on public.team_logos for select
  to authenticated
  using (true);

grant select on public.team_logos to authenticated;
grant select, insert, update on public.team_logos to service_role;

-- Veřejný Storage bucket pro logo soubory -- "public" znamená, že jsou
-- čitelné přes předvídatelnou URL bez nutnosti auth hlavičky (appka je
-- pak může vykreslit v <img> stejně jako fotečku uživatele z Google).
-- Zápis (upload) dělá jen import skript pod service role klíčem, který
-- RLS obchází, takže žádná insert policy na storage.objects není potřeba.
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

create policy "logos_public_read"
  on storage.objects for select
  using (bucket_id = 'logos');
