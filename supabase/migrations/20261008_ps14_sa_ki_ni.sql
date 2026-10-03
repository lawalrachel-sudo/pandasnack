-- PS-14 — SA KI NI (« ce qu'il y a ») : après la clôture (veille 20h), Rachel ouvre quelques
-- portions EN PLUS d'un plat déjà commandé ce jour-là ; les parents peuvent les prendre le jour J
-- jusqu'à 10h30 Martinique, payées UNIQUEMENT au Panda Wallet, dans la limite des quantités.
-- Fermé par défaut : sans action de Rachel, rien n'apparaît côté parents.

-- 1. Plats éligibles (réglage SQL uniquement, pas d'écran admin)
alter table public.catalog_items add column if not exists sa_ki_ni_ok boolean not null default false;
update public.catalog_items set sa_ki_ni_ok = true where sku in ('CROQ-PANDA', 'CROQ-SIMPLE');
-- Tout le reste reste false (Pasta Box Bolognaise et tout plat au thon : jamais).

-- 2. Offres du jour : une ligne = X portions ouvertes d'un plat pour un créneau donné.
create table if not exists public.sa_ki_ni_offres (
  id uuid primary key default gen_random_uuid(),
  service_slot_id uuid not null references public.service_slots(id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  qty_ouverte int not null check (qty_ouverte > 0),
  qty_vendue int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_slot_id, catalog_item_id),
  check (qty_vendue <= qty_ouverte)
);

alter table public.sa_ki_ni_offres enable row level security;
-- Lecture parents : uniquement les offres du créneau du JOUR (Martinique), dans la fenêtre
-- [orders_cutoff_at ; 10h30], et encore disponibles (qty_vendue < qty_ouverte).
drop policy if exists sa_ki_ni_offres_read_parents on public.sa_ki_ni_offres;
create policy sa_ki_ni_offres_read_parents on public.sa_ki_ni_offres
for select to authenticated
using (
  qty_vendue < qty_ouverte
  and exists (
    select 1 from public.service_slots ss
    where ss.id = sa_ki_ni_offres.service_slot_id
      and ss.service_date = (now() at time zone 'America/Martinique')::date
      and now() >= ss.orders_cutoff_at
      and now() <= ((ss.service_date + time '10:30') at time zone 'America/Martinique')
  )
);
-- Écriture : aucune policy pour authenticated → réservé service_role (routes admin).

-- 3. Marqueur sur la commande + idempotence
alter table public.orders add column if not exists sa_ki_ni boolean not null default false;
alter table public.orders add column if not exists idempotency_key text;
create unique index if not exists orders_idempotency_key_uidx
  on public.orders(idempotency_key) where idempotency_key is not null;

-- 4. RPC de commande Sa ki ni (parent) — sur le modèle de process_order_payment.
--    UNE transaction : fenêtre → stock → plat éligible → profil → solde → commande payée wallet.
create or replace function public.sa_ki_ni_commander(p_payload jsonb)
returns table(order_id uuid, order_number text, total_cents int, wallet_balance_after int)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_account uuid;
  v_slot record;
  v_slot_id uuid;
  v_idem text;
  v_supp int;
  v_upper timestamptz;
  v_items jsonb;
  v_item jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_cat uuid;
  v_is_formula boolean;
  v_menu_formula_id uuid;
  v_profil uuid;
  v_citem record;
  v_offer record;
  v_price int;
  v_line int;
  v_total int := 0;
  v_wallet record;
  v_new_balance int;
  v_wt uuid;
  v_order_id uuid;
  v_order_number text;
  v_now timestamptz := now();
  v_existing record;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;

  select id into v_account from public.accounts where auth_user_id = v_user limit 1;
  if v_account is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = '28000'; end if;

  v_slot_id := nullif(p_payload->>'slot_id','')::uuid;
  v_idem    := nullif(p_payload->>'idempotency_key','');
  v_supp    := greatest(coalesce((p_payload->>'supplement_cents')::int, 0), 0);
  v_items   := coalesce(p_payload->'items', '[]'::jsonb);

  -- Idempotence : une requête rejouée renvoie la commande déjà créée (sans re-débiter).
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

  -- Fenêtre [orders_cutoff_at ; 10h30 Martinique le jour de service]
  v_upper := (v_slot.service_date + time '10:30') at time zone 'America/Martinique';
  if v_slot.orders_cutoff_at is null or v_now < v_slot.orders_cutoff_at or v_now > v_upper then
    raise exception 'SKN_FERME' using errcode = '22023';
  end if;

  -- Validation ligne par ligne + verrou des offres (FOR UPDATE) + total
  for v_item in select * from jsonb_array_elements(v_items) loop
    v_cat := nullif(v_item->>'catalog_item_id','')::uuid;
    v_is_formula := coalesce((v_item->>'is_formula')::boolean, false);
    v_menu_formula_id := nullif(v_item->>'menu_formula_id','')::uuid;
    v_profil := nullif(v_item->>'profil_id','')::uuid;

    -- Profil enfant obligatoire (même garde que la commande normale)
    if v_profil is null then raise exception 'SKN_PROFIL_REQUIS' using errcode = '22023'; end if;
    perform 1 from public.profils
      where id = v_profil and account_id = v_account and type_profil = 'eleve' and active;
    if not found then raise exception 'SKN_PROFIL_REQUIS' using errcode = '22023'; end if;

    if v_cat is null then raise exception 'SKN_PLAT' using errcode = '22023'; end if;
    select * into v_citem from public.catalog_items where id = v_cat;
    if not found then raise exception 'SKN_PLAT' using errcode = '22023'; end if;
    if not v_citem.sa_ki_ni_ok then raise exception 'SKN_NON_OK' using errcode = '22023'; end if;

    select * into v_offer from public.sa_ki_ni_offres
      where service_slot_id = v_slot_id and catalog_item_id = v_cat for update;
    if not found then raise exception 'SKN_NON_OFFERT' using errcode = '22023'; end if;
    if v_offer.qty_vendue >= v_offer.qty_ouverte then raise exception 'SKN_EPUISE' using errcode = '22023'; end if;

    -- Prix = carte : Menu Panda (menu_formulas) ou plat seul (price_alone_cents)
    if v_is_formula then
      select price_cents into v_price from public.menu_formulas where id = v_menu_formula_id and active;
      if v_price is null then raise exception 'SKN_MENU' using errcode = '22023'; end if;
    else
      v_price := v_citem.price_alone_cents;
      if v_price is null then raise exception 'SKN_PRIX' using errcode = '22023'; end if;
    end if;
    v_line := v_price + v_supp;
    v_total := v_total + v_line;

    update public.sa_ki_ni_offres set qty_vendue = qty_vendue + 1, updated_at = v_now where id = v_offer.id;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'catalog_item_id', v_cat,
      'menu_formula_id', v_menu_formula_id,
      'is_formula', v_is_formula,
      'unit_price_cents', v_line,
      'topping_ids', v_item->'topping_ids',
      'profil_id', v_profil,
      'prenom_libre', nullif(v_item->>'prenom_libre',''),
      'notes', nullif(v_item->>'notes',''),
      'formula_choices', v_item->'formula_choices'
    ));
  end loop;

  -- Solde wallet
  select * into v_wallet from public.wallets where account_id = v_account for update;
  if not found or v_wallet.balance_cents < v_total then
    raise exception 'SOLDE_INSUFFISANT' using errcode = '22023';
  end if;

  -- Création commande (payée wallet) — gère la course sur idempotency_key
  begin
    insert into public.orders(
      account_id, service_slot_id, status, subtotal_cents, vat_rate, vat_cents, total_cents,
      payment_method, paid_at, sa_ki_ni, idempotency_key
    ) values (
      v_account, v_slot_id, 'paid', v_total, 0, 0, v_total,
      'wallet', v_now, true, v_idem
    ) returning id, orders.order_number into v_order_id, v_order_number;
  exception when unique_violation then
    -- Requête concurrente avec la même clé : on renvoie la commande déjà créée (tout le reste rollback).
    select o.id, o.order_number, o.total_cents into v_existing
    from public.orders o where o.idempotency_key = v_idem and o.account_id = v_account limit 1;
    select w.balance_cents into v_new_balance from public.wallets w where w.account_id = v_account;
    return query select v_existing.id, v_existing.order_number, v_existing.total_cents, coalesce(v_new_balance, 0);
    return;
  end;

  insert into public.order_items(
    order_id, catalog_item_id, menu_formula_id, formula_choices, topping_ids,
    quantity, unit_price_cents, line_total_cents, profil_id, prenom_libre, notes
  )
  select
    v_order_id,
    (l->>'catalog_item_id')::uuid,
    nullif(l->>'menu_formula_id','')::uuid,
    case when l->'formula_choices' = 'null'::jsonb then null else l->'formula_choices' end,
    case when l->'topping_ids' is null or l->'topping_ids' = 'null'::jsonb then null
         else array(select jsonb_array_elements_text(l->'topping_ids'))::uuid[] end,
    1,
    (l->>'unit_price_cents')::int,
    (l->>'unit_price_cents')::int,
    (l->>'profil_id')::uuid,
    l->>'prenom_libre',
    l->>'notes'
  from jsonb_array_elements(v_lines) as l;

  -- Débit wallet
  v_new_balance := v_wallet.balance_cents - v_total;
  insert into public.wallet_transactions(
    wallet_id, type, amount_cents, balance_after_cents, order_id, description, created_by
  ) values (
    v_wallet.id, 'debit_order', -v_total, v_new_balance, v_order_id,
    'Sa ki ni ' || coalesce(v_order_number, v_order_id::text), v_user
  ) returning id into v_wt;

  update public.wallets
  set balance_cents = v_new_balance,
      total_debited_cents = coalesce(total_debited_cents, 0) + v_total,
      updated_at = v_now
  where id = v_wallet.id;

  update public.orders set wallet_transaction_id = v_wt where id = v_order_id;

  return query select v_order_id, v_order_number, v_total, v_new_balance;
end;
$function$;

revoke all on function public.sa_ki_ni_commander(jsonb) from public;
grant execute on function public.sa_ki_ni_commander(jsonb) to authenticated, service_role;

-- 5. RPC d'annulation admin : recrédit wallet + rend la portion (qty_vendue - 1). Idempotent.
create or replace function public.sa_ki_ni_reverse(p_order_id uuid)
returns table(order_id uuid, refunded_cents int, portions_returned int)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order record;
  v_wallet record;
  v_new_balance int;
  v_returned int := 0;
  r record;
begin
  select * into v_order from public.orders where id = p_order_id and sa_ki_ni = true for update;
  if not found then raise exception 'SKN_INTROUVABLE' using errcode = '02000'; end if;
  if v_order.status = 'cancelled' then
    -- déjà annulée : no-op idempotent
    return query select v_order.id, 0, 0;
    return;
  end if;
  if v_order.status <> 'paid' then raise exception 'SKN_NON_ANNULABLE' using errcode = '22023'; end if;

  update public.orders set status = 'cancelled', cancelled_at = now() where id = v_order.id;

  -- Recrédit wallet (le Sa ki ni est toujours payé par wallet)
  if v_order.total_cents > 0 then
    select * into v_wallet from public.wallets where account_id = v_order.account_id for update;
    if found then
      v_new_balance := v_wallet.balance_cents + v_order.total_cents;
      insert into public.wallet_transactions(
        wallet_id, type, amount_cents, balance_after_cents, order_id, description
      ) values (
        v_wallet.id, 'refund', v_order.total_cents, v_new_balance, v_order.id,
        'Annulation Sa ki ni ' || coalesce(v_order.order_number, v_order.id::text)
      );
      update public.wallets
      set balance_cents = v_new_balance,
          total_credited_cents = coalesce(total_credited_cents, 0) + v_order.total_cents,
          updated_at = now()
      where id = v_wallet.id;
    end if;
  end if;

  -- Rend une portion par ligne offerte (floor à 0)
  for r in
    select oi.catalog_item_id, count(*)::int as n from public.order_items oi
    where oi.order_id = v_order.id and oi.catalog_item_id is not null group by oi.catalog_item_id
  loop
    update public.sa_ki_ni_offres
    set qty_vendue = greatest(qty_vendue - r.n, 0), updated_at = now()
    where service_slot_id = v_order.service_slot_id and catalog_item_id = r.catalog_item_id;
    if found then v_returned := v_returned + r.n; end if;
  end loop;

  return query select v_order.id, coalesce(v_order.total_cents, 0), v_returned;
end;
$function$;

revoke all on function public.sa_ki_ni_reverse(uuid) from public;
grant execute on function public.sa_ki_ni_reverse(uuid) to service_role;
