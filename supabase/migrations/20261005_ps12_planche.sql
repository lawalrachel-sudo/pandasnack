-- PS-12 — Mémoire de planche d'étiquettes (planche physique entamée). Une seule ligne :
-- l'état de la planche actuellement dans l'imprimante de Rachel (cases déjà utilisées).
create table if not exists public.etiquette_planche (
  id int primary key default 1 check (id = 1),
  used_cells int[] not null default '{}',
  updated_at timestamptz not null default now()
);
insert into public.etiquette_planche (id) values (1) on conflict (id) do nothing;

alter table public.etiquette_planche enable row level security;
