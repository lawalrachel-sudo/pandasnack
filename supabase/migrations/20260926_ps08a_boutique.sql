-- PS-08a — Boutique comptoir : catalogue goûter, journal de ventes (ajout seul), débit wallet.
-- Idempotente.

-- 1.a — catalog_items : flags comptoir + stock + special ; catégorie GOUTER.
alter table public.catalog_items
  add column if not exists sellable_comptoir boolean not null default false,
  add column if not exists stock_qty integer,
  add column if not exists is_special boolean not null default false;

insert into public.catalog_categories (id, name, emoji, sort_order, morning_available)
values ('GOUTER', 'Goûter', '🍪', 9, true)
on conflict (id) do nothing;

-- DRINK-BBL + 4 DESSERT vendables au comptoir (indépendant de coming_soon en précommande).
update public.catalog_items
   set sellable_comptoir = true
 where sku = 'DRINK-BBL' or category_id = 'DESSERT';

-- 1.b — plafond goûter par enfant (réglé par le parent en PS-08b ; null = illimité).
alter table public.profils
  add column if not exists plafond_gouter_cents integer;

-- 1.c — nouveaux types de transaction wallet.
alter type public.wallet_transaction_type add value if not exists 'debit_boutique';
alter type public.wallet_transaction_type add value if not exists 'refund_boutique';

-- 1.d — compteur atomique CPT + table journal (ajout seul).
create table if not exists public.comptoir_sale_counters (
  date_str text primary key,
  counter integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.comptoir_sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text unique,
  service_date date not null default current_date,
  account_id uuid references public.accounts(id),
  profil_id uuid references public.profils(id),
  prenom text,
  items jsonb not null default '[]'::jsonb,
  total_cents integer not null,
  payment_mode text not null check (payment_mode in ('wallet','especes','cb_sumup','jeton')),
  jeton_qty integer,
  sumup_receipt text,
  wallet_transaction_id uuid references public.wallet_transactions(id),
  reverses_sale_id uuid references public.comptoir_sales(id),
  is_test boolean not null default false,
  idempotency_key text unique,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists comptoir_sales_date_idx on public.comptoir_sales (service_date);
create index if not exists comptoir_sales_profil_idx on public.comptoir_sales (profil_id);

alter table public.comptoir_sales enable row level security;

-- Ajout seul : aucune modification ni suppression, même en service_role.
create or replace function public.comptoir_sales_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'comptoir_sales est en ajout seul (annulation = contre-écriture)';
end $$;

drop trigger if exists trg_comptoir_sales_append_only on public.comptoir_sales;
create trigger trg_comptoir_sales_append_only
  before update or delete on public.comptoir_sales
  for each row execute function public.comptoir_sales_append_only();

-- 1.e — comptoir_sell : vente transactionnelle. Résout les prix depuis catalog_items
-- (jamais depuis le client). Renvoie la vente en jsonb.
create or replace function public.comptoir_sell(payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_key text := payload->>'idempotency_key';
  v_mode text := payload->>'payment_mode';
  v_service_date date := coalesce(nullif(payload->>'service_date','')::date, current_date);
  v_account uuid := nullif(payload->>'account_id','')::uuid;
  v_profil uuid := nullif(payload->>'profil_id','')::uuid;
  v_prenom text := nullif(payload->>'prenom','');
  v_jeton_qty int := nullif(payload->>'jeton_qty','')::int;
  v_sumup text := nullif(payload->>'sumup_receipt','');
  v_created_by text := coalesce(nullif(payload->>'created_by',''),'admin');
  v_existing public.comptoir_sales;
  v_items jsonb := '[]'::jsonb;
  v_total int := 0;
  v_it jsonb;
  v_cat record;
  v_qty int;
  v_unit int;
  v_wallet record;
  v_new_balance int;
  v_wt_id uuid := null;
  v_is_test boolean := false;
  v_consumed int;
  v_plafond int;
  v_date_str text;
  v_n int;
  v_sale public.comptoir_sales;
begin
  if v_key is null then raise exception 'IDEMPOTENCY_KEY_REQUISE' using errcode='22023'; end if;
  if v_mode is null or v_mode not in ('wallet','especes','cb_sumup','jeton') then
    raise exception 'MODE_INVALIDE' using errcode='22023';
  end if;

  -- Idempotence : même clé → renvoie la vente existante, aucun double débit.
  select * into v_existing from public.comptoir_sales where idempotency_key = v_key;
  if found then return to_jsonb(v_existing); end if;

  if v_account is not null then
    select coalesce(is_test,false) into v_is_test from public.accounts where id = v_account;
  end if;

  -- Résolution des lignes + total + garde stock.
  for v_it in select value from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop
    v_qty := coalesce((v_it->>'qty')::int, 0);
    if v_qty <= 0 then continue; end if;
    select id, sku, name, price_alone_cents, stock_qty, active, sellable_comptoir
      into v_cat from public.catalog_items where id = (v_it->>'catalog_item_id')::uuid for update;
    if not found or not v_cat.active or not coalesce(v_cat.sellable_comptoir,false) then
      raise exception 'ARTICLE_INDISPONIBLE' using errcode='22023';
    end if;
    if v_cat.stock_qty is not null and v_cat.stock_qty < v_qty then
      raise exception 'STOCK' using errcode='22023',
        detail = json_build_object('sku', v_cat.sku, 'name', v_cat.name, 'stock', v_cat.stock_qty)::text;
    end if;
    if v_mode = 'jeton' then v_unit := 0; else v_unit := coalesce(v_cat.price_alone_cents,0); end if;
    v_total := v_total + v_unit * v_qty;
    v_items := v_items || jsonb_build_object(
      'catalog_item_id', v_cat.id, 'sku', v_cat.sku, 'name', v_cat.name,
      'qty', v_qty, 'unit_price_cents', v_unit, 'line_total_cents', v_unit * v_qty);
  end loop;

  if jsonb_array_length(v_items) = 0 then raise exception 'PANIER_VIDE' using errcode='22023'; end if;

  if v_mode = 'jeton' then
    v_total := 0;
    if v_jeton_qty is null or v_jeton_qty <= 0 then raise exception 'JETON_QTY_REQUISE' using errcode='22023'; end if;
  end if;

  if v_mode = 'wallet' then
    if v_account is null then raise exception 'COMPTE_REQUIS_WALLET' using errcode='22023'; end if;
    select * into v_wallet from public.wallets where account_id = v_account for update;
    if not found or v_wallet.balance_cents < v_total then
      raise exception 'SOLDE_INSUFFISANT' using errcode='22023',
        detail = json_build_object('solde', coalesce(v_wallet.balance_cents,0), 'total', v_total)::text;
    end if;
    -- Plafond : net des ventes wallet du jour pour ce profil (contre-passées incluses en négatif).
    if v_profil is not null then
      select plafond_gouter_cents into v_plafond from public.profils where id = v_profil;
      if v_plafond is not null then
        select coalesce(sum(total_cents),0) into v_consumed
          from public.comptoir_sales
         where profil_id = v_profil and service_date = v_service_date and payment_mode = 'wallet';
        if v_consumed + v_total > v_plafond then
          raise exception 'PLAFOND' using errcode='22023',
            detail = json_build_object('consomme', v_consumed, 'plafond', v_plafond, 'total', v_total)::text;
        end if;
      end if;
    end if;
    v_new_balance := v_wallet.balance_cents - v_total;
    insert into public.wallet_transactions (wallet_id, type, amount_cents, balance_after_cents, description, idempotency_key)
      values (v_wallet.id, 'debit_boutique', -v_total, v_new_balance, 'Boutique comptoir', v_key)
      returning id into v_wt_id;
    update public.wallets
       set balance_cents = v_new_balance,
           total_debited_cents = coalesce(total_debited_cents,0) + v_total,
           updated_at = now()
     where id = v_wallet.id;
  end if;

  -- Décrément du stock suivi.
  for v_it in select value from jsonb_array_elements(v_items) loop
    update public.catalog_items
       set stock_qty = stock_qty - (v_it->>'qty')::int
     where id = (v_it->>'catalog_item_id')::uuid and stock_qty is not null;
  end loop;

  -- Numéro CPT (compteur atomique).
  v_date_str := to_char(v_service_date, 'YYYYMMDD');
  insert into public.comptoir_sale_counters (date_str, counter) values (v_date_str, 1)
    on conflict (date_str) do update set counter = comptoir_sale_counters.counter + 1, updated_at = now()
    returning counter into v_n;

  insert into public.comptoir_sales (
    sale_number, service_date, account_id, profil_id, prenom, items, total_cents,
    payment_mode, jeton_qty, sumup_receipt, wallet_transaction_id, is_test, idempotency_key, created_by
  ) values (
    'CPT-' || v_date_str || '-' || lpad(v_n::text, 4, '0'), v_service_date, v_account, v_profil, v_prenom,
    v_items, v_total, v_mode, v_jeton_qty, v_sumup, v_wt_id, v_is_test, v_key, v_created_by
  ) returning * into v_sale;

  return to_jsonb(v_sale);
end $$;

-- 1.f — comptoir_reverse : contre-écriture (annulation).
create or replace function public.comptoir_reverse(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_orig public.comptoir_sales;
  v_neg_items jsonb := '[]'::jsonb;
  v_it jsonb;
  v_wallet record;
  v_new_balance int;
  v_wt_id uuid := null;
  v_date_str text;
  v_n int;
  v_rev public.comptoir_sales;
begin
  select * into v_orig from public.comptoir_sales where id = p_sale_id;
  if not found then raise exception 'VENTE_INTROUVABLE' using errcode='22023'; end if;
  if v_orig.reverses_sale_id is not null then raise exception 'PAS_ANNULABLE' using errcode='22023'; end if;
  if exists (select 1 from public.comptoir_sales where reverses_sale_id = p_sale_id) then
    raise exception 'DEJA_ANNULEE' using errcode='22023';
  end if;

  -- Items négatifs.
  for v_it in select value from jsonb_array_elements(v_orig.items) loop
    v_neg_items := v_neg_items || jsonb_build_object(
      'catalog_item_id', v_it->'catalog_item_id', 'sku', v_it->'sku', 'name', v_it->'name',
      'qty', -((v_it->>'qty')::int), 'unit_price_cents', (v_it->>'unit_price_cents')::int,
      'line_total_cents', -((v_it->>'line_total_cents')::int));
  end loop;

  -- Recrédit wallet si la vente originale était wallet.
  if v_orig.payment_mode = 'wallet' and v_orig.total_cents > 0 and v_orig.account_id is not null then
    select * into v_wallet from public.wallets where account_id = v_orig.account_id for update;
    if found then
      v_new_balance := v_wallet.balance_cents + v_orig.total_cents;
      insert into public.wallet_transactions (wallet_id, type, amount_cents, balance_after_cents, description)
        values (v_wallet.id, 'refund_boutique', v_orig.total_cents, v_new_balance,
                'Annulation ' || coalesce(v_orig.sale_number, v_orig.id::text))
        returning id into v_wt_id;
      update public.wallets
         set balance_cents = v_new_balance,
             total_credited_cents = coalesce(total_credited_cents,0) + v_orig.total_cents,
             updated_at = now()
       where id = v_wallet.id;
    end if;
  end if;

  -- Restock des articles suivis.
  for v_it in select value from jsonb_array_elements(v_orig.items) loop
    update public.catalog_items
       set stock_qty = stock_qty + (v_it->>'qty')::int
     where id = (v_it->>'catalog_item_id')::uuid and stock_qty is not null;
  end loop;

  v_date_str := to_char(v_orig.service_date, 'YYYYMMDD');
  insert into public.comptoir_sale_counters (date_str, counter) values (v_date_str, 1)
    on conflict (date_str) do update set counter = comptoir_sale_counters.counter + 1, updated_at = now()
    returning counter into v_n;

  insert into public.comptoir_sales (
    sale_number, service_date, account_id, profil_id, prenom, items, total_cents,
    payment_mode, jeton_qty, sumup_receipt, wallet_transaction_id, reverses_sale_id, is_test, idempotency_key, created_by
  ) values (
    'CPT-' || v_date_str || '-' || lpad(v_n::text, 4, '0'), v_orig.service_date, v_orig.account_id, v_orig.profil_id, v_orig.prenom,
    v_neg_items, -v_orig.total_cents, v_orig.payment_mode, case when v_orig.jeton_qty is not null then -v_orig.jeton_qty else null end,
    v_orig.sumup_receipt, v_wt_id, p_sale_id, v_orig.is_test, 'reverse-' || p_sale_id::text, 'admin'
  ) returning * into v_rev;

  return to_jsonb(v_rev);
end $$;
