import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

// Veřejná stránka (viz PUBLIC_PATHS v middleware.ts) -- funguje pro
// nepřihlášeného i přihlášeného návštěvníka stejným odkazem, ať jde
// zvát i lidi, co v appce ještě nemají účet (14.9.2026, na žádost
// uživatele). get_hecovacka_invite_preview/accept_hecovacka_invite
// jsou SECURITY DEFINER Postgres funkce (viz
// 20260914090400_hecovacky_functions.sql) -- autorizace je tu
// posedění platného tokenu z odkazu, ne existující členství.
export default async function PozvankaPage({
  params,
}: PageProps<"/pozvanka/[token]">) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: preview } = await supabase
    .rpc("get_hecovacka_invite_preview", { p_token: token })
    .maybeSingle();

  if (!preview) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        <Image src="/brand/klopi-icon.svg" alt="Klopi" width={40} height={40} className="h-10 w-10" />
        <h1 className="text-xl font-extrabold tracking-tight">Pozvánka už neplatí</h1>
        <p className="text-sm text-muted-foreground">
          Tenhle odkaz appka nezná -- zkus si o nový říct tomu, kdo tě zval.
        </p>
        <Link href="/" className="text-xs font-bold text-accent hover:underline">
          Zpět na Klopi
        </Link>
      </main>
    );
  }

  const user = await getCurrentUser();

  if (user) {
    const { error } = await supabase.rpc("accept_hecovacka_invite", { p_token: token });
    if (!error) {
      redirect(`/spaces/${preview.competition_id}`);
    }
    // RPC selhal z jiného důvodu než neplatný token (ten appka už
    // ověřila výše přes preview) -- např. přechodný výpadek Supabase.
    // Appka to ukáže rovnou tady, ať návštěvník neskončí na tiché
    // chybové obrazovce.
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        <h1 className="text-xl font-extrabold tracking-tight">Přidání se nepovedlo</h1>
        <p className="text-sm text-muted-foreground">
          Zkus odkaz otevřít znovu za chvíli -- appka teď měla dočasný problém.
        </p>
      </main>
    );
  }

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-10%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_60%)]"
      />

      <div className="w-full max-w-sm rounded-[28px] border border-border-subtle bg-surface/80 p-8 text-center shadow-[var(--shadow-card)] backdrop-blur-sm">
        <Image src="/brand/klopi-icon.svg" alt="Klopi" width={48} height={48} className="mx-auto mb-2 h-12 w-12" priority />
        <p className="mt-2 text-sm font-semibold text-muted-foreground">Byl(a) jsi pozván(a) do hecovačky</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{preview.name}</h1>
        {preview.description && (
          <p className="mt-2 text-sm text-muted-foreground">{preview.description}</p>
        )}

        <div className="mt-8 border-t border-border-subtle" />

        <Link
          href={`/login?next=${encodeURIComponent(`/pozvanka/${token}`)}`}
          className="btn-press mt-8 flex w-full items-center justify-center gap-3 rounded-full bg-accent px-4 py-3 text-sm font-bold text-accent-foreground hover:opacity-90"
        >
          Přihlásit se a přidat se
        </Link>
      </div>
    </main>
  );
}
