-- Uživatel 19.9.2026 nahlásil: založil novou hecovačku, ta zkopírovala
-- zápasy z Chance Ligy, na které už měl dřív zadaný tip -- čekal, že
-- se mu ten tip propíše i do hecovačky, appka ho ale nechala prázdný.
--
-- Appka UŽ propisuje tip mezi "sourozeneckými" kopiemi stejného
-- reálného zápasu (stejný external_id, jiná competition_id) --
-- viz syncPredictionToDuplicateMatches v
-- src/app/(app)/spaces/[id]/actions.ts. Ten mechanismus ale běží jen
-- JEDNÍM směrem: při uložení/změně tipu propíše hodnotu do VŠECH
-- SOUROZENCŮ, KTEŘÍ UŽ V TU CHVÍLI EXISTUJÍ. Když sourozenecký zápas
-- (kopie do hecovačky) vznikne AŽ POTÉ, co hráč tip zadal, nikdy se ho
-- nedozví -- přesně tenhle případ.
--
-- Oprava: sync_hecovacka_matches_initial() (volá ji create_hecovacka()
-- hned po založení) teď po zkopírování zápasů ještě jednou projde
-- VŠECHNY zápasy dané hecovačky (ne jen nově vložené touhle
-- invokací -- funkce je idempotentní, viz
-- 20260916150000_hecovacky_sync_today_on_create.sql, takže i tohle
-- může běžet opakovaně beze škody) a pro každého PARTICIPANTA
-- hecovačky, který už má tip na sourozenecký zápas (stejný
-- external_id) v JINÉ soutěži, mu stejný tip založí i tady --
-- `on conflict do nothing`, takže existující tip appka nikdy nepřepíše.
-- Stejné pravidlo jako u opačného směru: propisuje se JEN participantům
-- hecovačky, appka nikoho nikam sama nepřihlašuje.
--
-- Omezeno na m.status = 'scheduled' -- funkce běží přes SECURITY
-- DEFINER (obchází RLS), takže bez týhle pojistky by opakované
-- volání mohlo "podstrčit" tip i na zápas, který mezitím už začal/
-- skončil (kopírovaly se sem vždycky jen zápasy s výkopem v
-- budoucnu, ale při přeběhu v čase, po repeated volání, se to už
-- nemusí držet).
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

    exit when v_end_date is not null and v_day > v_end_date;
    continue when v_start_date is not null and v_day < v_start_date;

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
    and m.kickoff_at > now()
    order by random()
    limit v_limit
    on conflict (competition_id, external_id) do nothing;

    get diagnostics v_count = row_count;
    v_total := v_total + v_count;
  end loop;

  -- Propsání už existujících tipů participantů na sourozenecké zápasy
  -- (viz odůvodnění nahoře souboru) -- přes VŠECHNY zápasy hecovačky,
  -- ne jen nově vložené v tomhle běhu.
  insert into public.predictions (
    match_id, user_id, predicted_home_score, predicted_away_score, predicted_overtime_flag
  )
  select distinct on (m.id, cp.user_id)
    m.id, cp.user_id, p.predicted_home_score, p.predicted_away_score, p.predicted_overtime_flag
  from public.matches m
  join public.competition_participants cp on cp.competition_id = p_hecovacka_id
  join public.predictions p
    on p.user_id = cp.user_id
    and p.match_id in (
      select id from public.matches sib
      where sib.external_id = m.external_id and sib.id <> m.id
    )
  where m.competition_id = p_hecovacka_id
    and m.source_match_id is not null
    and m.status = 'scheduled'
  order by m.id, cp.user_id, p.updated_at desc
  on conflict (match_id, user_id) do nothing;

  return v_total;
end;
$$;

-- Jednorázový dolet: funkce výše opravuje jen BUDOUCÍ založení/
-- doplnění hecovačky -- hecovačky, co existovaly už PŘED touhle
-- migrací, si samy nedoženou. Appka proto tady rovnou zpětně propíše
-- chybějící tipy do VŠECH už existujících hecovaček, stejná logika
-- jako výše, jen bez omezení na jednu konkrétní hecovačku a bez
-- SECURITY DEFINER (spouští se rovnou v SQL editoru).
insert into public.predictions (
  match_id, user_id, predicted_home_score, predicted_away_score, predicted_overtime_flag
)
select distinct on (m.id, cp.user_id)
  m.id, cp.user_id, p.predicted_home_score, p.predicted_away_score, p.predicted_overtime_flag
from public.matches m
join public.competitions c on c.id = m.competition_id and c.visibility = 'private'
join public.competition_participants cp on cp.competition_id = m.competition_id
join public.predictions p
  on p.user_id = cp.user_id
  and p.match_id in (
    select id from public.matches sib
    where sib.external_id = m.external_id and sib.id <> m.id
  )
where m.source_match_id is not null
  and m.status = 'scheduled'
order by m.id, cp.user_id, p.updated_at desc
on conflict (match_id, user_id) do nothing;
