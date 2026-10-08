-- PS-16 — Mode Stage (Toussaint 26→30/10/2026). Carte froide limitée les jours de stage.
-- Décisions Rachel 08/10 : précommande + comptoir ouverts à toutes les familles (les dates font
-- le tri, aucun filtre famille) ; carte stage = sandwichs + clubs, seuls ou en Menu Panda ; rien
-- de chaud ; Bubble Tea seulement au comptoir ou dans le Menu Panda.

-- 1. Nouveau day_type 'stage' (transaction séparée, comme 'devoirs' en PS-10a) :
--    ALTER TYPE public.day_type ADD VALUE IF NOT EXISTS 'stage';

-- 2. Flag carte stage (froide) + seed sandwichs & clubs (rien d'autre).
alter table public.catalog_items add column if not exists sellable_stage boolean not null default false;
update public.catalog_items set sellable_stage = true
  where sku in ('SAND-A','SAND-B','SAND-C','CLUB-THON','CLUB-OEUF');

-- 3. 5 créneaux stage 26→30/10, pandattitude, cutoff veille 20h America/Martinique.
--    Créés active=false ; activés en SQL (« on ouvre le stage ») une fois le code en prod :
--      update public.service_slots set active = true where day_type = 'stage';
insert into public.service_slots (period_id, service_date, day_type, delivery_point_id, orders_cutoff_at, active, target_source_group)
select '89a97ce5-cb0e-4320-8d2a-2f037a7eb148'::uuid,
       d::date, 'stage', '09c6a2cb-7ffc-47a6-ab3f-32b3e43bff0e'::uuid,
       ((d::date - interval '1 day')::date + time '20:00') at time zone 'America/Martinique',
       false, 'pandattitude'
from (values ('2026-10-26'),('2026-10-27'),('2026-10-28'),('2026-10-29'),('2026-10-30')) as v(d)
on conflict do nothing;
