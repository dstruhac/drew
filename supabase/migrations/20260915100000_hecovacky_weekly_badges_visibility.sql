-- Nalezeno Codex review 15.9.2026: weekly_badges_select_authenticated
-- (20260827130000_weekly_badges.sql) je `using (true)` -- appka to
-- tehdy navrhla schválně jako "kdokoliv přihlášený vidí všechny
-- udělené medaile", protože appka měla jen veřejné soutěže. Teď, když
-- existují i soukromé hecovačky (award-weekly-badges.mjs prochází
-- VŠECHNY competitions bez rozdílu), by tahle politika komukoliv
-- přihlášenému dovolila přes Supabase REST API přímo vyčíst
-- competition_id/user_id/týden/body medailí i u hecovačky, které není
-- participant -- reálný únik dat u soutěže, která má být soukromá.
--
-- Oprava: stejné pravidlo viditelnosti jako u competitions/matches/
-- competition_participants/hecovacka_sources (20260915090000) --
-- veřejnou soutěž vidí každý, soukromou jen tvůrce/participant.
drop policy "weekly_badges_select_authenticated" on public.weekly_badges;

create policy "weekly_badges_select_visible"
  on public.weekly_badges for select
  to authenticated
  using (public.hecovacka_is_visible(competition_id));
