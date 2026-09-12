// Import log tří evropských pohárů (Liga mistrů, Evropská liga,
// Konferenční liga) z footylogos.com (12.9.2026, na žádost uživatele --
// zdroje https://www.footylogos.com/competition/uefa-champions-league,
// /europa-league, /uefa-conference-league).
//
// Zdroj a URL vzor ověřené ručně v chatu přes api-probe.yml (obyčejný
// curl -- footylogos.com na rozdíl od seeklogo.com NENÍ za Cloudflare
// ochranou, žádný prohlížeč není potřeba):
//   - stránka soutěže má v <script type="application/ld+json"> čistý
//     seznam všech "confirmed" klubů dané soutěže (name + /logos/{slug}
//     URL) -- žádné scrapování HTML struktury není potřeba, tenhle
//     skript ale používá už předem ověřené slugy (viz mapování níže),
//     ne živé parsování JSON-LD.
//   - barevné (ne černobílé) logo soutěže i každého klubu je vždy na
//     `https://assets.footylogos.com/logos/{slug}/{slug}-logo-footylogos.svg`
//     -- ověřeno na soutěžích i na klubech různé velikosti (Arsenal,
//     Sabah FK, FK Jablonec), vždy HTTP 200 + platné SVG.
//   - licence: `https://www.footylogos.com/logo-usage-right` výslovně
//     NEDÁVÁ obecné svolení k použití ("Download availability is not a
//     licence or rights transfer"), ale zároveň uvádí, že "editorial,
//     reporting, research, commentary and identification uses may be
//     treated differently from commercial uses" -- přesně tohle je
//     případ appky: logo slouží jen k identifikaci soutěže/klubu ve
//     scoreboardu nekomerční appky pro uzavřenou partu kamarádů, ne k
//     merchandisingu/reklamě. Vyhodnoceno jako nízké riziko, stejné
//     zdůvodnění jako u předchozích zdrojů log (hokej.cz, seeklogo.com).
//
// Mapování team_name (jak ho appka má uložené v matches.home_team/
// away_team, scrapováno z livesport.cz) -> slug na footylogos.com:
//   - Liga mistrů: VŠECH 36 klubů ověřeno přes db-probe.yml (reálné
//     home_team/away_team bez kódu země -- ten se u livesport.cz drží
//     jen u zápasů z kvalifikace, jakmile klub postoupí do hlavní
//     fáze, appka ho scrapuje bez kódu) proti seznamu 36 klubů na
//     footylogos.com -- jednoznačná shoda (mj. "AS Řím"->AS Roma,
//     "Neapol"->Napoli, "RB Lipsko"->RB Leipzig -- appka scrapuje
//     livesport.cz s českými názvy klubů, footylogos.com má anglické).
//   - Evropská liga: 35 z 36 klubů ověřeno stejně -- "Real Sociedad"
//     se v `matches` zatím nevyskytuje (jejich první zápas v appce
//     ještě nebyl odehraný/scrapovaný), takže appka nemá s čím
//     ověřit správný tvar názvu -- vynechána, doplní se při dalším
//     spuštění tohohle skriptu, až livesport.cz zápas s jejich účastí
//     naimportuje.
//   - Konferenční liga: VŠECHNY zápasy v `matches` byly ke dni importu
//     ještě ve fázi kvalifikace (každý home_team/away_team měl kód
//     země), takže appka nemá jediný ověřený "finální" tvar názvu
//     klubu k porovnání proti footylogos.com -- klubová loga proto
//     tahle soutěž zatím nemá vůbec, jen logo soutěže samotné (bezpečné
//     vždy, nezávisí na názvech týmů). Doplní se stejným skriptem, až
//     se objeví první zápas v `matches` bez kódu země.
//
// Běží jen v GitHub Actions (.github/workflows/import-logos-footylogos.yml),
// ne lokálně ani v appce.

import { createSupabaseClient } from "./lib/supabase-client.mjs";

const COMPETITIONS = [
  {
    dbName: "Liga mistrů",
    footylogosSlug: "uefa-champions-league",
    teamSlugByName: {
      AEK: "aek-athens",
      "AS Řím": "roma",
      Arsenal: "arsenal",
      "Aston Villa": "aston-villa",
      "Atl. Madrid": "atletico-madrid",
      Barcelona: "fc-barcelona",
      Bayern: "bayern-munich",
      Betis: "real-betis-balompie",
      "Bodo/Glimt": "fk-bodo-glimt",
      "Club Bruggy": "club-brugge",
      Como: "como-1907",
      Dortmund: "borussia-dortmund",
      "FC Porto": "fc-porto",
      Fenerbahce: "fenerbahce",
      Feyenoord: "feyenoord",
      Galatasaray: "galatasaray",
      Inter: "inter-milan",
      LASK: "lask",
      Lens: "rc-lens",
      Lille: "losc-lille",
      Liverpool: "liverpool-fc",
      "Manchester City": "manchester-city",
      "Manchester Utd": "manchester-united",
      Neapol: "napoli",
      PSG: "paris-saint-germain-psg",
      PSV: "psv-eindhoven",
      "RB Lipsko": "rb-leipzig",
      "Real Madrid": "real-madrid",
      "Sabah Baku": "sabah-fk",
      "Slavia Praha": "slavia-praha",
      "Slovan Bratislava": "sk-slovan-bratislava",
      Sporting: "sporting-cp",
      Stuttgart: "vfb-stuttgart",
      Viking: "viking-fk",
      Villarreal: "villarreal-cf",
      Šachtar: "shakhtar-donetsk",
    },
  },
  {
    dbName: "Evropská liga",
    footylogosSlug: "europa-league",
    teamSlugByName: {
      "AC Milán": "ac-milan",
      Alkmaar: "az-alkmaar",
      Anderlecht: "rsc-anderlecht",
      "Ararat-Armenia": "fc-ararat-armenia",
      Benfica: "sl-benfica",
      Besiktas: "besiktas",
      Bournemouth: "afc-bournemouth",
      Celje: "nk-celje",
      "Celta Vigo": "celta-vigo",
      Celtic: "celtic",
      "Crystal Palace": "crystal-palace",
      "Din. Záhřeb": "gnk-dinamo-zagreb",
      Ferencváros: "ferencvaros-tc",
      "H. Beer Sheva": "hapoel-beer-sheva",
      Hoffenheim: "tsg-hoffenheim",
      Jagiellonia: "jagiellonia-bialystok",
      Juventus: "juventus",
      Lech: "lech-poznan",
      Leverkusen: "bayer-leverkusen",
      Levski: "levski-sofia",
      Lilleström: "lillestrom-sk",
      Lyon: "olympique-lyonnais",
      Marseille: "olympique-de-marseille-om",
      Nijmegen: "nec-nijmegen",
      "OFI Kréta": "ofi-crete",
      Olympiakos: "olympiacos",
      Omonia: "ac-omonia-nicosia",
      Rennes: "stade-rennais",
      "Royale Union SG": "union-saint-gilloise",
      Salzburg: "red-bull-salzburg",
      "Sparta Praha": "sparta-praha",
      "Sturm Graz": "sk-sturm-graz",
      Sunderland: "sunderland",
      Torreense: "scu-torreense",
      "Viktoria Plzeň": "viktoria-plzen",
    },
  },
  {
    dbName: "Konferenční liga",
    footylogosSlug: "uefa-conference-league",
    // Žádné klubové mapování -- viz vysvětlení v hlavičce souboru
    // (appka zatím nemá v `matches` jediný ověřený "finální" tvar
    // názvu klubu bez kódu země).
    teamSlugByName: {},
  },
];

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function logoUrlForSlug(slug) {
  return `https://assets.footylogos.com/logos/${slug}/${slug}-logo-footylogos.svg`;
}

async function downloadSvg(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (drew-app logo import)" },
  });
  if (!res.ok) throw new Error(`Stažení ${url} selhalo: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadSvg(supabase, storagePath, buffer) {
  const { error } = await supabase.storage
    .from("logos")
    .upload(storagePath, buffer, { contentType: "image/svg+xml", upsert: true });
  if (error) throw new Error(`Upload ${storagePath} selhal: ${error.message}`);
  const { data } = supabase.storage.from("logos").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function main() {
  const supabase = createSupabaseClient();

  for (const { dbName, footylogosSlug, teamSlugByName } of COMPETITIONS) {
    const { data: competition, error: competitionError } = await supabase
      .from("competitions")
      .select("id, name")
      .eq("name", dbName)
      .single();
    if (competitionError || !competition) {
      throw new Error(
        `Competition "${dbName}" nenalezena: ${competitionError?.message ?? "žádný řádek"}`,
      );
    }
    const competitionSlug = slugify(competition.name);

    console.log(`\n== ${dbName} ==`);

    const leagueBuffer = await downloadSvg(logoUrlForSlug(footylogosSlug));
    const leagueLogoUrl = await uploadSvg(
      supabase,
      `competitions/${competitionSlug}.svg`,
      leagueBuffer,
    );
    const { error: competitionUpdateError } = await supabase
      .from("competitions")
      .update({ logo_url: leagueLogoUrl })
      .eq("id", competition.id);
    if (competitionUpdateError) {
      throw new Error(`Uložení logo_url soutěže selhalo: ${competitionUpdateError.message}`);
    }
    console.log(`Logo soutěže nahráno: ${leagueLogoUrl}`);

    const teamLogoRows = [];
    for (const [teamName, teamSlug] of Object.entries(teamSlugByName)) {
      const buffer = await downloadSvg(logoUrlForSlug(teamSlug));
      const storagePath = `teams/${competitionSlug}/${slugify(teamName)}.svg`;
      const logoUrl = await uploadSvg(supabase, storagePath, buffer);
      console.log(`"${teamName}" (${teamSlug}) -> ${logoUrl}`);
      teamLogoRows.push({ competition_id: competition.id, team_name: teamName, logo_url: logoUrl });
    }

    if (teamLogoRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("team_logos")
        .upsert(teamLogoRows, { onConflict: "competition_id,team_name" });
      if (upsertError) throw new Error(`Uložení team_logos selhalo: ${upsertError.message}`);
    }

    console.log(`Hotovo: logo soutěže + ${teamLogoRows.length} log klubů uloženo.`);
  }
}

await main();
