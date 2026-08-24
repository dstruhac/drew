-- Required for gen_random_uuid(). Supabase projects normally have this
-- enabled by default, but we declare it explicitly so the migration is
-- reproducible on any fresh Postgres/Supabase instance.
create extension if not exists pgcrypto;
