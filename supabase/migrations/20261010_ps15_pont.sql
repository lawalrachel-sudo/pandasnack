-- PS-15 — Pont PandApp → Panda Snack (réception). Un seul compte Snack par famille.

-- Lien famille PandApp ↔ compte Snack (null autorisé ; unique quand renseigné).
alter table public.accounts add column if not exists pandapp_famille_id text;
create unique index if not exists accounts_pandapp_famille_id_uidx
  on public.accounts(pandapp_famille_id) where pandapp_famille_id is not null;

-- Nonces à usage unique (anti-rejeu du jeton).
create table if not exists public.pont_nonces (
  nonce text primary key,
  famille_id text,
  created_at timestamptz not null default now()
);

-- Journal du pont (traçabilité : matched | created | conflict | refused).
create table if not exists public.pont_log (
  id uuid primary key default gen_random_uuid(),
  famille_id text,
  account_id uuid,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- RLS activé, aucune policy → service_role uniquement (routes serveur).
alter table public.pont_nonces enable row level security;
alter table public.pont_log enable row level security;
