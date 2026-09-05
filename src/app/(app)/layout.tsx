import { AppHeader } from "@/components/app-header";

// Sdílený layout pro celou přihlášenou část appky (/spaces, /profil a
// jejich podstránky) — jen zabalí obsah do sdílené hlavičky. Route
// group "(app)" nemění URL, jen řadí stránky pod společný layout.
//
// Gratulace/upozornění k medaili týdne (BadgeCenter) žije jen na
// /dashboard, ne tady globálně -- appka má dashboard jako vstupní
// stránku po přihlášení, takže hráč se tam dostane jako první, a
// proklik z modalu na Sbírku artefaktů díky tomu funguje na jedné
// stránce beze změny URL (viz dashboard/page.tsx).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
