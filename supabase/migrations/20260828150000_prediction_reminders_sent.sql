-- prediction_reminders_sent: čistě interní evidence pro úlohu
-- predict-reminders (upozornění e-mailem na nevyplněný tip), aby
-- v jednom dni poslala každému hráči nejvýš jeden souhrnný e-mail --
-- odsouhlaseno s uživatelem 28.8.2026: e-mail, spuštěný 2 hodiny před
-- prvním zápasem dne, na který hráč ještě nemá tip (napříč všemi
-- soutěžemi, které hraje), a i při víc chybějících tipech jen JEDEN
-- souhrnný e-mail za den.
--
-- Bez žádné vazby na UI appky -- nikdo tuhle tabulku nezobrazuje, jen
-- ji čte/zapisuje service role klíčem z GitHub Actions.
create table public.prediction_reminders_sent (
  user_id uuid not null references public.profiles (id) on delete cascade,
  reminder_date date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, reminder_date)
);

alter table public.prediction_reminders_sent enable row level security;

-- Záměrně žádná policy pro `authenticated` -- appka tuhle tabulku nikde
-- nečte ani nezapisuje, RLS bez policy tedy znamená "nikdo přes
-- anon/authenticated klíč nesmí nic", jen service_role (viz GRANT
-- níže) k datům přistupuje.
grant select, insert on public.prediction_reminders_sent to service_role;
