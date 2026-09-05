# Klopi

Tipovací hra na sportovní zápasy (hokej, fotbal) pro malou skupinu uživatelů.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- [Supabase](https://supabase.com) (Postgres, Auth, Edge Functions)
- Hosting: [Vercel](https://vercel.com)
- Import zápasů a výsledků: GitHub Actions + Playwright; pravidelné spuštění
  výsledků jistí cron-job.org

## Vývoj

```bash
pnpm install
pnpm dev
```

Nejdřív zkopíruj `.env.local.example` do `.env.local` a doplň Supabase
project URL a anon/publishable klíč (Project Settings → API v Supabase
dashboardu).

## Kontroly před změnou

```bash
pnpm check
pnpm build
```

`pnpm check` ověří TypeScript a spustí rychlé automatické testy. Stejná
kontrola běží v GitHub Actions u každého pull requestu a po změně větve
`main`. Sama o sobě nasazení neblokuje; povinnou bránou se stane až po
vědomém zapnutí ochrany větve na GitHubu.

## Databázové migrace

SQL migrace jsou v `supabase/migrations/`. Aplikuj je buď přes Supabase
SQL editor (zkopíruj obsah souborů v pořadí podle názvu), nebo přes
Supabase CLI po `supabase link`:

```bash
supabase db push
```

## Struktura

- `src/app/login` – funkční přihlášení přes Google OAuth
- `src/app/dashboard` – osobní přehled hráče
- `src/app/spaces` – soutěže, zápasy, tipy a žebříčky
- `src/lib/supabase` – Supabase klienti (browser, server, proxy/middleware)
- `supabase/migrations` – databázové schéma a RLS politiky
- `scripts/sync` – importy, upozornění a jejich automatické testy
