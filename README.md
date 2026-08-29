# Klopi

Tipovací hra na sportovní zápasy (hokej, fotbal) pro malou skupinu uživatelů.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- [Supabase](https://supabase.com) (Postgres, Auth, Edge Functions)
- Hosting: [Vercel](https://vercel.com)
- Plánovač pro pravidelné stahování výsledků: Supabase `pg_cron` + Edge
  Functions (ne Vercel Cron kvůli limitu na free tieru)

## Vývoj

```bash
pnpm install
pnpm dev
```

Nejdřív zkopíruj `.env.local.example` do `.env.local` a doplň Supabase
project URL a anon/publishable klíč (Project Settings → API v Supabase
dashboardu).

## Databázové migrace

SQL migrace jsou v `supabase/migrations/`. Aplikuj je buď přes Supabase
SQL editor (zkopíruj obsah souborů v pořadí podle názvu), nebo přes
Supabase CLI po `supabase link`:

```bash
supabase db push
```

## Struktura

- `src/app/login` – přihlašovací stránka (Google OAuth zatím jen UI)
- `src/app/spaces` – placeholder pro seznam soutěží
- `src/lib/supabase` – Supabase klienti (browser, server, proxy/middleware)
- `supabase/migrations` – databázové schéma a RLS politiky
