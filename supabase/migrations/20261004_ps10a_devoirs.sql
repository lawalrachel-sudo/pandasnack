-- PS-10a — Panda Devoirs (1/2) : schéma, données, nom obligatoire. Rien de visible côté
-- parents (slots active=false, pilules en PS-10b). Prérequis : migration enums 20261003.

-- ── 1. Profil : nom (anti-homonymes) ────────────────────────────────────────────
alter table public.profils add column if not exists nom text;

-- ── 2. Métier Devoirs ───────────────────────────────────────────────────────────
alter table public.profils add column if not exists devoirs boolean not null default false;
-- Étendre le CHECK metier pour accepter panda_devoirs (nom de contrainte résolu dynamiquement).
do $$
declare c text;
begin
  select conname into c from pg_constraint
   where conrelid='public.profils'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%metier = ANY%';
  if c is not null then execute 'alter table public.profils drop constraint '||quote_ident(c); end if;
end $$;
alter table public.profils add constraint profils_metier_check
  check (metier = any (array['ecole','pandattitude','panda_guest','panda_devoirs']));

-- trg_force_pandattitude (force_pandattitude_onboarding) : ne coerce que 'divers' → pandattitude,
-- laisse passer panda_devoirs. Vérifié : aucune adaptation nécessaire.

-- ── 3. Livraison + slots Devoirs ─────────────────────────────────────────────────
insert into public.delivery_points (name, delivery_time_local, delivery_fee_cents, active, sort_order)
select 'Salle de classe RDC — Panda Devoirs', '17:00', 0, true, 10
where not exists (select 1 from public.delivery_points where name = 'Salle de classe RDC — Panda Devoirs');

-- Lundis + jeudis du 05/11/2026 au 02/07/2027, hors vacances (Noël, Carnaval, Pâques ×2)
-- et hors fériés (Ascension jeu 06/05/2027, Pentecôte lun 17/05/2027). active=false.
-- cutoff = veille 20h America/Martinique. target_source_group = panda_devoirs (marqueur =
-- day_type='devoirs' ; l'accès des familles pandattitude passe par la lib d'accès, PS-10b).
insert into public.service_slots (service_date, day_type, delivery_point_id, orders_cutoff_at, target_source_group, active, morning_delivery)
select g.d, 'devoirs'::public.day_type,
       (select id from public.delivery_points where name='Salle de classe RDC — Panda Devoirs'),
       ((g.d - 1 + time '20:00') at time zone 'America/Martinique'),
       'panda_devoirs'::public.source_group, false, false
from (select generate_series('2026-11-05'::date,'2027-07-02'::date,interval '1 day')::date as d) g
where extract(dow from g.d) in (1,4)
  and not (g.d between '2026-12-20' and '2027-01-05')
  and not (g.d between '2027-02-07' and '2027-02-23')
  and not (g.d between '2027-03-25' and '2027-04-02')
  and not (g.d between '2027-04-18' and '2027-05-04')
  and g.d::date not in ('2027-05-06','2027-05-17')
  and not exists (select 1 from public.service_slots ss where ss.service_date=g.d::date and ss.day_type='devoirs');

-- ── 4. Catalogue : flag sellable_devoirs ─────────────────────────────────────────
alter table public.catalog_items add column if not exists sellable_devoirs boolean not null default false;
update public.catalog_items set sellable_devoirs = true
where sku in ('MINI-JAMBON-FROMAGE','MINI-THON-MAYO','MINI-OMELETTE-JAMBON','SAND-A','SAND-B','SAND-C','CLUB-THON','CLUB-OEUF');

-- ── Backfill nom depuis eleves_connus (match prénom unique pour le compte) ────────
update public.profils p set nom = e.nom
from (
  select p2.id as profil_id, min(ec.nom) as nom
  from public.profils p2
  join public.accounts a on a.id = p2.account_id
  join public.eleves_connus ec on lower(ec.prenom) = lower(p2.prenom)
    and (lower(ec.email_parent) = lower(a.email) or lower(coalesce(ec.email_parent2,'')) = lower(a.email))
  where p2.nom is null and p2.type_profil = 'eleve'
  group by p2.id
  having count(distinct ec.nom) = 1
) e
where p.id = e.profil_id and p.nom is null;
