-- Hecovačky: tři nové Postgres funkce -- založení (atomicky víc
-- insertů najednou), náhled pozvánky (funguje i nepřihlášenému) a
-- přijetí pozvánky. SECURITY DEFINER jen u těch dvou, co musí obejít
-- RLS v přesně vymezeném rozsahu (stejný vzor jako
-- calculate_match_points() v 20260825100000_scoring_trigger.sql) --
-- create_hecovacka je SECURITY INVOKER, protože RLS politiky přidané
-- migracemi výše volajícímu uživateli všechny potřebné inserty už
-- samy dovolují (funkce jen zajišťuje, že proběhnou v jedné transakci).

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

  -- Tvůrce je vždy i sám hráč -- bez added_by, ať mu appka neposílá
  -- e-mail "byl jsi přidán" sám sobě.
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

grant execute on function public.create_hecovacka(text, text, date, date, int, uuid[], uuid[]) to authenticated;

-- Náhled pozvánky -- volatelné i nepřihlášeným (anon), ať appka umí
-- ukázat "Byl jsi pozván do X" ještě před loginem na /pozvanka/[token].
-- SECURITY DEFINER obchází competitions_select_visible schválně, ale
-- vrací jen minimum (název/popisek), ne celý řádek.
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
      and c.visibility = 'private';
end;
$$;

grant execute on function public.get_hecovacka_invite_preview(text) to anon, authenticated;

-- Přijetí pozvánky -- jen pro přihlášené. SECURITY DEFINER obchází
-- competition_participants_insert_own (ten by soukromou hecovačku bez
-- tokenu odmítl) -- autorizace tady je posedění platného tokenu, ne
-- existující členství.
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
    and c.visibility = 'private';

  if v_id is null then
    raise exception 'invalid_invite_token';
  end if;

  insert into public.competition_participants (competition_id, user_id)
  values (v_id, auth.uid())
  on conflict do nothing;

  return v_id;
end;
$$;

grant execute on function public.accept_hecovacka_invite(text) to authenticated;
