-- PS-08b — Vitrine boutique côté parents : produit maison en hero.
--   catalog_items.is_hero (un seul à true, index unique partiel) + hero_text libre.
--   image_url existe déjà (même convention que les plats).

alter table public.catalog_items add column if not exists is_hero boolean not null default false;
alter table public.catalog_items add column if not exists hero_text text;

-- Un seul produit « à l'honneur » à la fois.
create unique index if not exists uniq_catalog_hero on public.catalog_items (is_hero) where is_hero = true;
