-- Oprava chybně "budoucích" dohraných zápasů (18.9.2026, nahlásil
-- uživatel jako "špatné řazení proběhlých zápasů" u Ligy mistrů a
-- Evropské ligy).
--
-- Příčina: scraper výsledků (scripts/sync/lib/scrape-livesport.mjs,
-- inferYear()) používal pro stránku VÝSLEDKŮ stejnou heuristiku jako
-- pro rozpis budoucích zápasů -- "když by vyšlo datum víc než ~2 měsíce
-- v minulosti, jde o příští rok". Správně pro rozpis (dívá se dopředu),
-- špatně pro výsledky (dívá se dozadu, kde starší dohraný zápas je
-- normální -- klidně celá sezóna, ne jen pár týdnů). Liga mistrů a
-- Evropská liga byly založené 8.9.2026 a appka jim hned při prvním běhu
-- sync-results "zpětně dotáhla" celou sezónu včetně červencových
-- předkol -- ta byla v tu chvíli přes 2 měsíce stará, appka jim proto
-- omylem posunula kickoff_at o rok dopředu (2026 -> 2027). V appce se
-- to projevilo jako zápasy vyskakující úplně nahoru v sekci "Proběhlé"
-- (řazeno od nejnovějšího data výkopu).
--
-- Oprava scraperu (parametr `direction` u inferYear/parseKickoffAt,
-- viz scrape-livesport.mjs) brání opakování. Tahle migrace opravuje
-- už poškozená data.
--
-- Bezpečný filtr: dohraný zápas (status='finished') nikdy nemůže mít
-- výkop v budoucnosti -- pokud má, jde vždycky o tenhle bug, ne o
-- legitimní stav. Ověřeno 18.9.2026 přes db-probe.yml: přesně 25
-- takových řádků, všechny v Lize mistrů a Evropské lize, všechny
-- datované 2027-07-07 až 2027-07-16 (typické datum červencových
-- předkol o rok dřív).
update public.matches
set kickoff_at = kickoff_at - interval '1 year'
where status = 'finished'
  and kickoff_at > now();
