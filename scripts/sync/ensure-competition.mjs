// Jednorázový/idempotentní nástroj: založí competition (pokud podle
// name+sport ještě neexistuje) nebo jí doplní/aktualizuje
// scrape_source/scrape_path (pokud existuje, ale nemá je nastavené).
// Nikdy nic nemaže ani nepřepisuje jiná pole (points_*, status).
//
// Proč existuje: appka zatím nemá self-service zakládání competitions
// (viz supabase/migrations/20260824120300_competitions.sql) — dřív se
// to dělalo ručně přes Supabase SQL editor. Tenhle skript dělá totéž
// bezpečně (idempotentně, service role klíčem) z GitHub Actions, kam
// Claude Code session dosáhne i přes síťové omezení sandboxu (viz
// CLAUDE.md).
//
// Použití (env proměnné, spouští ensure-competition.yml):
//   COMPETITION_NAME, COMPETITION_SPORT, SCRAPE_SOURCE, SCRAPE_PATH

import { createSupabaseClient } from "./lib/supabase-client.mjs";

async function main() {
  const name = process.env.COMPETITION_NAME;
  const sport = process.env.COMPETITION_SPORT;
  const scrapeSource = process.env.SCRAPE_SOURCE;
  const scrapePath = process.env.SCRAPE_PATH;

  if (!name || !sport || !scrapeSource || !scrapePath) {
    throw new Error(
      "Chybí COMPETITION_NAME, COMPETITION_SPORT, SCRAPE_SOURCE nebo SCRAPE_PATH v prostředí.",
    );
  }

  const supabase = createSupabaseClient();

  const { data: existing, error: selectError } = await supabase
    .from("competitions")
    .select("id, name, sport, scrape_source, scrape_path")
    .eq("name", name)
    .eq("sport", sport)
    .maybeSingle();

  if (selectError) throw new Error(`Nepodařilo se ověřit existenci: ${selectError.message}`);

  if (!existing) {
    const { data: inserted, error: insertError } = await supabase
      .from("competitions")
      .insert({ name, sport, scrape_source: scrapeSource, scrape_path: scrapePath })
      .select()
      .single();

    if (insertError) throw new Error(`Založení competition selhalo: ${insertError.message}`);

    console.log(`Založena nová competition: ${JSON.stringify(inserted)}`);
    return;
  }

  if (existing.scrape_source === scrapeSource && existing.scrape_path === scrapePath) {
    console.log(`Competition už existuje a scrape_source/scrape_path už sedí: ${JSON.stringify(existing)}`);
    return;
  }

  const { data: updated, error: updateError } = await supabase
    .from("competitions")
    .update({ scrape_source: scrapeSource, scrape_path: scrapePath })
    .eq("id", existing.id)
    .select()
    .single();

  if (updateError) throw new Error(`Aktualizace scrape_source/scrape_path selhala: ${updateError.message}`);

  console.log(`Competition existovala, doplněno scrape_source/scrape_path: ${JSON.stringify(updated)}`);
}

await main();
