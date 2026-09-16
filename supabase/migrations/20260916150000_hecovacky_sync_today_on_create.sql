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
-- skutečně vlastník dané hecovačky, a pak zkopíruje zápasy ze
-- schválených zdrojových soutěží (`hecovacka_sources`) -- žádný jiný
-- zápis appka nedovolí.
--
-- Logika kopíruje `pickMatchesForHecovacky()` ze
-- scripts/sync/hecovacky.mjs 1:1 -- CELÉ klouzavé okno 7 dní dopředu
-- (stejné WINDOW_DAYS), ne jen dnešek (uživatel správně upozornil, že
-- appka pro zdrojovou soutěž má nastahované zápasy na celý týden
-- dopředu už teď, není důvod čekat na zítřejší/pozítřejší den až na
-- další pravidelný běh hecovacky.mjs).
--
-- Idempotence (nalezeno Codex review 16.9.2026): appka má tuhle funkci
-- grantnutou přímo `authenticated`, ne jen volanou zevnitř
-- `create_hecovacka()` -- vlastník hecovačky ji tak může zavolat
-- opakovaně (např. ručně přes RPC). Bez kontroly, kolik zápasů daný
-- den v hecovačce UŽ je, by každé další volání přidalo další náhodnou
-- dávku až do `max_matches_per_day` NAVÍC (přes `on conflict` appka
-- jen vyřadí přesné duplicity stejného zápasu, ne jiné zápasy stejného
-- dne) -- denní limit by se tak dal opakovaným voláním obejít. Appka
-- proto před výběrem pro každý den spočítá, kolik zápasů v hecovačce
-- pro ten den už existuje, a limit o to sníží (stejný princip jako
-- `hecovacky.mjs` dopočítává "kolik do limitu ještě zbývá").
create or replace function public.sync_hecovacka_matches_initial(p_hecovacka_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_date date;
  v_end_date date;
  v_max_per_day int;
  v_today date;
  v_day date;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_existing_count int;
  v_limit int;
  v_total int := 0;
  v_count int;
  i int;
begin
  select start_date, end_date, max_matches_per_day
    into v_start_date, v_end_date, v_max_per_day
  from public.competitions
  where id = p_hecovacka_id and created_by = auth.uid() and visibility = 'private';

  if not found then
    raise exception 'not_owner';
  end if;

  v_today := (now() at time zone 'Europe/Prague')::date;

  for i in 0..6 loop
    v_day := v_today + i;

    -- end_date je poslední den, kdy appka ještě smí vybírat -- dny za
    -- ním jsou mimo okno úplně (ne jen "zatím ne").
    exit when v_end_date is not null and v_day > v_end_date;
    -- start_date ještě nenastalo -- appka pro tenhle den nic
    -- nevybírá, ale pokračuje dál dny v okně (start_date může padnout
    -- i později v týdnu).
    continue when v_start_date is not null and v_day < v_start_date;

    -- Stejný "dvojitý AT TIME ZONE" převod jako appka jinde dělá v JS
    -- (pragueWallTimeToUtcIso) -- tady rovnou v SQL.
    v_day_start := (v_day::timestamp) at time zone 'Europe/Prague';
    v_day_end := v_day_start + interval '1 day';

    if v_max_per_day is null then
      v_limit := null;
    else
      select count(*) into v_existing_count
      from public.matches
      where competition_id = p_hecovacka_id
        and kickoff_at >= v_day_start
        and kickoff_at < v_day_end;

      v_limit := greatest(v_max_per_day - v_existing_count, 0);
    end if;

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
    -- U dnešního dne (i=0) appka mezi kandidáty nechce zápas, co dnes
    -- už začal/skončil -- u budoucích dnů tahle podmínka nic nemění
    -- (v_day_start je vždycky v budoucnu). Stejný filtr jako
    -- hecovacky.mjs (nalezeno Codex review 15.9.2026).
    and m.kickoff_at > now()
    order by random()
    -- LIMIT NULL v PostgreSQL znamená "bez limitu" -- appka tak
    -- nemusí řešit zvlášť případ nastaveného/nenastaveného stropu.
    limit v_limit
    on conflict (competition_id, external_id) do nothing;

    get diagnostics v_count = row_count;
    v_total := v_total + v_count;
  end loop;

  return v_total;
end;
$$;

grant execute on function public.sync_hecovacka_matches_initial(uuid) to authenticated;

-- create_hecovacka() zavolá novou funkci sama, hned po založení --
-- appka tak vrátí id hecovačky, která už má (pokud appka pro zdrojové
-- soutěže nějaké zápasy v okně má) rovnou vyplněné zápasy na celý
-- dostupný týden dopředu. Validace i zbytek beze změny.
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

  perform public.sync_hecovacka_matches_initial(v_id);

  return v_id;
end;
$$;
