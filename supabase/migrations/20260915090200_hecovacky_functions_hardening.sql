-- Zpřísnění tří funkcí z 20260914090400 podle code review 15.9.2026 --
-- `create or replace function` nahrazuje jen tělo, signatura (a tedy i
-- grant execute z původní migrace) zůstává beze změny.

-- 1) create_hecovacka: appka dosud spoléhala jen na validaci ve
-- formuláři (/hecovacky/nova) -- ale RPC je spustitelná pro
-- kteréhokoliv přihlášeného přímým voláním mimo appku, takže appka by
-- si bez týhle kontroly nechala založit hecovačku bez zdrojů, bez
-- data konce nebo s datem konce v minulosti. Validace tady je jen
-- záchranná síť (appka na to samo o sobě v UI nikdy nedovolí dojít),
-- proto zprávy zůstávají technické, ne přeložené do češtiny.
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
  v_id uuid;
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
    name, description, sport, visibility, start_date, end_date,
    max_matches_per_day, invite_token, created_by
  )
  values (
    p_name, p_description, 'mixed', 'private', p_start_date, p_end_date,
    p_max_matches_per_day, encode(gen_random_bytes(16), 'hex'), auth.uid()
  )
  returning id into v_id;

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

  return v_id;
end;
$$;

-- 2) get_hecovacka_invite_preview / accept_hecovacka_invite: appka
-- dřív kontrolovala jen token + visibility='private', takže starý
-- odkaz na dávno skončenou (status='archived', viz hecovacky.mjs)
-- hecovačku šel použít donekonečna. Obě funkce teď navíc vyžadují
-- status='active' -- appka /pozvanka/[token] beze změny kódu ukáže
-- "pozvánka už neplatí" (get_hecovacka_invite_preview vrátí 0 řádků),
-- žádná nová UI větev nebyla potřeba.
create or replace function public.get_hecovacka_invite_preview(p_token text)
returns table (competition_id uuid, name text, description text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select c.id, c.name, c.description
    from public.competitions c
    where c.invite_token = p_token
      and c.visibility = 'private'
      and c.status = 'active';
end;
$$;

create or replace function public.accept_hecovacka_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
  from public.competitions c
  where c.invite_token = p_token
    and c.visibility = 'private'
    and c.status = 'active';

  if v_id is null then
    raise exception 'invalid_invite_token';
  end if;

  insert into public.competition_participants (competition_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;

  return v_id;
end;
$$;
