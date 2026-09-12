// Jednorázový import log klubů Hokejové extraligy z hokej.cz (12.9.2026,
// na žádost uživatele -- zdroj https://www.hokej.cz/tipsport-extraliga/tymy).
// Stejný vzor jako import-logos-football-logos-cc.mjs (Premier League) --
// zdroj dává rovnou hotové PNG, žádná konverze (pdftoppm/ImageMagick)
// není potřeba.
//
// Zdroj a URL vzor ověřené ručně v chatu přes playwright-probe.yml/
// api-probe.yml (ne odhadnuté):
//   - stránka https://www.hokej.cz/tipsport-extraliga/tymy vykresluje
//     logo každého klubu jako <img> s `src`/`srcset` tvaru
//     `https://www.hokej.cz/min.php?file=%2Ffiles%2Flogos%2F{code}.png&w=64`
//     (`min.php` je zřejmě obecná resizovací proxy webu hokej.cz) --
//     stejný vzor funguje i s vyšším `w`, ověřeno na `w=512` (vrací
//     reálné 512x512 PNG, ~16 kB, Content-Type hlavička je sice
//     nesprávně "image/jpeg", ale bajty jsou platné PNG -- stejná
//     neshoda jako u loga Chance Ligy, řešeno stejně: content type při
//     uploadu do Storage nastavujeme sami napevno na "image/png").
//   - `{code}` je součástí názvu souboru na hokej.cz (např. "wueb1-spa"
//     pro Spartu, "PCE-2x" pro Pardubice) -- nejde o žádnou stabilní
//     appkou zvolenou zkratku, jen konkrétní hodnota nalezená na
//     stránce ke dni importu. Pokud si hokej.cz soubory někdy
//     přejmenuje, tenhle skript (spouští se jen ručně, ne na
//     schedule) by bylo potřeba znovu ověřit/aktualizovat.
//   - žádné dedikované logo samotné soutěže ("Tipsport extraliga") na
//     hokej.cz nenalezeno -- stránka používá jen vlastní logo webu
//     (hokej.cz), ne logo ligy.
//
// Logo soutěže doplněno dodatečně (12.9.2026, na žádost uživatele,
// zdroj https://seeklogo.com/vector-logo/265720/tipsport-extraliga) --
// konkrétní URL obrázku ověřená stejně přes playwright-probe.yml
// (hlavní stránka seeklogo.com je za Cloudflare "managed challenge",
// curl na ni dostane jen JS výzvu -- skutečný prohlížeč přes
// Playwright se ale dostal až na obsah). Samotný soubor
// (`images.seeklogo.com/.../tipsport-extraliga-logo-png_seeklogo-265720.png`,
// 600x600 PNG) leží na jiné subdoméně BEZ Cloudflare ochrany -- ověřeno
// přes api-probe.yml (obyčejný curl, HTTP 200, platná PNG hlavička),
// takže ho jde stáhnout stejným prostým `fetch()` jako loga klubů.
//
// **Rozdíl oproti lfafotbal.cz/football-logos.cc, na který appka
// nemá odpověď, jen ho vědomě akceptuje:** seeklogo.com je obecný
// agregátor firemních/sportovních log, na stránce loga ani (dostupně)
// na `/page/terms-of-use` appka nenašla žádné výslovné svolení k
// dalšímu použití (na rozdíl od explicitní licence u
// football-logos.cc nebo oficiálního dokumentu klubu u lfafotbal.cz).
// Riziko vyhodnoceno jako stejně nízké jako u klubových log výše --
// logo slouží jen k identifikaci soutěže uvnitř appky pro uzavřenou
// nekomerční partu kamarádů -- ale je to jiná kategorie zdroje než
// dřívější dvě, proto zdůrazněno zvlášť.
//
// Mapování team_name (jak ho appka má uložené v matches.home_team/
// away_team, scrapováno z livesport.cz) -> kód souboru na hokej.cz
// ověřeno přes db-probe.yml (distinct home_team/away_team pro
// Hokejovou extraligu 2026/27) proti seznamu klubů na stránce -- 14
// klubů, 14 kódů, jednoznačná shoda (alt text u obrázku, např.
// "Hr. Králové", odpovídá appčinu "Mountfield HK" stejně jako jinde
// v appce -- Hradec Králové hraje pod komerčním názvem Mountfield HK).
//
// Licence/podmínky použití nejsou na hokej.cz nikde explicitně
// vypsané (na rozdíl od lfafotbal.cz/football-logos.cc, kde appka
// předtím dohledala konkrétní stránku s podmínkami) -- klubové znaky
// se ale používají jen jako identifikace týmu uvnitř appky pro
// uzavřenou skupinu kamarádů, nekomerčně, stejný praktický rozsah
// jako u obou předchozích zdrojů.
//
// Běží jen v GitHub Actions (.github/workflows/import-logos-hokej-cz.yml),
// ne lokálně ani v appce.

import { createSupabaseClient } from "./lib/supabase-client.mjs";

const COMPETITION_NAME = "Hokejová extraliga 2026/27";
const LOGO_WIDTH = 512;
const LEAGUE_LOGO_URL =
  "https://images.seeklogo.com/logo-png/26/1/tipsport-extraliga-logo-png_seeklogo-265720.png";

const TEAM_CODE_BY_NAME = {
  "České Budějovice": "4zj2z-ceb",
  "Mountfield HK": "j9qyt-hkr",
  "Karlovy Vary": "hokejv-byd",
  Kladno: "7wb9o-kla",
  "Kometa Brno": "8oo52-kom",
  Liberec: "i5lg4-lib",
  Litvínov: "ifboo-lit",
  "Mladá Boleslav": "k1yj3-mbl",
  Olomouc: "y4tmv-olo",
  Pardubice: "PCE-2x",
  Plzeň: "pijgb-plz",
  "Sparta Praha": "wueb1-spa",
  Třinec: "ccek3-tri",
  Vítkovice: "65gcx-vit",
};

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function logoUrlForCode(code) {
  return `https://www.hokej.cz/min.php?file=${encodeURIComponent(`/files/logos/${code}.png`)}&w=${LOGO_WIDTH}`;
}

async function downloadPng(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (drew-app logo import)" },
  });
  if (!res.ok) throw new Error(`Stažení obrázku ${url} selhalo: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadPng(supabase, storagePath, buffer) {
  const { error } = await supabase.storage
    .from("logos")
    .upload(storagePath, buffer, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Upload ${storagePath} selhal: ${error.message}`);
  const { data } = supabase.storage.from("logos").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function main() {
  const supabase = createSupabaseClient();

  const { data: competition, error: competitionError } = await supabase
    .from("competitions")
    .select("id, name")
    .eq("name", COMPETITION_NAME)
    .single();
  if (competitionError || !competition) {
    throw new Error(
      `Competition "${COMPETITION_NAME}" nenalezena: ${competitionError?.message ?? "žádný řádek"}`,
    );
  }
  const competitionSlug = slugify(competition.name);

  const leagueLogoBuffer = await downloadPng(LEAGUE_LOGO_URL);
  const leagueLogoUrl = await uploadPng(
    supabase,
    `competitions/${competitionSlug}.png`,
    leagueLogoBuffer,
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
  for (const [teamName, code] of Object.entries(TEAM_CODE_BY_NAME)) {
    const sourceUrl = logoUrlForCode(code);
    const buffer = await downloadPng(sourceUrl);
    const storagePath = `teams/${competitionSlug}/${slugify(teamName)}.png`;
    const logoUrl = await uploadPng(supabase, storagePath, buffer);
    console.log(`"${teamName}" (${code}) -> ${logoUrl}`);
    teamLogoRows.push({ competition_id: competition.id, team_name: teamName, logo_url: logoUrl });
  }

  const { error: upsertError } = await supabase
    .from("team_logos")
    .upsert(teamLogoRows, { onConflict: "competition_id,team_name" });
  if (upsertError) throw new Error(`Uložení team_logos selhalo: ${upsertError.message}`);

  console.log(`Hotovo: logo soutěže + ${teamLogoRows.length} log klubů uloženo.`);
}

await main();
