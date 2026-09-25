import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type UnreadHecovacka = {
  competitionId: string;
  name: string;
  unreadCount: number;
};

export type HecovackaChatMembership = {
  competitionId: string;
  name: string;
};

async function getPrivateChatParticipations(supabase: SupabaseClient<Database>, userId: string) {
  const { data } = await supabase
    .from("competition_participants")
    .select("competition_id, chat_last_read_at, competitions!inner(name, visibility)")
    .eq("user_id", userId)
    .eq("competitions.visibility", "private");
  return data ?? [];
}

// Seznam VŠECH hecovaček, kde hráč hraje (bez ohledu na nepřečtené) --
// appka to potřebuje v ChatNotificationIndicator (nalezeno Codex review
// na PR #231, viz komentář tam), aby uměl přes vlastní realtime
// podpisku poznat i úplně první novou zprávu v hecovačce, která do
// tohohle okamžiku neměla žádnou nepřečtenou.
export async function getHecovackaChatMemberships(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<HecovackaChatMembership[]> {
  const participations = await getPrivateChatParticipations(supabase, userId);
  return participations.map((p) => ({
    competitionId: p.competition_id,
    name: p.competitions?.name ?? "",
  }));
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
export async function getUnreadHecovackaChat(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<UnreadHecovacka[]> {
  const participations = await getPrivateChatParticipations(supabase, userId);

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
    .select("competition_id, user_id, created_at")
    .in("competition_id", competitionIds)
    .neq("user_id", userId);
  if (!hasUnboundedThreshold && oldestThreshold) {
    query = query.gt("created_at", oldestThreshold);
  }
  const { data: messages } = await query;

  const unreadCounts = new Map<string, number>();
  for (const m of messages ?? []) {
    const threshold = lastReadByCompetition.get(m.competition_id);
    if (threshold && m.created_at <= threshold) continue;
    unreadCounts.set(m.competition_id, (unreadCounts.get(m.competition_id) ?? 0) + 1);
  }

  return [...unreadCounts.entries()]
    .map(([competitionId, unreadCount]) => ({
      competitionId,
      name: nameByCompetition.get(competitionId) ?? "",
      unreadCount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
}
