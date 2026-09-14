-- Hecovačky duplikují vybrané zápasy z jiných (veřejných) soutěží do
-- vlastních řádků matches (stejný vzor jako "Náhodná liga", viz
-- 20260830090000_random_league.sql) -- source_match_id pamatuje, ze
-- kterého originálního zápasu kopie vznikla, aby appka mohla skóre a
-- stav jen ZKOPÍROVAT (žádné nové scrapování, appka čte vlastní
-- databázi). Cascade delete: zmizí-li zdrojový zápas, zmizí i kopie v
-- hecovačce (a s ní tipy) -- bez zdroje by kopie stejně neměla smysl.
alter table public.matches
  add column source_match_id uuid references public.matches (id) on delete cascade;

comment on column public.matches.source_match_id is
  'Jen u zápasů zkopírovaných do hecovačky -- FK na originální řádek matches, ze kterého appka kopíruje status/skóre (viz scripts/sync/hecovacky.mjs).';

-- Stejné zpřísnění jako u competitions_select_visible
-- (20260914090000_competitions_hecovacky.sql) -- zápas patřící pod
-- soukromou (private) competition vidí jen její tvůrce/participant,
-- jinak by "soukromá" hecovačka prosakovala přes detail zápasu i bez
-- viditelnosti samotné competition.
drop policy "matches_select_authenticated" on public.matches;

create policy "matches_select_visible"
  on public.matches for select
  to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = matches.competition_id
        and (
          c.visibility = 'public'
          or c.created_by = auth.uid()
          or exists (
            select 1 from public.competition_participants cp
            where cp.competition_id = c.id
              and cp.user_id = auth.uid()
          )
        )
    )
  );
