-- PS-01b — Catalogue rentrée 2026 (idempotent : ne crée/modifie que ce qui manque).
-- À exécuter dans le SQL editor du projet wfhmwijfevmokfuweoke. Rejouable sans effet de bord.

begin;

-- 1. Colonne coming_soon
alter table public.catalog_items
  add column if not exists coming_soon boolean not null default false;

-- 2. Catégorie SOUP (créée seulement si absente ; sort_order = juste après SAND)
insert into public.catalog_categories (id, name, emoji, sort_order)
select 'SOUP', 'Soupe-repas', '🍲',
       coalesce((select sort_order from public.catalog_categories where id = 'SAND'), 0) + 1
where not exists (select 1 from public.catalog_categories where id = 'SOUP');

-- 3. Nouveaux items (insert si SKU absent ; sinon on aligne prix / flags / allergènes)
with new_items (sku, category_id, name, price_alone_cents, sellable_alone, sellable_in_menu, sort_order) as (
  values
    ('CLUB-THON', 'SAND', 'Club Thon-Mayo',       550, true, true,  50),
    ('CLUB-OEUF', 'SAND', 'Club Omelette',        550, true, true,  51),
    ('SOUP-400',  'SOUP', 'Soupe-repas 400 ml',   550, true, true,  10),
    ('SOUP-900',  'SOUP', 'Soupe-repas 900 ml',   950, true, false, 20)
)
insert into public.catalog_items (sku, category_id, name, price_alone_cents, sellable_alone, sellable_in_menu, active, coming_soon, allergens, sort_order)
select n.sku, n.category_id, n.name, n.price_alone_cents, n.sellable_alone, n.sellable_in_menu, true, false, '[]'::jsonb, n.sort_order
from new_items n
where not exists (select 1 from public.catalog_items i where i.sku = n.sku);

update public.catalog_items i
set category_id = n.category_id,
    price_alone_cents = n.price_alone_cents,
    sellable_alone = n.sellable_alone,
    sellable_in_menu = n.sellable_in_menu,
    active = true,
    coming_soon = false,
    allergens = '[]'::jsonb
from (values
    ('CLUB-THON', 'SAND', 550, true, true),
    ('CLUB-OEUF', 'SAND', 550, true, true),
    ('SOUP-400',  'SOUP', 550, true, true),
    ('SOUP-900',  'SOUP', 950, true, false)
) as n(sku, category_id, price_alone_cents, sellable_alone, sellable_in_menu)
where i.sku = n.sku
  and (i.category_id is distinct from n.category_id
    or i.price_alone_cents is distinct from n.price_alone_cents
    or i.sellable_alone is distinct from n.sellable_alone
    or i.sellable_in_menu is distinct from n.sellable_in_menu
    or i.active is distinct from true
    or i.coming_soon is distinct from false);

-- 4. coming_soon = true : Bento, Salades, Pasta, Burgers, Pop-corn, Cake
update public.catalog_items
set coming_soon = true
where coming_soon = false
  and (sku like 'BENTO%' or sku like 'SAL-%' or sku like 'PASTA-%' or sku like 'BURGER-%'
       or name ilike '%pop%corn%' or name ilike '%cake%');

-- 5. SOUP dans le slot « Plat principal » du MENU_PANDA (table menu_formula_slots, si présente)
do $$
begin
  if to_regclass('public.menu_formula_slots') is not null then
    execute $q$
      update public.menu_formula_slots s
      set allowed_category_ids = array_append(s.allowed_category_ids, 'SOUP')
      from public.menu_formulas f
      where s.menu_formula_id = f.id and f.code = 'MENU_PANDA'
        and s.name ilike 'plat principal%'
        and not ('SOUP' = any(coalesce(s.allowed_category_ids, '{}')))
    $q$;
  end if;
end $$;

commit;

-- Vérification :
-- select sku, name, category_id, price_alone_cents, sellable_alone, sellable_in_menu, active, coming_soon
-- from public.catalog_items where sku in ('CLUB-THON','CLUB-OEUF','SOUP-400','SOUP-900') or coming_soon order by category_id, sort_order;
