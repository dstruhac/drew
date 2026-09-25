"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getUnreadHecovackaChat, type HecovackaChatMembership, type UnreadHecovacka } from "@/lib/hecovacka-chat";

// Ikonka vedle fotečky v horní liště appky (na žádost uživatele
// 25.9.2026), viditelná odkudkoliv v appce (AppHeader je sdílený
// layout) -- svítí, jen když má hráč nepřečtenou zprávu v chatu
// nějaké hecovačky.
//
// Nepřečtená zpráva jen v JEDNÉ hecovačce -> klik vede rovnou tam
// (do chatu, ne na Dashboard). Ve VÍC hecovačkách najednou appka
// nemá jak vybrat "tu jednu pravou", takže místo toho rozbalí malé
// menu (stejný vzor jako MobileMenu) se seznamem -- klik na konkrétní
// položku vede rovnou do jejího chatu.
//
// `items` appka dostane hotové ze serveru (AppHeader), ale sama je
// odteď dál drží ve stavu a doplňuje živě přes vlastní realtime
// podpisku napříč VŠEMI hecovačkami, kde hráč hraje (`memberships`) --
// jinak by ikonka novou zprávu ukázala, až teprve při dalším přechodu
// mezi stránkami appky, kdy se AppHeader (server komponenta) znovu
// vykreslí (nalezeno Codex review na PR #231).
export function ChatNotificationIndicator({
  items,
  memberships,
  currentUserId,
}: {
  items: UnreadHecovacka[];
  memberships: HecovackaChatMembership[];
  currentUserId: string;
}) {
  const [unreadItems, setUnreadItems] = useState<UnreadHecovacka[]>(items);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Appka po dobu reconciliace (viz níže) odkládá souběžně doručené
  // živé eventy do fronty a aplikuje je AŽ NA vrácená data, ne naopak --
  // stejný důvod a stejný vzor jako v ChatPanelu (nalezeno Codex review
  // na PR #231, 4. kolo: appka to tady předtím nedělala, i když
  // "dorovnávací" dotaz níže na to má úplně stejně náchylné okno).
  const reconcileInFlightRef = useRef(false);
  const pendingEventsDuringReconcileRef = useRef<
    Array<
      | { type: "insert"; message: { competition_id: string; user_id: string } }
      | { type: "read"; competitionId: string }
    >
  >([]);

  useEffect(() => {
    setUnreadItems(items);
  }, [items]);

  // ChatPanel (na stránce hecovačky) po označení chatu za přečtený
  // pošle tuhle window událost -- appka podle ní hned smaže odznak i
  // tady, jinak by ikonka dál tvrdila "nepřečteno" ještě chvíli po
  // tom, co ho hráč reálně přečetl (appka nemá jiné sdílené místo mezi
  // těmahle dvěma nezávislými komponentami, nalezeno Codex review na
  // PR #231).
  useEffect(() => {
    function handleRead(e: Event) {
      const { competitionId } = (e as CustomEvent<{ competitionId: string }>).detail;
      if (reconcileInFlightRef.current) {
        pendingEventsDuringReconcileRef.current.push({ type: "read", competitionId });
      }
      setUnreadItems((prev) => prev.filter((p) => p.competitionId !== competitionId));
    }
    window.addEventListener("hecovacka-chat-read", handleRead);
    return () => window.removeEventListener("hecovacka-chat-read", handleRead);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (memberships.length === 0) return;
    const supabase = createClient();
    const competitionIdList = memberships.map((m) => m.competitionId).join(",");
    const channel = supabase
      .channel("hecovacka-chat-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "hecovacka_messages",
          filter: `competition_id=in.(${competitionIdList})`,
        },
        (payload) => {
          const message = payload.new as { competition_id: string; user_id: string };
          if (message.user_id === currentUserId) return;
          if (reconcileInFlightRef.current) {
            pendingEventsDuringReconcileRef.current.push({ type: "insert", message });
          }
          setUnreadItems((prev) => {
            const existing = prev.find((p) => p.competitionId === message.competition_id);
            if (existing) {
              return prev.map((p) =>
                p.competitionId === message.competition_id
                  ? { ...p, unreadCount: p.unreadCount + 1 }
                  : p,
              );
            }
            const name = memberships.find((m) => m.competitionId === message.competition_id)?.name ?? "";
            return [...prev, { competitionId: message.competition_id, name, unreadCount: 1 }].sort(
              (a, b) => a.name.localeCompare(b.name, "cs"),
            );
          });
        },
      )
      .subscribe((status) => {
        // Stejný důvod jako u ChatPanelu (chat-panel.tsx) -- zpráva
        // vložená mezi serverovým vykreslením hlavičky a okamžikem, kdy
        // se tahle podpiska skutečně přihlásí (nebo znovu po výpadku
        // spojení), by appce jinak zmizela navěky (nalezeno Codex
        // review na PR #231, 3. kolo). Appka proto při KAŽDÉM úspěšném
        // přihlášení znovu spočítá nepřečtené přímo přes stejnou funkci
        // jako server (`getUnreadHecovackaChat`, jen s klientským
        // Supabase klientem -- RLS platí i tady) a seznamem nahradí --
        // se sloučením souběžných eventů podle komentáře u
        // `pendingEventsDuringReconcileRef` výše (nalezeno Codex review
        // na PR #231, 4. kolo).
        if (status !== "SUBSCRIBED") return;
        reconcileInFlightRef.current = true;
        pendingEventsDuringReconcileRef.current = [];
        getUnreadHecovackaChat(supabase, currentUserId).then((fresh) => {
          reconcileInFlightRef.current = false;
          let merged = fresh;
          for (const event of pendingEventsDuringReconcileRef.current) {
            if (event.type === "read") {
              merged = merged.filter((p) => p.competitionId !== event.competitionId);
              continue;
            }
            const existing = merged.find((p) => p.competitionId === event.message.competition_id);
            if (existing) {
              merged = merged.map((p) =>
                p.competitionId === event.message.competition_id
                  ? { ...p, unreadCount: p.unreadCount + 1 }
                  : p,
              );
            } else {
              const name =
                memberships.find((m) => m.competitionId === event.message.competition_id)?.name ?? "";
              merged = [...merged, { competitionId: event.message.competition_id, name, unreadCount: 1 }].sort(
                (a, b) => a.name.localeCompare(b.name, "cs"),
              );
            }
          }
          pendingEventsDuringReconcileRef.current = [];
          setUnreadItems(merged);
        });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [memberships, currentUserId]);

  if (unreadItems.length === 0) return null;

  const iconButtonClass =
    "btn-press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-subtle text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground";
  const dot = <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />;

  if (unreadItems.length === 1) {
    return (
      <Link
        href={`/spaces/${unreadItems[0].competitionId}?tab=chat`}
        title={`Nová zpráva v chatu: ${unreadItems[0].name}`}
        aria-label={`Nová zpráva v chatu: ${unreadItems[0].name}`}
        className={iconButtonClass}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
        {dot}
      </Link>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Nové zprávy v chatu"
        aria-expanded={open}
        className={iconButtonClass}
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2.2} />
        {dot}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 flex w-64 flex-col gap-1 rounded-2xl border border-border-subtle bg-surface p-2 shadow-[var(--shadow-card)]">
            <p className="px-2 py-1 text-xs font-bold text-muted-foreground">Nové zprávy</p>
            {unreadItems.map((item) => (
              <Link
                key={item.competitionId}
                href={`/spaces/${item.competitionId}?tab=chat`}
                onClick={() => setOpen(false)}
                className="btn-press flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-surface-hover"
              >
                {item.name}
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                  {item.unreadCount > 9 ? "9+" : item.unreadCount}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
