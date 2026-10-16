-- PS-23b — Thé (3e choix Bubble Tea) + Liste de courses (suggestions auto depuis le stock bas).
-- Le thé n'est pas suivi en stock (dose NULL, aucun mouvement) : dispo pilotée par active/inactive.
-- Appliquée en prod puis fichier == prod. (ALTER TYPE ADD VALUE appliqué hors transaction d'abord.)

-- 1. kind gagne 'the'.
alter type public.bubble_kind add value if not exists 'the';

-- 2. dose nullable (thé) + conditionnement d'achat par option (défaut par kind ; Fraise sirop = 1,5 L).
alter table public.bubble_options alter column dose drop not null;
alter table public.bubble_options add column if not exists conditionnement numeric;
update public.bubble_options
  set conditionnement = case kind when 'sirop' then 750 when 'perles' then 3200 else null end
  where conditionnement is null and kind in ('sirop','perles');
update public.bubble_options set conditionnement = 1500 where kind = 'sirop' and lower(name) = 'fraise';

-- seed thé Noir + Vert (actifs, dose/conditionnement NULL, unite vide).
insert into public.bubble_options (kind, name, unite, dose, conditionnement, sort_order) values
  ('the','Noir','', null, null, 1), ('the','Vert','', null, null, 2)
on conflict (kind, lower(name)) do nothing;

-- 3. choix thé porté par la ligne de commande.
alter table public.order_items add column if not exists bubble_the_id uuid references public.bubble_options(id);

-- 4. réassort depuis la liste de courses : ref + idempotence.
alter table public.bubble_stock_mouvements add column if not exists ref_courses_item_id uuid;
create unique index if not exists bubble_mvt_courses_uidx
  on public.bubble_stock_mouvements (source, option_id, ref_courses_item_id)
  where ref_courses_item_id is not null;

-- 5. Liste de courses.
do $$ begin
  if not exists (select 1 from pg_type where typname='courses_source') then
    create type public.courses_source as enum ('auto_bubble','manuel');
  end if;
  if not exists (select 1 from pg_type where typname='courses_statut') then
    create type public.courses_statut as enum ('suggere','a_acheter','achete','ignore');
  end if;
end $$;

create table if not exists public.courses_items (
  id uuid primary key default gen_random_uuid(),
  libelle text not null,
  quantite numeric not null default 1,
  unite text,
  source public.courses_source not null,
  bubble_option_id uuid references public.bubble_options(id),
  statut public.courses_statut not null default 'suggere',
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Une seule ligne OUVERTE (suggere|a_acheter) par option Bubble Tea.
create unique index if not exists courses_open_option_uidx
  on public.courses_items (bubble_option_id)
  where bubble_option_id is not null and statut in ('suggere','a_acheter');

alter table public.courses_items enable row level security;
-- Aucune policy → service_role seul (routes admin + pont).

comment on table public.courses_items is 'PS-23b — liste de courses (suggestions auto sous le seuil + articles manuels). service_role seul.';

-- 6. Suggestions auto : chaque option sirop/perles active sous le seuil, sans ligne ouverte, non
-- bloquée par un 'ignore' récent (tant qu'aucun mouvement de stock après le dernier ignore).
create or replace function public.courses_sync_bubble()
returns int language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare v_n int;
begin
  with cand as (
    insert into public.courses_items (libelle, quantite, unite, source, bubble_option_id, statut)
    select
      case o.kind when 'sirop' then 'Sirop ' else 'Perles ' end || o.name,
      1,
      case o.kind when 'sirop' then 'bouteille ' || coalesce(o.conditionnement,750)::text || ' ml'
                  else 'pot ' || coalesce(o.conditionnement,3200)::text || ' g' end,
      'auto_bubble', o.id, 'suggere'
    from public.bubble_stock_estime v
    join public.bubble_options o on o.id = v.option_id
    where o.active and o.kind in ('sirop','perles') and v.doses_restantes < o.seuil_doses
      and not exists (
        select 1 from public.courses_items c
         where c.bubble_option_id = o.id and c.statut in ('suggere','a_acheter'))
      and not exists (
        select 1 from (
          select max(updated_at) mx from public.courses_items
           where bubble_option_id = o.id and statut = 'ignore') ig
        where ig.mx is not null
          and not exists (select 1 from public.bubble_stock_mouvements m
                           where m.option_id = o.id and m.created_at > ig.mx))
    returning 1)
  select count(*) into v_n from cand;
  return v_n;
end $fn$;

-- 7. « Acheté » : statut achete ; pour une ligne auto_bubble → mouvement reassort (qty = quantité ×
-- conditionnement), une seule fois (idempotence sur ref_courses_item_id). Règle d'entrée unique.
create or replace function public.courses_mark_achete(p_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare v record; v_base numeric;
begin
  select * into v from public.courses_items where id = p_id;
  if not found then return; end if;
  update public.courses_items set statut = 'achete', updated_at = now() where id = p_id;
  if v.source = 'auto_bubble' and v.bubble_option_id is not null then
    select v.quantite * coalesce(o.conditionnement,
             case o.kind when 'sirop' then 750 when 'perles' then 3200 else 0 end)
      into v_base from public.bubble_options o where o.id = v.bubble_option_id;
    if v_base is not null and v_base > 0 then
      insert into public.bubble_stock_mouvements (option_id, qty, source, ref_courses_item_id, note)
      values (v.bubble_option_id, v_base, 'reassort', p_id, 'Liste de courses')
      on conflict (source, option_id, ref_courses_item_id) where ref_courses_item_id is not null do nothing;
    end if;
  end if;
end $fn$;

-- 8. sa_ki_ni_commander : porte aussi le choix thé (bubble_the_id) sur la ligne (miroir PS-23 + thé).
create or replace function public.sa_ki_ni_commander(p_payload jsonb)
returns table(order_id uuid, order_number text, total_cents integer, wallet_balance_after integer)
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  v_user uuid; v_account uuid; v_slot record; v_slot_id uuid; v_idem text; v_supp int := 0;
  v_upper timestamptz; v_items jsonb; v_item jsonb; v_lines jsonb := '[]'::jsonb;
  v_cat uuid; v_is_formula boolean; v_menu_formula_id uuid; v_profil uuid; v_citem record;
  v_offer record; v_price int; v_line int; v_total int := 0; v_wallet record; v_new_balance int;
  v_wt uuid; v_order_id uuid; v_order_number text; v_now timestamptz := now(); v_existing record;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  select id into v_account from public.accounts where auth_user_id = v_user limit 1;
  if v_account is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = '28000'; end if;

  v_slot_id := nullif(p_payload->>'slot_id','')::uuid;
  v_idem    := nullif(p_payload->>'idempotency_key','');
  v_items   := coalesce(p_payload->'items', '[]'::jsonb);

  if v_idem is not null then
    select o.id, o.order_number, o.total_cents into v_existing
    from public.orders o where o.idempotency_key = v_idem and o.account_id = v_account limit 1;
    if found then
      select w.balance_cents into v_new_balance from public.wallets w where w.account_id = v_account;
      return query select v_existing.id, v_existing.order_number, v_existing.total_cents, coalesce(v_new_balance, 0);
      return;
    end if;
  end if;

  if v_slot_id is null then raise exception 'SKN_SLOT' using errcode = '22023'; end if;
  if jsonb_array_length(v_items) = 0 then raise exception 'SKN_VIDE' using errcode = '22023'; end if;

  select * into v_slot from public.service_slots where id = v_slot_id;
  if not found then raise exception 'SKN_SLOT' using errcode = '22023'; end if;

  v_upper := (v_slot.service_date + time '10:30') at time zone 'America/Martinique';
  if v_slot.orders_cutoff_at is null or v_now < v_slot.orders_cutoff_at or v_now > v_upper then
    raise exception 'SKN_FERME' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    v_cat := nullif(v_item->>'catalog_item_id','')::uuid;
    v_is_formula := coalesce((v_item->>'is_formula')::boolean, false);
    v_menu_formula_id := nullif(v_item->>'menu_formula_id','')::uuid;
    v_profil := nullif(v_item->>'profil_id','')::uuid;
    if v_profil is null then raise exception 'SKN_PROFIL_REQUIS' using errcode = '22023'; end if;
    perform 1 from public.profils where id = v_profil and account_id = v_account and type_profil = 'eleve' and active;
    if not found then raise exception 'SKN_PROFIL_REQUIS' using errcode = '22023'; end if;
    if v_cat is null then raise exception 'SKN_PLAT' using errcode = '22023'; end if;
    select * into v_citem from public.catalog_items where id = v_cat;
    if not found then raise exception 'SKN_PLAT' using errcode = '22023'; end if;
    if not v_citem.sa_ki_ni_ok then raise exception 'SKN_NON_OK' using errcode = '22023'; end if;
    select * into v_offer from public.sa_ki_ni_offres where service_slot_id = v_slot_id and catalog_item_id = v_cat for update;
    if not found then raise exception 'SKN_NON_OFFERT' using errcode = '22023'; end if;
    if v_offer.qty_vendue >= v_offer.qty_ouverte then raise exception 'SKN_EPUISE' using errcode = '22023'; end if;
    if v_is_formula then
      if not coalesce(v_citem.sellable_in_menu, false) then raise exception 'SKN_FORMULE' using errcode = '22023'; end if;
      select price_cents into v_price from public.menu_formulas where id = v_menu_formula_id and active and code = 'MENU_PANDA';
      if v_price is null then raise exception 'SKN_FORMULE' using errcode = '22023'; end if;
    else
      v_price := v_citem.price_alone_cents;
      if v_price is null then raise exception 'SKN_PRIX' using errcode = '22023'; end if;
    end if;
    v_line := v_price + v_supp; v_total := v_total + v_line;
    update public.sa_ki_ni_offres set qty_vendue = qty_vendue + 1, updated_at = v_now where id = v_offer.id;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'catalog_item_id', v_cat, 'menu_formula_id', v_menu_formula_id, 'is_formula', v_is_formula,
      'unit_price_cents', v_line, 'topping_ids', v_item->'topping_ids', 'profil_id', v_profil,
      'prenom_libre', nullif(v_item->>'prenom_libre',''), 'notes', nullif(v_item->>'notes',''),
      'formula_choices', v_item->'formula_choices',
      'bubble_sirop_id', nullif(v_item->>'bubble_sirop_id',''),
      'bubble_perles_id', nullif(v_item->>'bubble_perles_id',''),
      'bubble_the_id', nullif(v_item->>'bubble_the_id','')));
  end loop;

  select * into v_wallet from public.wallets where account_id = v_account for update;
  if not found or v_wallet.balance_cents < v_total then raise exception 'SOLDE_INSUFFISANT' using errcode = '22023'; end if;

  begin
    insert into public.orders(account_id, service_slot_id, status, subtotal_cents, vat_rate, vat_cents, total_cents, payment_method, paid_at, sa_ki_ni, idempotency_key)
    values (v_account, v_slot_id, 'paid', v_total, 0, 0, v_total, 'wallet', v_now, true, v_idem)
    returning id, orders.order_number into v_order_id, v_order_number;
  exception when unique_violation then
    select o.id, o.order_number, o.total_cents into v_existing from public.orders o where o.idempotency_key = v_idem and o.account_id = v_account limit 1;
    select w.balance_cents into v_new_balance from public.wallets w where w.account_id = v_account;
    return query select v_existing.id, v_existing.order_number, v_existing.total_cents, coalesce(v_new_balance, 0); return;
  end;

  insert into public.order_items(order_id, catalog_item_id, menu_formula_id, formula_choices, topping_ids,
    quantity, unit_price_cents, line_total_cents, profil_id, prenom_libre, notes,
    bubble_sirop_id, bubble_perles_id, bubble_the_id)
  select v_order_id, (l->>'catalog_item_id')::uuid, nullif(l->>'menu_formula_id','')::uuid,
    case when l->'formula_choices' = 'null'::jsonb then null else l->'formula_choices' end,
    case when l->'topping_ids' is null or l->'topping_ids' = 'null'::jsonb then null
         else array(select jsonb_array_elements_text(l->'topping_ids'))::uuid[] end,
    1, (l->>'unit_price_cents')::int, (l->>'unit_price_cents')::int, (l->>'profil_id')::uuid,
    l->>'prenom_libre', l->>'notes',
    nullif(l->>'bubble_sirop_id','')::uuid, nullif(l->>'bubble_perles_id','')::uuid, nullif(l->>'bubble_the_id','')::uuid
  from jsonb_array_elements(v_lines) as l;

  v_new_balance := v_wallet.balance_cents - v_total;
  insert into public.wallet_transactions(wallet_id, type, amount_cents, balance_after_cents, order_id, description, created_by)
  values (v_wallet.id, 'debit_order', -v_total, v_new_balance, v_order_id, 'Sa ki ni ' || coalesce(v_order_number, v_order_id::text), v_user)
  returning id into v_wt;
  update public.wallets set balance_cents = v_new_balance, total_debited_cents = coalesce(total_debited_cents, 0) + v_total, updated_at = v_now where id = v_wallet.id;
  update public.orders set wallet_transaction_id = v_wt where id = v_order_id;
  perform public.bubble_sync_order(v_order_id);
  return query select v_order_id, v_order_number, v_total, v_new_balance;
end;
$function$;
