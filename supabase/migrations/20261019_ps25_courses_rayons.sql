-- PS-25 — Liste de courses par rayon + catalogue favoris. Appliquée en prod puis fichier == prod.
-- Ne supprime aucune ligne existante : les 50 lignes du 16/10 sont parsées et catégorisées.

-- 1. Colonnes rayon / fournisseur / ordre.
alter table public.courses_items add column if not exists categorie text not null default 'autre';
alter table public.courses_items add column if not exists fournisseur text;
alter table public.courses_items add column if not exists ordre int;

-- 2. Catalogue favoris réutilisables.
create table if not exists public.courses_catalogue (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  categorie text not null default 'autre',
  fournisseur text,
  unite text,
  quantite_defaut numeric not null default 1,
  dernier_prix numeric,
  bubble_option_id uuid references public.bubble_options(id),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists courses_catalogue_libelle_uidx on public.courses_catalogue (lower(libelle));
alter table public.courses_catalogue enable row level security;  -- service_role seul

comment on table public.courses_catalogue is 'PS-25 — favoris réutilisables de la liste de courses. service_role seul.';

-- 3. Catégorisation par mots-clés (ordre = priorité ; à défaut 'autre'). Modifiable dans ce fichier.
create or replace function public.courses_categorie(p text)
returns text language sql immutable as $fn$
  select case
    when p ilike '%sirop%' or p ilike '%perles%' or p ilike '%bubble tea%' or p ilike '%thé%'
      or p ilike '%shaker%' or p ilike '%dôme%' or p ilike '%dome%' then 'bubble_tea'
    when p ilike '%dégraissant%' or p ilike '%désinfectant%' or p ilike '%essuie-tout%'
      or p ilike '%papier toilette%' or p ilike '%crème lavante%' or p ilike '%creme lavante%'
      or p ilike '%poubelle%' or p ilike '%gants%' then 'hygiene'
    when p ilike '%gobelet%' or p ilike '%couvercle%' or p ilike '%cuillère%' or p ilike '%cuillere%'
      or p ilike '%film alimentaire%' or p ilike '%congélation%' or p ilike '%congelation%'
      or p ilike '%pot à soupe%' or p ilike '%pots à soupe%' or p ilike '%serviettes papier%'
      or p ilike '%étiquettes%' or p ilike '%etiquettes%' then 'emballages'
    when p ilike '%baguette%' or p ilike '%pain%' then 'pain'
    when p ilike '%beurre%' or p ilike '%emmental%' or p ilike '%gouda%' or p ilike '%jambon%'
      or p ilike '%lait%' or p ilike '%œufs%' or p ilike '%oeufs%' or p ilike '%fromage%' then 'frais'
    when p ilike '%chips%' or p ilike '%cornetto%' or p ilike '%gaufre%' or p ilike '%pom%potes%'
      or p ilike '%pop-corn%' or p ilike '%popcorn%' or p ilike '%biscuit%' then 'gouter'
    when p ilike '%carotte%' or p ilike '%chou%' or p ilike '%concombre%' or p ilike '%laitue%'
      or p ilike '%tomate%' or p ilike '%pastèque%' or p ilike '%melon%' or p ilike '%ananas%'
      or p ilike '%pêche%' or p ilike '%peche%' or p ilike '%nectarine%' or p ilike '%pomme%'
      or p ilike '%raisin%' or p ilike '%mandarine%' or p ilike '%fruits%' then 'fruits_legumes'
    when p ilike '%jus%' or p ilike '%eau %' or p ilike '%briques%' or p ilike '%chanflor%'
      or p ilike '%ti banga%' or p ilike '%glaçon%' or p ilike '%glacon%' then 'boissons'
    when p ilike '%pâtes%' or p ilike '%pates%' or p ilike '%bolognaise%' or p ilike '%concentré de tomate%'
      or p ilike '%sauce piment%' or p ilike '%moutarde%' or p ilike '%sucre%' or p ilike '%thon%'
      or p ilike '%mayonnaise%' then 'epicerie'
    else 'autre'
  end
$fn$;

-- 4. Catalogue AVANT nettoyage (on a encore « Article — Fournisseur (prix) » pour extraire le prix),
-- puis nettoyage de courses_items. Le prix (euros) ne vit que dans le catalogue.
insert into public.courses_catalogue (libelle, categorie, fournisseur, bubble_option_id, dernier_prix, quantite_defaut)
select distinct on (lower(src.lib)) src.lib, src.cat, src.four, src.bopt, src.prix, src.qte
from (
  select
    case when position(' — ' in ci.libelle) > 0 then btrim(split_part(ci.libelle, ' — ', 1)) else ci.libelle end as lib,
    case when ci.source = 'auto_bubble' then 'bubble_tea'
         else public.courses_categorie(case when position(' — ' in ci.libelle) > 0 then btrim(split_part(ci.libelle, ' — ', 1)) else ci.libelle end) end as cat,
    case when position(' — ' in ci.libelle) > 0 then nullif(btrim(split_part(split_part(ci.libelle, ' — ', 2), ' (', 1)), '') else null end as four,
    ci.bubble_option_id as bopt,
    case when position(' — ' in ci.libelle) > 0
         then replace((regexp_match(split_part(ci.libelle, ' — ', 2), '([0-9]+[.,][0-9]{2})\s*€'))[1], ',', '.')::numeric
         else null end as prix,
    ci.quantite as qte
  from public.courses_items ci
) src
on conflict (lower(libelle)) do update set
  categorie = excluded.categorie,
  fournisseur = coalesce(excluded.fournisseur, public.courses_catalogue.fournisseur),
  dernier_prix = coalesce(excluded.dernier_prix, public.courses_catalogue.dernier_prix),
  bubble_option_id = coalesce(excluded.bubble_option_id, public.courses_catalogue.bubble_option_id),
  updated_at = now();

-- Nettoyage de courses_items (toutes les clauses SET lisent la valeur AVANT update).
update public.courses_items c set
  categorie = case when c.source = 'auto_bubble' then 'bubble_tea'
    else public.courses_categorie(case when position(' — ' in c.libelle) > 0 then btrim(split_part(c.libelle, ' — ', 1)) else c.libelle end) end,
  fournisseur = case when position(' — ' in c.libelle) > 0
    then nullif(btrim(split_part(split_part(c.libelle, ' — ', 2), ' (', 1)), '') else null end,
  libelle = case when position(' — ' in c.libelle) > 0 then btrim(split_part(c.libelle, ' — ', 1)) else c.libelle end;

-- 5. « Terminer les courses » : les lignes cochées (achete) sortent du tableau actif vers l'historique.
-- archived_at distingue « coché ce passage » (visible, grisé, annulable) de « archivé ».
alter table public.courses_items add column if not exists archived_at timestamptz;
