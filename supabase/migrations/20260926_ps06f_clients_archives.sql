-- PS-06f — Archivage des comptes clients (année en cours vs archives).
-- archived_at NULL = compte actif ; renseigné = archivé (historique conservé).

alter table public.accounts
  add column if not exists archived_at timestamptz;

comment on column public.accounts.archived_at is
  'PS-06f : compte archivé (hors année en cours). NULL = actif. Historique wallet/commandes conservé.';

-- Index partiel : les listes « actifs » filtrent archived_at is null.
create index if not exists accounts_active_idx
  on public.accounts (id) where archived_at is null;

-- One-shot idempotent : archive les comptes archivables (pas admin, pas test, aucun profil
-- enfant actif non archivé). Ne touche RIEN d'autre (wallets, transactions, commandes, profils).
update public.accounts a
   set archived_at = now()
 where a.archived_at is null
   and coalesce(a.is_admin, false) = false
   and coalesce(a.is_test, false) = false
   and not exists (
     select 1 from public.profils p
      where p.account_id = a.id
        and p.type_profil = 'eleve'
        and p.active = true
        and p.archived_at is null
   );
