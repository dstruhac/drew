-- Fixes a gap found during manual demo testing: locking only compared
-- kickoff_at to now(), so a match manually marked 'finished' (via SQL
-- editor) before its stored kickoff_at time actually passed still let
-- users write/edit predictions on it. A match should also be locked the
-- moment its outcome is known, regardless of the literal kickoff_at
-- timestamp -- so these policies now require BOTH "kickoff hasn't
-- happened yet" AND "status is still scheduled" to allow a write, and
-- unlock visibility to everyone when EITHER condition trips.
drop policy "predictions_select_own_or_locked" on public.predictions;
create policy "predictions_select_own_or_locked"
  on public.predictions for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and (m.kickoff_at <= now() or m.status <> 'scheduled')
    )
  );

drop policy "predictions_insert_own_before_kickoff" on public.predictions;
create policy "predictions_insert_own_before_kickoff"
  on public.predictions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.kickoff_at > now()
        and m.status = 'scheduled'
    )
  );

drop policy "predictions_update_own_before_kickoff" on public.predictions;
create policy "predictions_update_own_before_kickoff"
  on public.predictions for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.kickoff_at > now()
        and m.status = 'scheduled'
    )
  );

drop policy "predictions_delete_own_before_kickoff" on public.predictions;
create policy "predictions_delete_own_before_kickoff"
  on public.predictions for delete
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and m.kickoff_at > now()
        and m.status = 'scheduled'
    )
  );
