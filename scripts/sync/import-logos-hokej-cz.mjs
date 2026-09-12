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
//     hokej.cz nalezeno -- stránka používá jen vlastní logo webu
//     (hokej.cz), ne logo ligy. `competitions.logo_url` proto tenhle
//     skript nenastavuje, zůstává `null` jako dosud.
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

  console.log(
    `Hotovo: ${teamLogoRows.length} log klubů uloženo. Logo soutěže samotné (competitions.logo_url) ` +
      `hokej.cz nenabízí, zůstává beze změny.`,
  );
}

await main();
