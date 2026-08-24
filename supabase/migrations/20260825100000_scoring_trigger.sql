-- Automatically (re)computes predictions.points whenever a match is marked
-- finished with a score. Runs as SECURITY DEFINER so it can write points
-- into predictions on already-locked (kickoff passed) matches, which the
-- normal predictions RLS update policy would otherwise block.
--
-- Scoring rule (confirmed with user):
--   - exact score match -> points_exact alone (no stacking with the below)
--   - otherwise: points_winner (if predicted outcome -- home/away/draw --
--     matches actual) + points_total_goals (if predicted total goals
--     matches actual total goals), independently stackable
--   - predicted_overtime_flag is not scored yet (out of scope for now)
create or replace function public.calculate_match_points()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  actual_outcome text;
  comp record;
begin
  actual_outcome := case
    when new.home_score > new.away_score then 'home'
    when new.away_score > new.home_score then 'away'
    else 'draw'
  end;

  select points_exact, points_winner, points_total_goals
    into comp
    from public.competitions
    where id = new.competition_id;

  update public.predictions p
  set points = case
    when p.predicted_home_score = new.home_score
     and p.predicted_away_score = new.away_score
      then comp.points_exact
    else
      (case
        when (
          case
            when p.predicted_home_score > p.predicted_away_score then 'home'
            when p.predicted_away_score > p.predicted_home_score then 'away'
            else 'draw'
          end
        ) = actual_outcome
        then comp.points_winner
        else 0
      end)
      +
      (case
        when (p.predicted_home_score + p.predicted_away_score)
           = (new.home_score + new.away_score)
        then comp.points_total_goals
        else 0
      end)
  end
  where p.match_id = new.id;

  return new;
end;
$$;

create trigger matches_calculate_points
  after update on public.matches
  for each row
  when (
    new.status = 'finished'
    and new.home_score is not null
    and new.away_score is not null
    and (
      old.status is distinct from new.status
      or old.home_score is distinct from new.home_score
      or old.away_score is distinct from new.away_score
    )
  )
  execute function public.calculate_match_points();
