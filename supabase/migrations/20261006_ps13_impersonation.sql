-- PS-13 — Journal d'audit « Vue client » (agir en tant que compte test). Écrit uniquement par
-- la route serveur (service_role). Aucune action possible sur un compte non-test (garde route).
create table if not exists public.impersonation_log (
  id uuid primary key default gen_random_uuid(),
  target_account_id uuid,
  target_email text,
  action text not null check (action in ('enter','exit')),
  created_at timestamptz not null default now()
);
alter table public.impersonation_log enable row level security;
