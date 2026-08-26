import { AppHeader } from "@/components/app-header";

// Sdílený layout pro celou přihlášenou část appky (/spaces, /profil a
// jejich podstránky) — jen zabalí obsah do sdílené hlavičky. Route
// group "(app)" nemění URL, jen řadí stránky pod společný layout.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
