-- Code review PR #224 (Codex, 20.9.2026): propsání existujícího tipu
-- (20260919110000_hecovacky_copy_existing_predictions.sql) běží jen
-- při KOPÍROVÁNÍ ZÁPASU (založení hecovačky / denní doplnění) --
-- pokrývá participanta, který v tu chvíli UŽ hecovačku hraje. Hráč,
-- co se do hecovačky přidá AŽ POTÉ (přijme pozvánkový odkaz, nebo ho
-- vlastník přidá přímo), nikdy nedostane zpětné propsání pro zápasy,
-- co v hecovačce UŽ jsou -- ani sync_hecovacka_matches_initial(), ani
-- denní hecovacky.mjs se k jeho tipu nikdy nedostanou (ten den se pro
-- ně žádný NOVÝ zápas nekopíruje).
--
-- Oprava: sdílená funkce se stejnou logikou jako výše, jen pro JEDNOHO
-- konkrétního (nově přidaného) hráče přes VŠECHNY zápasy dané
-- hecovačky -- volaná z obou míst, kde participant přibývá:
-- accept_hecovacka_invite() (hráč sám, pozvánkový odkaz) a
-- addHecovackaPlayer() v src/app/(app)/spaces/[id]/actions.ts
-- (vlastník přidává přímo).
create or replace function public.backfill_hecovacka_predictions_for_participant(
  p_hecovacka_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Volat smí buď sám nově přidaný hráč (přijetí pozvánky), nebo
  -- vlastník dané hecovačky (přidání přímo) -- nikdo jiný.
  if auth.uid() is distinct from p_user_id then
    if not exists (
      select 1 from public.competitions
      where id = p_hecovacka_id and created_by = auth.uid() and visibility = 'private'
    ) then
      raise exception 'not_authorized';
    end if;
  end if;

  insert into public.predictions (
    match_id, user_id, predicted_home_score, predicted_away_score, predicted_overtime_flag
  )
  select distinct on (m.id)
    m.id, p_user_id, p.predicted_home_score, p.predicted_away_score, p.predicted_overtime_flag
  from public.matches m
  join public.predictions p
    on p.user_id = p_user_id
    and p.match_id in (
      select id from public.matches sib
      where sib.external_id = m.external_id and sib.id <> m.id
    )
  where m.competition_id = p_hecovacka_id
    and m.source_match_id is not null
    and m.status = 'scheduled'
    and m.kickoff_at > now()
  order by m.id, p.updated_at desc
  on conflict (match_id, user_id) do nothing;
end;
$$;

grant execute on function public.backfill_hecovacka_predictions_for_participant(uuid, uuid) to authenticated;

-- accept_hecovacka_invite() zavolá novou funkci sama za sebe (hráč
-- přijímá vlastní pozvánku) hned po vložení účasti.
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

  perform public.backfill_hecovacka_predictions_for_participant(v_id, auth.uid());

  return v_id;
end;
$$;
