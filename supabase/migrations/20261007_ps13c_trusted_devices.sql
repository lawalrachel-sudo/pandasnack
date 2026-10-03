-- PS-13c — « Appareil de confiance » admin (remplace les passkeys, refusées par Rachel 01/10).
-- Appliquée en prod via le connecteur le 01/10 ; fichier ajouté pour garder migrations == prod.
drop table if exists public.admin_passkeys;

create table if not exists public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,          -- SHA-256 (hex) du jeton ; le jeton clair n'est jamais stocké
  device_label text,                        -- déduit du user-agent (« Samsung · Chrome »…)
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.trusted_devices enable row level security;
-- Aucune policy : table inaccessible hors service_role (qui bypass RLS).

comment on table public.trusted_devices is 'PS-13c — appareils de confiance admin (jeton haché, cookie 1 an). service_role uniquement.';
