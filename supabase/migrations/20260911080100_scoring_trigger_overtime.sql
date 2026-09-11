-- Rozšiřuje matches_calculate_points (20260825100000_scoring_trigger.sql)
-- o bod za správně tipnuté prodloužení/nájezdy (points_overtime, viz
-- předchozí migrace) -- create or replace function nahrazuje tělo
-- funkce, trigger samotný (kdy se spouští) se nemění.
--
-- OT bod je NEZÁVISLÝ na exact/winner/total_goals větvi -- přičítá se
-- vždy navíc, i když hráč trefil přesný tip. Uplatní se jen tehdy, kdy
-- OBĚ strany (tip i skutečnost) mají vyplněnou hodnotu -- u fotbalu je
-- predicted_overtime_flag vždy null (formulář checkbox u fotbalu vůbec
-- nezobrazí, viz prediction-form.tsx), takže se tam bod nikdy
-- neuplatní bez ohledu na to, co appka zapíše do matches.overtime_flag.
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

  select points_exact, points_winner, points_total_goals, points_overtime
    into comp
    from public.competitions
    where id = new.competition_id;

  update public.predictions p
  set points = (
    case
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
  )
  +
  (case
    when new.overtime_flag is not null
     and p.predicted_overtime_flag is not null
     and p.predicted_overtime_flag = new.overtime_flag
    then comp.points_overtime
    else 0
  end)
  where p.match_id = new.id;

  return new;
end;
$$;
