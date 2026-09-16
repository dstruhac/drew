-- Oprava: `create_hecovacka()` používala `gen_random_bytes()` z rozšíření
-- pgcrypto pro vygenerování invite_token. Ostrý běh (16.9.2026) spadl na
-- "function gen_random_bytes(integer) does not exist" -- funkce má
-- `set search_path = public` a pgcrypto je v týhle Supabase instanci
-- zjevně nainstalované mimo `public` (typicky schéma `extensions`,
-- běžná konvence Supabase), takže ho funkce nenajde bez ohledu na to,
-- že `create extension if not exists pgcrypto;`
-- (20260824120000_extensions.sql) proběhla bez chyby.
--
-- Oprava: appka žádné rozšíření nepotřebuje vůbec -- `gen_random_uuid()`
-- je od PostgreSQL 13 vestavěná funkce v `pg_catalog` (appka ji už
-- dnes používá jako výchozí hodnotu `id` sloupců), takže funguje vždy,
-- bez ohledu na `search_path`. Token zůstává stejně dlouhý a
-- nepředvídatelný (32 hex znaků) -- jen se smažou pomlčky z UUID
-- místo skládání z náhodných bajtů.
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
    p_max_matches_per_day, replace(gen_random_uuid()::text, '-', ''), auth.uid()
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
