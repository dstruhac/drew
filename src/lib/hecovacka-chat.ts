import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type UnreadHecovacka = {
  competitionId: string;
  name: string;
  unreadCount: number;
  // ID zpráv, ze kterých se `unreadCount` skládá -- appka to potřebuje v
  // ChatNotificationIndicator na spolehlivou deduplikaci proti souběžně
  // doručeným živým eventům při reconciliaci (nalezeno Codex review na
  // PR #231, 6. kolo: pouhé číslo nešlo bezpečně poznat od zprávy, kterou
  // čerstvý dotaz už jednou započítal).
  messageIds: string[];
};

export type HecovackaChatMembership = {
  competitionId: string;
  name: string;
};

// Appka chybu dotazu nechává probublat (throw), místo aby ji tiše
// polkla a vrátila prázdné pole -- volající (getUnreadHecovackaChat)
// na tenhle rozdíl spoléhá, aby při přechodném výpadku nesmazal už
// správně zobrazený odznak (nalezeno Codex review na PR #231, 6. kolo:
// appka to samé opravila pro dotaz na ZPRÁVY v předešlém kole, ale
// zapomněla na tenhle, dřívější dotaz na ÚČASTI).
async function getPrivateChatParticipations(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("competition_participants")
    .select("competition_id, chat_last_read_at, competitions!inner(name, visibility)")
    .eq("user_id", userId)
    .eq("competitions.visibility", "private");
  if (error) throw error;
  return data ?? [];
}

// Seznam VŠECH hecovaček, kde hráč hraje (bez ohledu na nepřečtené) --
// appka to potřebuje v ChatNotificationIndicator (nalezeno Codex review
// na PR #231, viz komentář tam), aby uměl přes vlastní realtime
// podpisku poznat i úplně první novou zprávu v hecovačce, která do
// tohohle okamžiku neměla žádnou nepřečtenou. Na chybu appka reaguje
// prázdným seznamem (jen se nezaloží realtime podpiska pro tuhle
// stránku, ne kritické -- na rozdíl od getUnreadHecovackaChat níže
// appka tady nemá co "smazat", jen co nezaložit).
export async function getHecovackaChatMemberships(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<HecovackaChatMembership[]> {
  try {
    const participations = await getPrivateChatParticipations(supabase, userId);
    return participations.map((p) => ({
      competitionId: p.competition_id,
      name: p.competitions?.name ?? "",
    }));
  } catch {
    return [];
  }
}

// Použito v AppHeader (ikonka vedle fotečky, viditelná odkudkoliv v
// appce) i na Dashboardu (odznak na kartičce konkrétní hecovačky) --
// obojí potřebuje totéž: seznam hecovaček, kde hráč UŽ hraje a má tam
// aspoň jednu nepřečtenou zprávu od NĚKOHO JINÉHO (vlastní zprávy se
// nepočítají, appka je automaticky nepovažuje za "nepřečtené").
//
// `chat_last_read_at` (NULL = nikdy neotevřel chat, vidí tedy vše jako
// nové) appka aktualizuje přes markHecovackaChatRead v actions.ts,
// jakmile hráč záložku Chat skutečně otevře.
//
// Vrací `null` (odlišené od "opravdu nula", tedy `[]`), když dotaz na
// zprávy selže -- appka to používá i pro živou reconciliaci po
// (znovu)připojení (ChatNotificationIndicator), kde by tichá chyba
// jinak vymazala i předtím správně zobrazený odznak (nalezeno Codex
// review na PR #231, 5. kolo). Volající si `null` sám převede na `[]`
// tam, kde nemá předchozí stav co zachovat (první vykreslení stránky).
export async function getUnreadHecovackaChat(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UnreadHecovacka[] | null> {
  let participations;
  try {
    participations = await getPrivateChatParticipations(supabase, userId);
  } catch {
    return null;
  }

  if (participations.length === 0) return [];

  const lastReadByCompetition = new Map(
    participations.map((p) => [p.competition_id, p.chat_last_read_at]),
  );
  const nameByCompetition = new Map(
    participations.map((p) => [p.competition_id, p.competitions?.name ?? ""]),
  );
  const competitionIds = [...lastReadByCompetition.keys()];

  // Appka dotaz na zprávy omezí aspoň na nejstarší práh ze všech
  // hecovaček (kdo nikdy neotevřel, nemá žádný -- pak se nedá omezit
  // vůbec, appka musí číst od začátku), ať s rostoucí historií chatu
  // nečte pokaždé úplně všechno. Přesné odseknutí PER hecovačku appka
  // dopočítá níž v JS, protože každá má jiný práh.
  let oldestThreshold: string | null = null;
  let hasUnboundedThreshold = false;
  for (const p of participations) {
    if (p.chat_last_read_at === null) {
      hasUnboundedThreshold = true;
      continue;
    }
    if (oldestThreshold === null || p.chat_last_read_at < oldestThreshold) {
      oldestThreshold = p.chat_last_read_at;
    }
  }

  let query = supabase
    .from("hecovacka_messages")
    .select("id, competition_id, user_id, created_at")
    .in("competition_id", competitionIds)
    .neq("user_id", userId);
  if (!hasUnboundedThreshold && oldestThreshold) {
    query = query.gt("created_at", oldestThreshold);
  }
  const { data: messages, error } = await query;
  if (error) return null;

  const unreadMessageIds = new Map<string, string[]>();
  for (const m of messages ?? []) {
    const threshold = lastReadByCompetition.get(m.competition_id);
    if (threshold && m.created_at <= threshold) continue;
    const ids = unreadMessageIds.get(m.competition_id) ?? [];
    ids.push(m.id);
    unreadMessageIds.set(m.competition_id, ids);
  }

  return [...unreadMessageIds.entries()]
    .map(([competitionId, messageIds]) => ({
      competitionId,
      name: nameByCompetition.get(competitionId) ?? "",
      unreadCount: messageIds.length,
      messageIds,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
}
