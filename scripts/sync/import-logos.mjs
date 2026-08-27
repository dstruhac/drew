// Jednorázový import log soutěže + klubů Chance Ligy z lfafotbal.cz
// (docs/PROJECT.md, kroky 6+7, 27.8.2026). Zdroje ověřené ručně v chatu
// přes db-probe.yml/api-probe.yml, ne odhadnuté:
//
//   - liga:  https://www.lfafotbal.cz/dokument/647-logo-chance-liga
//            (ZIP, obsahuje PNG/JPG/PDF/EPS/AI v několika barvách)
//   - kluby: https://www.lfafotbal.cz/dokument/725-loga-klubu-chance-ligy-2026-2027
//            (ZIP, jen PDF/AI -- žádné PNG, proto níže převod přes
//            pdftoppm+ImageMagick)
//
// Mapování zkratka -> název týmu ověřeno proti skutečným hodnotám
// matches.home_team/away_team (dotaz přes db-probe.yml) -- 16 klubů,
// 16 zkratek, žádná nejistá shoda.
//
// Běží jen v GitHub Actions (.github/workflows/import-logos.yml), ne
// lokálně ani v appce -- potřebuje `unzip`, `pdftoppm` (poppler-utils)
// a `convert` (imagemagick) na systémové PATH.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSupabaseClient } from "./lib/supabase-client.mjs";

const COMPETITION_NAME = "Chance Liga";
const LEAGUE_LOGO_URL = "https://www.lfafotbal.cz/dokument/647-logo-chance-liga";
const LEAGUE_LOGO_ENTRY =
  "Logopack-ChanceLiga/Horizontal/Deep Blue/RGB/ChanceLiga-Horiz-DeepBlue-RGB.png";
const CLUB_LOGOS_URL =
  "https://www.lfafotbal.cz/dokument/725-loga-klubu-chance-ligy-2026-2027";

// zkratka v souboru "_XXX_logo.pdf" -> přesný team_name, jak ho appka má
// uložený v matches.home_team/away_team (scrapováno z livesport.cz).
const TEAM_NAME_BY_CODE = {
  PLZ: "Viktoria Plzeň",
  HKR: "Hradec Králové",
  FCS: "Slovácko",
  ZBR: "Zbrojovka Brno",
  SKS: "Slavia Praha",
  BOH: "Bohemians",
  TEP: "Teplice",
  FKP: "Pardubice",
  ACS: "Sparta Praha",
  SIG: "Sigma Olomouc",
  MBL: "Mladá Boleslav",
  FKJ: "Jablonec",
  ART: "Artis Brno",
  FCZ: "Zlín",
  FCB: "Baník Ostrava",
  LIB: "Slovan Liberec",
};

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function downloadZip(url, destDir) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (drew-app logo import)" },
  });
  if (!res.ok) throw new Error(`Stažení ${url} selhalo: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const zipPath = join(destDir, "archive.zip");
  await import("node:fs/promises").then((fs) => fs.writeFile(zipPath, buffer));
  const extractDir = join(destDir, "extracted");
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", extractDir]);
  return extractDir;
}

function findFile(dir, predicate) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__MACOSX") continue;
        stack.push(full);
      } else if (predicate(entry.name, full)) {
        return full;
      }
    }
  }
  return null;
}

function findAllFiles(dir, predicate) {
  const results = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__MACOSX") continue;
        stack.push(full);
      } else if (predicate(entry.name, full)) {
        results.push(full);
      }
    }
  }
  return results;
}

// Zdrojový soubor (PDF vykreslené na celou stránku, nebo rovnou PNG) má
// kolem loga často velký bílý okraj -- ImageMagick ho ořízne na skutečný
// obsah + přidá malý jednotný padding, ať logo nesedí těsně u okraje.
// U PDF navíc předchází pdftoppm (rasterizace vektoru), PNG stačí jen
// oříznout.
function toTrimmedPng(sourcePath, outPngPath) {
  let rasterPath = sourcePath;
  if (sourcePath.toLowerCase().endsWith(".pdf")) {
    const tmpBase = outPngPath.replace(/\.png$/, "-raw");
    execFileSync("pdftoppm", ["-png", "-r", "300", "-singlefile", sourcePath, tmpBase]);
    rasterPath = `${tmpBase}.png`;
  }
  execFileSync("convert", [
    rasterPath,
    "-trim",
    "+repage",
    "-bordercolor",
    "white",
    "-border",
    "20",
    outPngPath,
  ]);
}

async function uploadPng(supabase, storagePath, filePath) {
  const data = readFileSync(filePath);
  const { error } = await supabase.storage
    .from("logos")
    .upload(storagePath, data, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Upload ${storagePath} selhal: ${error.message}`);
  const { data: publicUrlData } = supabase.storage.from("logos").getPublicUrl(storagePath);
  return publicUrlData.publicUrl;
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

  const workDir = mkdtempSync(join(tmpdir(), "logos-"));

  try {
    console.log(`Stahuji logo soutěže: ${LEAGUE_LOGO_URL}`);
    const leagueDir = await downloadZip(LEAGUE_LOGO_URL, join(workDir, "league"));
    const leaguePngPath = join(leagueDir, LEAGUE_LOGO_ENTRY);
    const leagueStoragePath = `competitions/${competitionSlug}.png`;
    const leagueLogoUrl = await uploadPng(supabase, leagueStoragePath, leaguePngPath);
    console.log(`Logo soutěže nahráno: ${leagueLogoUrl}`);

    const { error: updateError } = await supabase
      .from("competitions")
      .update({ logo_url: leagueLogoUrl })
      .eq("id", competition.id);
    if (updateError) throw new Error(`Uložení logo_url selhalo: ${updateError.message}`);

    console.log(`Stahuji loga klubů: ${CLUB_LOGOS_URL}`);
    const clubsDir = await downloadZip(CLUB_LOGOS_URL, join(workDir, "clubs"));
    // Jen top-level "_XXX_logo.(pdf|png)" -- vynechává ai/ podsložku
    // (duplicitní AI zdrojáky, ty web nepotřebuje) a skryté macOS smetí.
    // Většina klubů má jen PDF, Jablonec (_FKJ_logo.png) výjimečně rovnou
    // PNG -- obojí zpracuje toTrimmedPng().
    const clubFiles = findAllFiles(clubsDir, (name) => /^_[A-Z]{3}_logo\.(pdf|png)$/.test(name));
    console.log(`Nalezeno ${clubFiles.length} souborů log klubů.`);

    const teamLogoRows = [];
    for (const sourcePath of clubFiles) {
      const match = sourcePath.match(/_([A-Z]{3})_logo\.(pdf|png)$/);
      const code = match?.[1];
      const teamName = code ? TEAM_NAME_BY_CODE[code] : undefined;
      if (!teamName) {
        console.log(`::warning::Neznámá zkratka klubu "${code}" (${sourcePath}), přeskakuji.`);
        continue;
      }

      const pngPath = join(workDir, `${code}.png`);
      toTrimmedPng(sourcePath, pngPath);

      const teamSlug = slugify(teamName);
      const storagePath = `teams/${competitionSlug}/${teamSlug}.png`;
      const logoUrl = await uploadPng(supabase, storagePath, pngPath);
      console.log(`${code} -> "${teamName}": ${logoUrl}`);

      teamLogoRows.push({ competition_id: competition.id, team_name: teamName, logo_url: logoUrl });
    }

    if (teamLogoRows.length !== Object.keys(TEAM_NAME_BY_CODE).length) {
      console.log(
        `::warning::Očekáváno ${Object.keys(TEAM_NAME_BY_CODE).length} klubů, zpracováno ${teamLogoRows.length}.`,
      );
    }

    const { error: upsertError } = await supabase
      .from("team_logos")
      .upsert(teamLogoRows, { onConflict: "competition_id,team_name" });
    if (upsertError) throw new Error(`Uložení team_logos selhalo: ${upsertError.message}`);

    console.log(`Hotovo: logo soutěže + ${teamLogoRows.length} log klubů uloženo.`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

await main();
