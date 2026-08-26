-- Maps a competition to the page it gets scraped from. A competition
-- with scrape_source left NULL is simply skipped by sync-fixtures /
-- sync-results (manual demo competitions keep working unchanged).
--
-- scrape_path is the URL path segment on livesport.cz that identifies
-- the league, e.g. 'fotbal/cesko/chance-liga' for
-- https://www.livesport.cz/fotbal/cesko/chance-liga/program/ — kept
-- provider-agnostic in name (scrape_source, not livesport_slug) so a
-- second/alternate source can reuse the same columns later without a
-- migration.
alter table public.competitions
  add column scrape_source text,
  add column scrape_path text;
