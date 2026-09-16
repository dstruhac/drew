-- Oprava skutečné příčiny "Založení hecovačky se nepodařilo" (RLS
-- 42501 na competitions), nalezené 16.9.2026 postupnou diagnostikou
-- přímo v SQL editoru (simulace role authenticated přes `set local
-- role`/`request.jwt.claims`):
--
-- `insert into competitions (...) ... returning id into v_id` --
-- PostgreSQL u INSERT s RETURNING navíc vyžaduje, aby nově vložený
-- řádek prošel i SELECT politikou (`competitions_select_visible`,
-- viz `hecovacka_is_visible()`), ne jen INSERT politikou
-- (`competitions_insert_own_hecovacka`). `hecovacka_is_visible()` se
-- ale ptá zpátky do `competitions` PODLE ID přes vlastní SELECT --
-- a ten nově vložený, ještě nezapsaný řádek uvnitř STEJNÉHO příkazu
-- nevidí (samostatný dotaz na stejnou tabulku v rámci jednoho
-- příkazu nemá k dispozici řádek, který ten samý příkaz teprve
-- zapisuje). Kontrola tak vždy selhala, i když samotná INSERT
-- politika (created_by = auth.uid()) byla v pořádku -- ověřeno
-- empiricky: identický insert BEZ `returning` prošel bez chyby.
--
-- Oprava: appka si `id` nové hecovačky vygeneruje SAMA předem
-- (`gen_random_uuid()`, appka to tak už dělá i pro invite_token) a
-- rovnou ho vloží jako sloupec `id` místo spoléhání na sloupcový
-- default + `returning ... into v_id` -- INSERT tak `returning`
-- vůbec nepotřebuje, problém tím úplně mizí. Validace i zbytek
-- funkce beze změny.
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

  return v_id;
end;
$$;
