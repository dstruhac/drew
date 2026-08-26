-- competition_participants: explicit "hraju tuhle soutěž" commitment.
-- Uživatel se musí nejdřív "přihlásit", než může zadat svůj úplně
-- první tip v dané competition (viz úprava predictions insert policy
-- níže) — díky tomu leaderboard i seznam účastníků vždy přesně
-- odpovídají tomu, kdo skutečně hraje, a nikdy nevznikne tip "od
-- nikoho" (bez odpovídajícího participanta).
create table public.competition_participants (
  competition_id uuid not null references public.competitions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (competition_id, user_id)
);

create index competition_participants_user_id_idx
  on public.competition_participants (user_id);

alter table public.competition_participants enable row level security;

-- Stejný důvěryhodný model jako zbytek appky (malá uzavřená skupina):
-- kdokoliv přihlášený vidí, kdo hraje kterou soutěž.
create policy "competition_participants_select_authenticated"
  on public.competition_participants for select
  to authenticated
  using (true);

-- Přihlášení/odhlášení ze soutěže je samoobslužné -- uživatel může
-- přidat/smazat jen svůj vlastní řádek.
create policy "competition_participants_insert_own"
  on public.competition_participants for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "competition_participants_delete_own"
  on public.competition_participants for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, delete on public.competition_participants to authenticated;

-- Zpětné doplnění: kdo už dřív tipoval, evidentně tu soutěž hraje --
-- ať mu tahle změna nezpůsobí zmizení z leaderboardu.
insert into public.competition_participants (competition_id, user_id)
select distinct m.competition_id, p.user_id
from public.predictions p
join public.matches m on m.id = p.match_id
on conflict do nothing;

-- Tip teď navíc vyžaduje, aby byl uživatel u dané competition veden
-- jako participant -- ne jen vlastnictví (user_id = auth.uid()) a
-- výkop v budoucnu, jak tomu bylo dřív.
drop policy "predictions_insert_own_before_kickoff" on public.predictions;

create policy "predictions_insert_own_before_kickoff"
  on public.predictions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.matches m
      join public.competition_participants cp
        on cp.competition_id = m.competition_id
       and cp.user_id = auth.uid()
      where m.id = predictions.match_id
        and m.kickoff_at > now()
    )
  );
