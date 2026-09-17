import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type MatchForSharing = { id: string; external_id: string | null };

// Stejný reálný zápas se dokáže objevit ve víc soutěžích najednou
// (typicky "Creme de la Creme liga" nabírá zápasy ze sledovaných
// domácích lig, appka duplikuje i do hecovaček) -- appka po uložení
// tipu propíše stejné skóre i do těchto "sourozeneckých" kopií zápasu
// (viz syncPredictionToDuplicateMatches v actions.ts), ale JEN do
// soutěží, kde hráč zápas taky hraje.
//
// Appka dřív hráči tuhle informaci ukazovala jen jednorázově hned po
// uložení tipu (`syncedCompetitionNames` v actions.ts) -- uživatel
// 17.9.2026 nahlásil, že mu to přišlo matoucí ("kdy se to zobrazuje?
// přijde mi, že jen po zadání akce") a chtěl to radši jako trvalý
// příznak u formuláře, viditelný pokaždé, ne jen jako jednorázová
// hláška po uložení. Tahle funkce proto zjišťuje totéž ZNOVU při
// každém vykreslení stránky (ne z výsledku poslední uložené akce).
export async function findSharedMatchIds(
  supabase: SupabaseClient<Database>,
  matches: MatchForSharing[],
  userId: string | undefined,
): Promise<Set<string>> {
  if (!userId) return new Set();

  const externalIds = [
    ...new Set(matches.map((m) => m.external_id).filter((v): v is string => Boolean(v))),
  ];
  if (externalIds.length === 0) return new Set();

  const { data: siblings } = await supabase
    .from("matches")
    .select("id, external_id, competition_id")
    .in("external_id", externalIds);
  if (!siblings || siblings.length === 0) return new Set();

  const competitionIds = [...new Set(siblings.map((s) => s.competition_id))];
  const { data: participations } = await supabase
    .from("competition_participants")
    .select("competition_id")
    .eq("user_id", userId)
    .in("competition_id", competitionIds);
  const joinedCompetitionIds = new Set((participations ?? []).map((p) => p.competition_id));

  const siblingsByExternalId = new Map<string, typeof siblings>();
  for (const row of siblings) {
    const list = siblingsByExternalId.get(row.external_id!) ?? [];
    list.push(row);
    siblingsByExternalId.set(row.external_id!, list);
  }

  const result = new Set<string>();
  for (const match of matches) {
    if (!match.external_id) continue;
    const group = siblingsByExternalId.get(match.external_id) ?? [];
    const hasJoinedSibling = group.some(
      (sibling) => sibling.id !== match.id && joinedCompetitionIds.has(sibling.competition_id),
    );
    if (hasJoinedSibling) result.add(match.id);
  }
  return result;
}
