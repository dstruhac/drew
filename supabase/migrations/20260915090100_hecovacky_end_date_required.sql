-- Oprava: `end_date` byl popsaný jako "povinné pro private" jen v
-- komentáři (20260914090000), appka to ale nikde nevynucovala na
-- úrovni databáze -- nalezeno code review 15.9.2026. Sloupec zůstává
-- nullable (u `public` competitions se nepoužívá vůbec), ale u
-- `private` (hecovačka) appka teď null nedovolí zapsat vůbec, ne jen
-- přes formulář.
alter table public.competitions
  add constraint competitions_hecovacka_end_date_required
    check (visibility = 'public' or end_date is not null);
