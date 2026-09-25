"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GifPicker } from "@/components/gif-picker";
import { sendHecovackaMessage, deleteHecovackaMessage } from "./actions";

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
// 20260925130000_hecovacka_chat.sql) -- ODESLÁNÍ i PŘÍCHOZÍ zprávy
// jdou stejnou cestou (appka po odeslání nic sama nepřidává do
// seznamu, spolehne se na vlastní realtime podpisku -- díky tomu appka
// nemusí řešit dvojí zobrazení/deduplikaci vlastní zprávy).
export function ChatPanel({
  competitionId,
  initialMessages,
  currentUserId,
  displayNameByUserId,
}: {
  competitionId: string;
  initialMessages: ChatMessage[];
  currentUserId: string;
  displayNameByUserId: Record<string, string>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "hecovacka_messages",
          filter: `competition_id=eq.${competitionId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string }).id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [competitionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(gifUrl: string | null) {
    if (sending) return;
    if (!body.trim() && !gifUrl) return;

    setSending(true);
    setError(null);
    const result = await sendHecovackaMessage(competitionId, body, gifUrl);
    setSending(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setBody("");
  }

  async function handleDelete(messageId: string) {
    // Appka zprávu z pohledu odesílatele schová hned (appka se
    // nespoléhá na to, že jeho vlastní realtime DELETE dorazí okamžitě)
    // -- u ostatních hráčů ji odstraní příchozí DELETE událost.
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await deleteHecovackaMessage(messageId);
    } catch {
      // Smazání selhalo -- appka zprávu vrátí zpátky, ať nezmizí tiše.
      setError("Smazání zprávy se nepodařilo, zkus to prosím znovu.");
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
                    className="opacity-0 transition-opacity group-hover:opacity-100"
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
          className="min-w-0 flex-1 rounded-full border border-border-subtle bg-transparent px-4 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/40"
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
