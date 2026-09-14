-- Hecovačky: první uživatelsky zakládaná soutěž v appce (dosud jen
-- komentář v competitions.sql "self-service založení je budoucí
-- feature"). Rozšiřuje competitions o pole potřebná pro soukromou,
-- časově omezenou soutěž založenou běžným hráčem -- viz
-- docs/PROJECT.md, sekce Hecovačky.
--
-- `description` (existující sloupec) se recykluje pro "o co se hraje"
-- -- appka ho už dnes zobrazuje na kartičce/pravidlech, sémanticky
-- sedí i tady beze změny typu.
alter table public.competitions
  add column visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  add column start_date date,
  add column end_date date,
  add column max_matches_per_day int
    check (max_matches_per_day is null or max_matches_per_day > 0),
  add column invite_token text unique,
  add constraint competitions_hecovacka_dates_check
    check (start_date is null or end_date is null or end_date >= start_date);

comment on column public.competitions.visibility is
  'public = dnešní oficiální soutěže (viditelné všem přihlášeným), private = hecovačka (jen tvůrce a participanti).';
comment on column public.competitions.start_date is
  'Jen u private (hecovačka), nepovinné. Null = appka vybírá zápasy od založení. Vyplněné = appka nevybere zápas dřív, než tohle datum nastane.';
comment on column public.competitions.end_date is
  'Jen u private (hecovačka), povinné pro ně -- appka po tomhle datu přestane vybírat nové zápasy a nastaví status=archived.';
comment on column public.competitions.max_matches_per_day is
  'Jen u private (hecovačka). Null = appka bere všechny zápasy dne ze zdrojových soutěží, jinak náhodně vybere tolikhle.';
comment on column public.competitions.invite_token is
  'Jen u private (hecovačka) -- náhodný token pro klopi.cz/pozvanka/{token}, viz accept_hecovacka_invite().';

-- Self-service vznik: běžný uživatel smí založit jen SOUKROMOU
-- (hecovačku), nikdy veřejnou soutěž -- ty zůstávají jen přes SQL
-- editor / service roli (viz komentář v competitions.sql).
create policy "competitions_insert_own_hecovacka"
  on public.competitions for insert
  to authenticated
  with check (created_by = auth.uid() and visibility = 'private');

-- Tvůrce smí upravit svou hecovačku (appka posílá updatem jen
-- name/description/invite_token -- end_date/zdrojové soutěže/limit
-- appka po založení v UI nikdy needituje, viz plán "Editace pravidel:
-- zamknout po založení"). WITH CHECK opakuje visibility='private', ať
-- se update nedá zneužít k překlopení hecovačky na veřejnou soutěž.
create policy "competitions_update_own_hecovacka"
  on public.competitions for update
  to authenticated
  using (created_by = auth.uid() and visibility = 'private')
  with check (created_by = auth.uid() and visibility = 'private');

-- Nahrazuje dřívější "kdokoliv přihlášený vidí všechny competitions"
-- (20260824120300_competitions.sql) -- veřejné soutěže vidí každý
-- beze změny, soukromou (hecovačku) jen její tvůrce nebo participant.
-- Bez tohohle by "soukromá" hecovačka nebyla soukromá vůbec.
drop policy "competitions_select_authenticated" on public.competitions;

create policy "competitions_select_visible"
  on public.competitions for select
  to authenticated
  using (
    visibility = 'public'
    or created_by = auth.uid()
    or exists (
      select 1 from public.competition_participants cp
      where cp.competition_id = competitions.id
        and cp.user_id = auth.uid()
    )
  );

grant insert, update on public.competitions to authenticated;
