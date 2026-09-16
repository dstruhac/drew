-- hecovacka_sources: které (veřejné) soutěže appka smí použít jako
-- zdroj zápasů pro danou hecovačku -- many-to-many, protože si hráč
-- může vybrat víc soutěží najednou (např. Chance Liga i Premier
-- League dohromady). Zdrojem smí být KTERÁKOLIV veřejná competition,
-- ne natvrdo vyjmenovaný seznam -- budoucí nové ligy fungují jako
-- zdroj bez zásahu do kódu.
create table public.hecovacka_sources (
  hecovacka_id uuid not null references public.competitions (id) on delete cascade,
  source_competition_id uuid not null references public.competitions (id) on delete cascade,
  primary key (hecovacka_id, source_competition_id)
);

alter table public.hecovacka_sources enable row level security;

-- Vidí jen tvůrce/participanti dané hecovačky -- stejný okruh jako
-- competitions_select_visible/matches_select_visible.
create policy "hecovacka_sources_select_visible"
  on public.hecovacka_sources for select
  to authenticated
  using (
    exists (
      select 1 from public.competitions c
      where c.id = hecovacka_sources.hecovacka_id
        and (
          c.created_by = auth.uid()
          or exists (
            select 1 from public.competition_participants cp
            where cp.competition_id = c.id
              and cp.user_id = auth.uid()
          )
        )
    )
  );

-- Insert jen tvůrcem dané hecovačky, a jen na VEŘEJNOU zdrojovou
-- soutěž -- bez týhle druhé podmínky by šlo jako "zdroj" podstrčit i
-- cizí soukromou competition a nechat sync skript (service role,
-- obchází RLS) z ní přes hecovačku prosáknout data. V appce se to
-- vždy děje najednou při založení (viz create_hecovacka()) -- zdrojové
-- soutěže appka po založení needituje (viz "Editace pravidel: zamknout
-- po založení").
create policy "hecovacka_sources_insert_by_owner"
  on public.hecovacka_sources for insert
  to authenticated
  with check (
    exists (
      select 1 from public.competitions c
      where c.id = hecovacka_sources.hecovacka_id
        and c.created_by = auth.uid()
    )
    and exists (
      select 1 from public.competitions sc
      where sc.id = hecovacka_sources.source_competition_id
        and sc.visibility = 'public'
    )
  );

grant select, insert on public.hecovacka_sources to authenticated;
grant select on public.hecovacka_sources to service_role;
