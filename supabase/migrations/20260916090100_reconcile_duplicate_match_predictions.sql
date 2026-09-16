-- Jednorázové sjednocení STARÝCH tipů na stejný reálný zápas napříč
-- soutěžemi (14.9.2026, na žádost uživatele -- appka od teď propisuje
-- nový/upravený tip automaticky do všech soutěží se stejným zápasem,
-- viz submitPrediction() v src/app/(app)/spaces/[id]/actions.ts, ale
-- tipy zadané PŘED touhle funkcí mohly být na stejný zápas v různých
-- soutěžích rozdílné).
--
-- Rozhodnuto s uživatelem: sjednotit podle NAPOSLEDY uloženého tipu
-- (podle `predictions.updated_at`), a to jen u zápasů, které JEŠTĚ
-- VŠECHNY (celá skupina se stejným external_id) nejsou zamčené --
-- appka nesmí retroaktivně měnit tip na už rozhodnutý/probíhající
-- zápas, kde už třeba proběhlo bodování.
with latest_per_group as (
  -- Pro každého hráče a každý reálný zápas (external_id) najde tu JEDNU
  -- variantu tipu, která byla uložena naposled -- bez ohledu na to, ve
  -- které soutěži/kopii zápasu k tomu došlo.
  select distinct on (m.external_id, p.user_id)
    m.external_id,
    p.user_id,
    p.predicted_home_score,
    p.predicted_away_score,
    p.predicted_overtime_flag
  from public.predictions p
  join public.matches m on m.id = p.match_id
  where m.external_id is not null
  order by m.external_id, p.user_id, p.updated_at desc
),
target as (
  select
    p.id as prediction_id,
    lpg.predicted_home_score,
    lpg.predicted_away_score,
    lpg.predicted_overtime_flag
  from public.predictions p
  join public.matches m on m.id = p.match_id
  join latest_per_group lpg
    on lpg.external_id = m.external_id
   and lpg.user_id = p.user_id
  where m.external_id is not null
    -- Vyřadí celou skupinu (reálný zápas), pokud je JAKÁKOLIV jeho kopie
    -- napříč soutěžemi už zamčená (výkop proběhl, nebo status už není
    -- 'scheduled') -- stejná podmínka jako predictions RLS politiky.
    and not exists (
      select 1
      from public.matches m2
      where m2.external_id = m.external_id
        and (m2.kickoff_at <= now() or m2.status <> 'scheduled')
    )
)
update public.predictions p
set
  predicted_home_score = target.predicted_home_score,
  predicted_away_score = target.predicted_away_score,
  predicted_overtime_flag = target.predicted_overtime_flag
from target
where p.id = target.prediction_id
  and (
    p.predicted_home_score is distinct from target.predicted_home_score
    or p.predicted_away_score is distinct from target.predicted_away_score
    or p.predicted_overtime_flag is distinct from target.predicted_overtime_flag
  );
