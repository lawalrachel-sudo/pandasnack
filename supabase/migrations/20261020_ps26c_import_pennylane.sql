-- PS-26c — Import rétroactif des tickets Snack depuis Pennylane (lecture seule côté Pennylane).
-- Distingue la source et empêche tout doublon / tout renvoi Pennylane. Appliquée en prod puis fichier == prod.
alter table public.tickets_achats add column if not exists source text not null default 'appli';
-- Un seul ticket par facture Pennylane (idempotence du script rejouable).
create unique index if not exists tickets_achats_pennylane_invoice_uidx
  on public.tickets_achats (pennylane_invoice_id) where pennylane_invoice_id is not null;
comment on column public.tickets_achats.source is 'PS-26c — ''appli'' (saisi dans l''appli) | ''import_pennylane'' (importé depuis Pennylane, jamais renvoyé).';
