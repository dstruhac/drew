-- Na žádost uživatele (16.9.2026): appka měla dřív zápasy do
-- hecovačky doplnit až při dalším běhu scripts/sync/hecovacky.mjs
-- (ruční/naplánovaný) -- uživatel chce zápasy vidět HNED po založení,
-- ne až později.
--
-- Appka na to potřebuje zapisovat do `matches`, což dosud směla jen
-- service_role (`authenticated` má na matches jen `select`, viz
-- 20260825090000_grants.sql). Místo plošného grantu (bezpečnostní
-- riziko -- kdokoliv přihlášený by pak mohl appce podstrčit
-- libovolný vymyšlený zápas) appka přidává úzce vymezenou
-- SECURITY DEFINER funkci, stejný vzorec jako `accept_hecovacka_invite()`/
-- `hecovacka_is_visible()`: sama si nejdřív ověří, že volající je
-- skutečně vlastník dané hecovačky, a pak zkopíruje jen zápasy z
-- dneška ze schválených zdrojových soutěží (`hecovacka_sources`) --
-- žádný jiný zápis appka nedovolí.
--
-- Logika kopíruje `pickMatchesForHecovacky()` ze
-- scripts/sync/hecovacky.mjs, jen zúženou na "jen dnešek" -- appce
-- při ČERSTVĚ založené hecovačce odpadá celá kontrola "co už appka
-- dřív vybrala" (žádné zápasy ještě neexistují), takže appka
-- nepotřebuje smyčku přes 7denní okno ani kontrolu duplicit. Zbytek
-- okna (zítřek a dál) appka doplní následujícím pravidelným během
-- `hecovacky.mjs` beze změny.
create or replace function public.sync_hecovacka_matches_for_today(p_hecovacka_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_per_day int;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_picked int;
begin
  select max_matches_per_day into v_max_per_day
  from public.competitions
  where id = p_hecovacka_id and created_by = auth.uid() and visibility = 'private';

  if not found then
    raise exception 'not_owner';
  end if;

  -- Stejný "dvojitý AT TIME ZONE" převod jako appka jinde dělá v JS
  -- (pragueWallTimeToUtcIso) -- tady rovnou v SQL, ať appka nepotřebuje
  -- volat databázi znovu zvlášť jen kvůli okну dneška.
  v_day_start := date_trunc('day', now() at time zone 'Europe/Prague') at time zone 'Europe/Prague';
  v_day_end := v_day_start + interval '1 day';

  insert into public.matches (
    competition_id, external_id, home_team, away_team, kickoff_at,
    status, home_score, away_score, overtime_flag, sport, source_match_id
  )
  select
    p_hecovacka_id, m.external_id, m.home_team, m.away_team, m.kickoff_at,
    m.status, m.home_score, m.away_score, m.overtime_flag,
    coalesce(m.sport, c.sport), m.id
  from public.matches m
  join public.competitions c on c.id = m.competition_id
  where m.competition_id in (
    select source_competition_id from public.hecovacka_sources
    where hecovacka_id = p_hecovacka_id
  )
  and m.kickoff_at >= v_day_start
  and m.kickoff_at < v_day_end
  and m.kickoff_at > now()
  order by random()
  -- LIMIT NULL v PostgreSQL znamená "bez limitu" -- appka tak nemusí
  -- řešit zvlášť případ nastaveného/nenastaveného denního stropu.
  limit v_max_per_day
  on conflict (competition_id, external_id) do nothing;

  get diagnostics v_picked = row_count;
  return v_picked;
end;
$$;

grant execute on function public.sync_hecovacka_matches_for_today(uuid) to authenticated;

-- create_hecovacka() zavolá novou funkci sama, hned po založení --
-- appka tak vrátí id hecovačky, která už má (pokud dnes nějaký zápas
-- ve zdrojových soutěžích je) rovnou vyplněné dnešní zápasy, v JEDNÉ
-- transakci s jejím založením. Validace i zbytek beze změny.
create or replace function public.create_hecovacka(
  p_name text,
  p_description text,
  p_start_date date,
  p_end_date date,
  p_max_matches_per_day int,
  p_source_competition_ids uuid[],
  p_initial_participant_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_source_id uuid;
  v_participant_id uuid;
begin
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'name_required';
  end if;
  if p_end_date is null then
    raise exception 'end_date_required';
  end if;
  if p_end_date < current_date then
    raise exception 'end_date_in_past';
  end if;
  if p_start_date is not null and p_end_date < p_start_date then
    raise exception 'end_date_before_start_date';
  end if;
  if p_max_matches_per_day is not null and p_max_matches_per_day <= 0 then
    raise exception 'max_matches_per_day_invalid';
  end if;
  if p_source_competition_ids is null or array_length(p_source_competition_ids, 1) is null then
    raise exception 'source_competitions_required';
  end if;

  insert into public.competitions (
    id, name, description, sport, visibility, start_date, end_date,
    max_matches_per_day, invite_token, created_by
  )
  values (
    v_id, p_name, p_description, 'mixed', 'private', p_start_date, p_end_date,
    p_max_matches_per_day, replace(gen_random_uuid()::text, '-', ''), auth.uid()
  );

  foreach v_source_id in array p_source_competition_ids loop
    insert into public.hecovacka_sources (hecovacka_id, source_competition_id)
    values (v_id, v_source_id);
  end loop;

  insert into public.competition_participants (competition_id, user_id)
  values (v_id, auth.uid());

  foreach v_participant_id in array p_initial_participant_ids loop
    if v_participant_id <> auth.uid() then
      insert into public.competition_participants (competition_id, user_id, added_by)
      values (v_id, v_participant_id, auth.uid())
      on conflict do nothing;
    end if;
  end loop;

  -- Datum od (pokud vyplněné) může být v budoucnu -- appka pro
  -- takovou hecovačku dnešní zápasy nevybírá vůbec (viz
  -- pickMatchesForHecovacky() stejná logika v hecovacky.mjs), appka
  -- to necháte na budoucí pravidelný běh skriptu.
  if p_start_date is null or p_start_date <= current_date then
    perform public.sync_hecovacka_matches_for_today(v_id);
  end if;

  return v_id;
end;
$$;
