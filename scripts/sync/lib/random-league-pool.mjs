// Skupina známých lig, ze kterých "Náhodná liga" každý den vybírá 5
// zápasů (viz random-league.mjs). Vybráno s uživatelem 30.8.2026 —
// zámerně jen "známé" ligy (ne úplně cokoliv z livesport.cz, který má
// v jeden den přes 450 fotbalových zápasů napříč úplně všemi zeměmi
// světa, viz PROJECT.md) + brazilská Série A speciálně kvůli pokrytí
// evropského léta (červen–půlka srpna), kdy evropský fotbal i hokej
// mají mimosezónu najednou.
export const RANDOM_LEAGUE_POOL = [
  { sport: "football", name: "Chance Liga", scrapePath: "fotbal/cesko/chance-liga" },
  { sport: "football", name: "Premier League", scrapePath: "fotbal/anglie/premier-league" },
  { sport: "football", name: "Bundesliga", scrapePath: "fotbal/nemecko/bundesliga" },
  { sport: "football", name: "La Liga", scrapePath: "fotbal/spanelsko/laliga" },
  { sport: "football", name: "Serie A", scrapePath: "fotbal/italie/serie-a" },
  { sport: "football", name: "Ligue 1", scrapePath: "fotbal/francie/ligue-1" },
  { sport: "football", name: "Niké liga", scrapePath: "fotbal/slovensko/nike-liga" },
  { sport: "football", name: "Brazilská Série A", scrapePath: "fotbal/brazilie/serie-a" },
  { sport: "hockey", name: "Tipsport extraliga", scrapePath: "hokej/cesko/tipsport-extraliga" },
  { sport: "hockey", name: "NHL", scrapePath: "hokej/usa/nhl" },
  { sport: "hockey", name: "Tipos extraliga", scrapePath: "hokej/slovensko/tipos-extraliga" },
  { sport: "hockey", name: "SHL", scrapePath: "hokej/svedsko/shl" },
  { sport: "hockey", name: "National League", scrapePath: "hokej/svycarsko/national-league" },
];
