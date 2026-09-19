// Kopíruje status/skóre/prodloužení ze zdrojového zápasu (matches.id)
// do jeho kopií v hecovačkách (matches.source_match_id) -- žádné nové
// scrapování, appka jen čte vlastní databázi. Zápis přes .update() (ne
// upsert) spustí existující bodovací trigger (matches_calculate_points)
// stejně, jako by appka zápas synchronizovala odkudkoliv jinud.
//
// Přesunuto sem ze scripts/sync/hecovacky.mjs (19.9.2026) -- appka to
// dřív dělala jen jako součást hecovacky.mjs, který ale běžel jen na
// ruční spuštění/vlastní cron-job.org úlohu -- ta se ukázala nespolehlivá
// (přestala spouštět 2 dny bez povšimnutí, uživatel nahlásil "výsledky
// v hecovačce se nepropisují"). sync-results.mjs běží spolehlivě každých
// 30 minut (ověřeno přes historii běhů, 700+ bez výpadku), takže appka
// teď propagaci dělá TAM -- jeden méně křehký vnější cron navíc k
// hlídání. Výběr NOVÝCH zápasů do hecovačky zůstává v hecovacky.mjs
// (na rychlosti nezáleží, stačí jednou denně).
export async function propagateSourceMatchScores(supabase) {
  const { data: copies, error: copiesError } = await supabase
    .from("matches")
    .select("id, source_match_id, status, home_score, away_score, overtime_flag")
    .not("source_match_id", "is", null);
  if (copiesError) throw new Error(`Nepodařilo se načíst kopie zápasů hecovaček: ${copiesError.message}`);
  if (!copies || copies.length === 0) return 0;

  const sourceIds = [...new Set(copies.map((c) => c.source_match_id))];
  const { data: sources, error: sourcesError } = await supabase
    .from("matches")
    .select("id, status, home_score, away_score, overtime_flag")
    .in("id", sourceIds);
  if (sourcesError) throw new Error(`Nepodařilo se načíst zdrojové zápasy: ${sourcesError.message}`);

  const sourceById = new Map((sources ?? []).map((s) => [s.id, s]));
  let updated = 0;

  for (const copy of copies) {
    const source = sourceById.get(copy.source_match_id);
    if (!source) continue; // zdrojový zápas mezitím smazán -- cascade delete to vyřeší samo

    const changed =
      copy.status !== source.status ||
      copy.home_score !== source.home_score ||
      copy.away_score !== source.away_score ||
      copy.overtime_flag !== source.overtime_flag;
    if (!changed) continue;

    const { error: updateError } = await supabase
      .from("matches")
      .update({
        status: source.status,
        home_score: source.home_score,
        away_score: source.away_score,
        overtime_flag: source.overtime_flag,
      })
      .eq("id", copy.id);
    if (updateError) throw new Error(`Propagace skóre pro zápas ${copy.id} selhala: ${updateError.message}`);

    updated += 1;
  }

  return updated;
}
