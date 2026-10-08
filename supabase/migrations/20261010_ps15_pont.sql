-- PS-15 — Pont PandApp → Panda Snack (réception /pont). Un seul compte Snack par famille.
-- Contrat du jeton : pandattitude-3d/src/lib/pandaSnack.ts (verifierJetonPont), transposé dans
-- src/lib/pont-pandapp.ts. Payload { email, familleId, enfants:[{prenom,nom}], tags, exp, jti }.

-- Lien famille PandApp ↔ compte Snack (null autorisé ; unique quand renseigné).
alter table public.accounts add column if not exists pandapp_famille_id text;
create unique index if not exists accounts_pandapp_famille_id_uidx
  on public.accounts(pandapp_famille_id) where pandapp_famille_id is not null;

-- jti à usage unique (anti-rejeu). Insert-or-reject côté route.
create table if not exists public.pont_jetons_consommes (
  jti text primary key,
  famille_id text,
  created_at timestamptz not null default now()
);

-- Journal du pont (matched | created | conflict | refused).
create table if not exists public.pont_log (
  id uuid primary key default gen_random_uuid(),
  famille_id text,
  account_id uuid,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

-- RLS activé, aucune policy → service_role uniquement (routes serveur).
alter table public.pont_jetons_consommes enable row level security;
alter table public.pont_log enable row level security;
