import { AppHeader } from "@/components/app-header";
import { BadgeCelebrationWatcher } from "@/components/badge-celebration-watcher";

// Sdílený layout pro celou přihlášenou část appky (/spaces, /profil a
// jejich podstránky) — jen zabalí obsah do sdílené hlavičky. Route
// group "(app)" nemění URL, jen řadí stránky pod společný layout.
//
// BadgeCelebrationWatcher je tu záměrně vedle hlavičky, ne až uvnitř
// jednotlivých stránek -- gratulace k medaili týdne se má objevit bez
// ohledu na to, na jaké stránce appky hráč zrovna skončí (redesign
// 29.8.2026, "banger" moment č. 2).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <BadgeCelebrationWatcher />
      {children}
    </>
  );
}
