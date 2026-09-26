"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GifPicker } from "@/components/gif-picker";
import { sendHecovackaMessage, deleteHecovackaMessage, markHecovackaChatRead } from "./actions";

export type ChatMessage = {
  id: string;
  user_id: string;
  body: string | null;
  gif_url: string | null;
  created_at: string;
};

// Chat hecovačky (na žádost uživatele 25.9.2026) -- jedna společná
// místnost pro celou hecovačku, text i GIFky. Appka zprávy doručuje
// všem participantům přes Supabase Realtime (RLS omezuje jen na
// hecovačky, kde je hráč participant, viz
// 20260925130000_hecovacka_chat.sql).
//
// PŘÍCHOZÍ zprávy (od jiných hráčů) jdou vždy přes realtime podpisku.
// VLASTNÍ odeslanou zprávu appka přidá rovnou z odpovědi server akce
// (nalezeno Codex review na PR #231: při čerstvém/obnovujícím se
// websocket spojení mohla appka zprávu úspěšně zapsat do DB dřív, než
// se podpiska stihla přihlásit -- odesílatel by pak svou vlastní
// zprávu vůbec neviděl, dokud stránku neobnoví). Obě cesty proto
// zprávy do seznamu přidávají s kontrolou na duplicitní `id`.
export function ChatPanel({
  competitionId,
  initialMessages,
  currentUserId,
  displayNameByUserId,
  isActive,
  onIncomingMessage,
}: {
  competitionId: string;
  initialMessages: ChatMessage[];
  currentUserId: string;
  displayNameByUserId: Record<string, string>;
  /** Appka je vykreslená pořád (viz SpaceTabs), i mimo aktuálně
   * zvolenou záložku -- `isActive` říká, jestli je hráč zrovna na
   * záložce Chat, ať appka umí označit chat jako přečtený i při
   * příchodu nové zprávy zatímco je otevřený (ne jen při přepnutí na
   * něj, nalezeno Codex review na PR #231). */
  isActive: boolean;
  /** Appka je vykreslená pořád, i pod záložkou "Zápasy" -- SpaceTabs
   * potřebuje vědět o příchozí zprávě od JINÉHO hráče, aby uměl
   * odznak na záložce Chat držet živý, ne jen podle serverového snapshotu
   * (nalezeno Codex review na PR #231). */
  onIncomingMessage?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Appka volá `onIncomingMessage`/`markHecovackaChatRead` z uvnitř
  // realtime callbacků, které appka jednou přihlásí na `[competitionId]`
  // -- nechce kvůli tomu podpisku pořád rušit/zakládat znovu, proto appka
  // aktuální hodnoty drží v ref, ne přímo v dependency poli efektu.
  const onIncomingMessageRef = useRef(onIncomingMessage);
  onIncomingMessageRef.current = onIncomingMessage;
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;
  // Appka při každém (znovu)přihlášení k podpisce dotáhne aktuální stav
  // z DB (viz níže), ale mezitím pořád běží i živé INSERT/DELETE
  // eventy -- appka je proto na dobu dotazu odkládá do fronty a
  // aplikuje je AŽ NA vrácená data, ne naopak, jinak by čerstvě
  // doručená/smazaná zpráva mohla dorazit dřív, než odpověď dotazu, a
  // appka by ji tím přepsáním zase ztratila (nalezeno Codex review na
  // PR #231, 3. kolo).
  const reconcileInFlightRef = useRef(false);
  const pendingEventsDuringReconcileRef = useRef<
    Array<{ type: "insert"; message: ChatMessage } | { type: "delete"; id: string }>
  >([]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`hecovacka-chat-${competitionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "hecovacka_messages",
          filter: `competition_id=eq.${competitionId}`,
        },
        (payload) => {
          const incoming = payload.new as ChatMessage;
          if (reconcileInFlightRef.current) {
            pendingEventsDuringReconcileRef.current.push({ type: "insert", message: incoming });
          }
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
          if (incoming.user_id !== currentUserIdRef.current) {
            onIncomingMessageRef.current?.();
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "hecovacka_messages",
          // BEZ filtru na competition_id (nalezeno Codex review na PR
          // #231, 3. kolo, ověřeno webovým hledáním 25.9.2026): Supabase
          // Realtime u DELETE s RLS pošle ve "starém" záznamu jen
          // primární klíč, ať přes RLS neuteče žádný jiný sloupec --
          // competition_id v `payload.old` tedy nikdy nebude, i s
          // REPLICA IDENTITY FULL. Appka proto dostane DELETE eventy ze
          // VŠECH hecovaček, ale zprávu smaže jen tehdy, když ji má
          // reálně načtenou (message_id z JINÉ hecovačky appka prostě
          // nenajde a nic se nestane).
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          if (!deletedId) return;
          if (reconcileInFlightRef.current) {
            pendingEventsDuringReconcileRef.current.push({ type: "delete", id: deletedId });
          }
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        },
      )
      .subscribe((status) => {
        // Zpráva vložená mezi počátečním dotazem na serveru
        // (initialMessages) a okamžikem, kdy se tahle podpiska skutečně
        // přihlásí (nebo znovu po výpadku spojení), appce jinak zmizí
        // navěky -- Postgres Changes takové "zmeškané" události
        // nedohání (nalezeno Codex review na PR #231). Appka proto při
        // KAŽDÉM úspěšném přihlášení znovu načte aktuální stav z DB a
        // seznam jím nahradí (RLS platí i tady) -- se sloučením
        // souběžných eventů podle komentáře u `pendingEventsDuringReconcileRef` výše.
        if (status !== "SUBSCRIBED") return;
        reconcileInFlightRef.current = true;
        pendingEventsDuringReconcileRef.current = [];
        supabase
          .from("hecovacka_messages")
          .select("id, user_id, body, gif_url, created_at")
          .eq("competition_id", competitionId)
          // Stejný strop jako počáteční serverový dotaz (page.tsx, "Zobrazit
          // posledních 50") -- appka bez tohohle při každém (znovu)připojení
          // stahovala a vykreslovala ÚPLNĚ celou historii chatu, ne jen
          // poslední okno (nalezeno Codex review na PR #231, 4. kolo).
          .order("created_at", { ascending: false })
          .limit(50)
          .then(({ data }) => {
            reconcileInFlightRef.current = false;
            if (!data) return;
            const byId = new Map([...data].reverse().map((m) => [m.id, m]));
            for (const event of pendingEventsDuringReconcileRef.current) {
              if (event.type === "insert") byId.set(event.message.id, event.message);
              else byId.delete(event.id);
            }
            pendingEventsDuringReconcileRef.current = [];
            const merged = [...byId.values()].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
            );
            setMessages((prev) => {
              // Zpráva od JINÉHO hráče, kterou appka objevila až tímhle
              // dotažením (dorazila v mezeře před přihlášením podpisky), by
              // jinak neprošla přes onIncomingMessage -- odznak na záložce
              // Chat (viz SpaceTabs) by tak zůstal starý (nalezeno Codex
              // review na PR #231, 4. kolo).
              const previouslyKnownIds = new Set(prev.map((m) => m.id));
              for (const m of merged) {
                if (!previouslyKnownIds.has(m.id) && m.user_id !== currentUserIdRef.current) {
                  onIncomingMessageRef.current?.();
                }
              }
              return merged;
            });
          });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [competitionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Označí chat jako přečtený, jakmile appka aktivuje tuhle záložku --
  // a znovu při KAŽDÉ nové zprávě, dokud je aktivní pořád otevřená
  // (nalezeno Codex review na PR #231: appka dřív volala jen při
  // přepnutí záložky, takže zpráva doručená přes realtime zatímco byl
  // chat už otevřený zůstala navěky "nepřečtená").
  useEffect(() => {
    if (isActive) {
      // Appka odznak nových zpráv v horní liště appky (viz
      // ChatNotificationIndicator) drží ve vlastním klientském stavu,
      // ne v přímém propojení s tímhle komponentem -- appka mu proto
      // pošle zprávu "přečteno" přes window událost, ale AŽ PO úspěšném
      // zápisu do DB, ne rovnou (nalezeno Codex review na PR #231, 3.
      // kolo: appka dřív odznak smazala, i kdyby zápis chat_last_read_at
      // selhal -- appka by pak tvářila zprávu za přečtenou, i kdyby
      // reálně přečtená nebyla).
      markHecovackaChatRead(competitionId).then(({ ok }) => {
        if (ok) {
          window.dispatchEvent(
            new CustomEvent("hecovacka-chat-read", { detail: { competitionId } }),
          );
        }
      });
    }
    // Účelně na `messages` (celé pole), ne `messages.length` -- appka
    // reconciliaci po (znovu)připojení ohraničuje na posledních 50 (viz
    // výše), takže při plném okně smazání nejstarší a přidání nové
    // zprávy délka zůstane stejná a appka by tak "viditelně" doručenou
    // zprávu nikdy neoznačila za přečtenou (nalezeno Codex review na
    // PR #231, 5. kolo). `setMessages` vždy vytvoří nové pole, takže
    // efekt spolehlivě pozná KAŽDOU změnu obsahu, ne jen změnu počtu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, messages, competitionId]);

  async function handleSend(gifUrl: string | null) {
    if (sending) return;
    if (!body.trim() && !gifUrl) return;

    setSending(true);
    setError(null);
    // try/finally -- server akce samotná (ne jen její návratová hodnota)
    // může selhat na výpadku sítě, appka by pak `setSending(false)`
    // nikdy nespustila a tlačítko Odeslat by zůstalo navěky zamčené
    // (nalezeno Codex review na PR #231, 6. kolo).
    try {
      const result = await sendHecovackaMessage(competitionId, body, gifUrl);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.message) {
        const sent = result.message;
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      }
      setBody("");
    } catch {
      setError("Odeslání zprávy se nepodařilo, zkus to prosím znovu.");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(messageId: string) {
    // Appka zprávu z pohledu odesílatele schová hned (appka se
    // nespoléhá na to, že jeho vlastní realtime DELETE dorazí okamžitě)
    // -- u ostatních hráčů ji odstraní příchozí DELETE událost.
    const removed = messages.find((m) => m.id === messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await deleteHecovackaMessage(messageId);
    } catch {
      // Smazání selhalo -- appka zprávu vrátí zpátky, ať nezmizí tiše
      // (nalezeno Codex review na PR #231: appka dřív jen ukázala
      // chybu, ale smazanou zprávu už nikdy nevrátila).
      setError("Smazání zprávy se nepodařilo, zkus to prosím znovu.");
      if (removed) {
        setMessages((prev) =>
          prev.some((m) => m.id === removed.id)
            ? prev
            : [...prev, removed].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              ),
        );
      }
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-hover p-4">
      <div className="flex max-h-[420px] min-h-[200px] flex-col gap-3 overflow-y-auto">
        {messages.length === 0 && (
          <p className="m-auto text-sm text-muted-foreground">
            Zatím tu nikdo nic nenapsal -- buď první!
          </p>
        )}
        {messages.map((m) => {
          const isOwn = m.user_id === currentUserId;
          return (
            <div key={m.id} className={`group flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-muted-foreground">
                  {isOwn ? "Ty" : displayNameByUserId[m.user_id] ?? "Neznámý hráč"}
                </span>
                <span className="text-[10px] font-medium text-faint-foreground">
                  {new Date(m.created_at).toLocaleTimeString("cs-CZ", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Prague",
                  })}
                </span>
                {isOwn && (
                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    aria-label="Smazat zprávu"
                    // Napůl viditelné vždy (dřív `opacity-0` + jen
                    // `group-hover`, takže tlačítko na dotykových
                    // zařízeních a přes klávesnici nešlo vůbec objevit
                    // -- appka na mobilu myš/hover nemá, nalezeno Codex
                    // review na PR #231, 5. kolo), plně viditelné při
                    // hoveru/focusu.
                    className="opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3 text-faint-foreground hover:text-danger" strokeWidth={2.6} />
                  </button>
                )}
              </div>
              {m.body && (
                <p
                  className={`mt-0.5 max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${
                    isOwn ? "bg-accent/15" : "bg-surface"
                  }`}
                >
                  {m.body}
                </p>
              )}
              {m.gif_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.gif_url}
                  alt=""
                  className="mt-1 max-h-40 rounded-2xl border border-border-subtle"
                />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-xs font-semibold text-danger">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(null);
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Napiš zprávu…"
          maxLength={500}
          // `text-base` (16px) na dotykových zařízeních -- pod 16px
          // prohlížeč (hlavně iPhone) při klepnutí do pole automaticky
          // přiblíží celou stránku a sám se pak neoddálí (nahlášeno
          // 26.9.2026). Menší `text-sm` appka nechává jen zařízením s
          // `pointer-fine` (myš/touchpad) -- NE podle šířky okna
          // (`sm:`), protože mobil na šířku (landscape) bývá širší než
          // 640px a `sm:` by tak menší písmo (a auto-zoom) omylem
          // vrátilo i na dotykovém displeji (nalezeno Codex review na
          // PR #233).
          className="min-w-0 flex-1 rounded-full border border-border-subtle bg-transparent px-4 py-2 text-base focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40 pointer-fine:text-sm"
        />
        <GifPicker onSelect={(gifUrl) => handleSend(gifUrl)} />
        <button
          type="submit"
          disabled={sending || !body.trim()}
          className="btn-press rounded-full bg-accent px-4 py-2 text-xs font-bold text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          Odeslat
        </button>
      </form>
    </div>
  );
}
