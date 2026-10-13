-- PS-22 — Tickets de courses : 1 photo, 2 usages (dépenses Panda Snack + facture fournisseur
-- Pennylane). Tables admin-only (RLS activée, aucune policy authenticated → service_role seul via
-- les routes /api/admin/*). Airtable hors circuit (décision Rachel 13/10). Montants en euros
-- (numeric) car destinés à Pennylane (décimal EUR), contrairement au reste de l'app (cents).
-- Appliquée en prod via apply_migration (fichier == prod).

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ticket_categorie') then
    create type public.ticket_categorie as enum ('pro_snack','pro_ltc','perso');
  end if;
  if not exists (select 1 from pg_type where typname = 'ticket_moyen_paiement') then
    create type public.ticket_moyen_paiement as enum ('carte_ltc','especes','autre');
  end if;
  if not exists (select 1 from pg_type where typname = 'ticket_statut') then
    create type public.ticket_statut as enum ('a_envoyer','envoye','rapproche','a_verifier','exclu');
  end if;
end $$;

create table if not exists public.tickets_achats (
  id uuid primary key default gen_random_uuid(),
  photo_path text,                               -- objet du bucket privé « tickets »
  categorie public.ticket_categorie not null,    -- choix OBLIGATOIRE avant envoi
  fournisseur text,
  date_ticket date,
  montant_ttc numeric(12,2),                      -- TTC en euros
  moyen_paiement public.ticket_moyen_paiement,
  pennylane_file_id text,
  pennylane_invoice_id text,                      -- rempli ⇒ jamais renvoyé (idempotence)
  pennylane_tx_id text,
  statut public.ticket_statut not null default 'a_envoyer',
  erreur text,
  created_at timestamptz not null default now()
);

create table if not exists public.tickets_achats_lignes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets_achats(id) on delete cascade,
  article text,
  quantite numeric(12,3),
  unite text,
  prix_ttc numeric(12,2),
  taux_tva numeric(5,2),
  ingredient_id text,                             -- mapping calculette, validé par Rachel (nullable)
  created_at timestamptz not null default now()
);

create index if not exists tickets_achats_statut_idx on public.tickets_achats(statut);
create index if not exists tickets_achats_categorie_idx on public.tickets_achats(categorie);
create index if not exists tickets_achats_date_idx on public.tickets_achats(date_ticket);
create index if not exists tickets_achats_pl_invoice_idx on public.tickets_achats(pennylane_invoice_id);
create index if not exists tickets_achats_lignes_ticket_idx on public.tickets_achats_lignes(ticket_id);

alter table public.tickets_achats enable row level security;
alter table public.tickets_achats_lignes enable row level security;
-- Aucune policy : lecture/écriture réservées à service_role (routes admin). RLS = admin seulement.

comment on table public.tickets_achats is 'PS-22 — tickets de courses (dépenses Snack + facture fournisseur Pennylane). service_role seul (routes admin).';
comment on table public.tickets_achats_lignes is 'PS-22 — lignes détaillées d''un ticket (article/quantité/prix/TVA, ingredient_id calculette nullable). service_role seul.';

-- Bucket privé pour les photos de tickets.
insert into storage.buckets (id, name, public) values ('tickets','tickets', false)
  on conflict (id) do nothing;
