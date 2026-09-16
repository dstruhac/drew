-- Oprava: `competitions_select_visible` (20260914090000) čte
-- `competition_participants` a `competition_participants_select_visible`
-- (20260914090300) zpátky čte `competitions` (a navíc sama sebe přes
-- alias cp2) -- Postgres tuhle vzájemnou rekurzi mezi RLS politikami
-- dvou tabulek neumí vyhodnotit a odmítne KAŽDÝ select na kteroukoliv
-- z obou tabulek chybou "infinite recursion detected in policy". Bez
-- téhle opravy by po spuštění migrací z 14.9.2026 přestalo jít číst
-- competitions/competition_participants/matches/hecovacka_sources
-- vůbec, ne jen u hecovaček -- nalezeno code review 15.9.2026 PŘED
-- spuštěním migrací v Supabase.
--
-- Oprava (doporučený vzor Supabase přesně pro tenhle případ, viz
-- "Prevent infinite recursion" v jejich RLS dokumentaci): jedna
-- SECURITY DEFINER funkce, která uvnitř sebe dotazy na obě tabulky
-- provede BEZ RLS -- běží pod vlastníkem funkce (v Supabase SQL
-- editoru typicky role `postgres`, která je vlastníkem tabulek, a
-- vlastník tabulky vlastní RLS politiky bez FORCE ROW LEVEL SECURITY
-- neaplikuje sám na sebe). Politiky pak už nikdy nečtou přímo tu
-- druhou RLS-chráněnou tabulku, jen zavolají tuhle funkci -- k
-- rekurzi tak nemůže dojít.
create or replace function public.hecovacka_is_visible(p_competition_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.competitions c
    where c.id = p_competition_id
      and (
        c.visibility = 'public'
        or c.created_by = auth.uid()
        or exists (
          select 1 from public.competition_participants cp
          where cp.competition_id = c.id
            and cp.user_id = auth.uid()
        )
      )
  );
$$;

grant execute on function public.hecovacka_is_visible(uuid) to authenticated;

drop policy "competitions_select_visible" on public.competitions;
create policy "competitions_select_visible"
  on public.competitions for select
  to authenticated
  using (public.hecovacka_is_visible(id));

drop policy "matches_select_visible" on public.matches;
create policy "matches_select_visible"
  on public.matches for select
  to authenticated
  using (public.hecovacka_is_visible(competition_id));

drop policy "competition_participants_select_visible" on public.competition_participants;
create policy "competition_participants_select_visible"
  on public.competition_participants for select
  to authenticated
  using (public.hecovacka_is_visible(competition_id));

drop policy "hecovacka_sources_select_visible" on public.hecovacka_sources;
create policy "hecovacka_sources_select_visible"
  on public.hecovacka_sources for select
  to authenticated
  using (public.hecovacka_is_visible(hecovacka_id));
