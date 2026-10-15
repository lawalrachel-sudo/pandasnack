-- PS-23 — Bubble Tea au détail : 1 parfum (sirop) + 1 bubble (perles) par Bubble Tea, stock estimé
-- par parfum/perles à partir des ventes (sorties) et réassorts/tickets (entrées), corrigé par
-- inventaire. Montants de stock en ml (sirop) / g (perles). Appliquée en prod puis fichier == prod.

-- 1. Référentiels ------------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname='bubble_kind') then
    create type public.bubble_kind as enum ('sirop','perles');
  end if;
  if not exists (select 1 from pg_type where typname='bubble_mouvement_source') then
    create type public.bubble_mouvement_source as enum
      ('vente_precommande','vente_comptoir','annulation','reassort','ticket','inventaire');
  end if;
end $$;

create table if not exists public.bubble_options (
  id uuid primary key default gen_random_uuid(),
  kind public.bubble_kind not null,
  name text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  unite text not null,                        -- 'ml' (sirop) | 'g' (perles)
  dose numeric(10,2) not null,                -- 30 ml / 78 g
  seuil_doses int not null default 5,
  created_at timestamptz not null default now()
);
create unique index if not exists bubble_options_kind_name_uidx
  on public.bubble_options (kind, lower(name));

-- Seed : 8 sirops (30 ml) + 4 perles (78 g), tous actifs. ON CONFLICT → idempotent.
insert into public.bubble_options (kind, name, unite, dose, sort_order) values
  ('sirop','Menthe','ml',30,1),('sirop','Mojito','ml',30,2),('sirop','Fraise','ml',30,3),
  ('sirop','Pêche','ml',30,4),('sirop','Orange','ml',30,5),('sirop','Mangue','ml',30,6),
  ('sirop','Cerise','ml',30,7),('sirop','Citron','ml',30,8),
  ('perles','Lytchee','g',78,1),('perles','Fraise','g',78,2),
  ('perles','Passion','g',78,3),('perles','Pomme grenade','g',78,4)
on conflict (kind, lower(name)) do nothing;

-- 2. Journal des mouvements (ajout seul) ------------------------------------------------------
create table if not exists public.bubble_stock_mouvements (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.bubble_options(id),
  qty numeric(12,2) not null,                 -- signé, en ml ou g (sortie < 0, entrée > 0)
  source public.bubble_mouvement_source not null,
  ref_order_item_id uuid,
  ref_comptoir_sale_id uuid,
  ref_ticket_ligne_id uuid,
  note text,
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists bubble_mvt_option_idx on public.bubble_stock_mouvements(option_id);
-- Idempotence : un order_item / une vente comptoir / une ligne de ticket ne génère pas deux fois le
-- même mouvement pour la même option (sortie vs annulation distinguées par `source`).
create unique index if not exists bubble_mvt_order_uidx
  on public.bubble_stock_mouvements (source, option_id, ref_order_item_id)
  where ref_order_item_id is not null;
create unique index if not exists bubble_mvt_comptoir_uidx
  on public.bubble_stock_mouvements (source, option_id, ref_comptoir_sale_id)
  where ref_comptoir_sale_id is not null;
create unique index if not exists bubble_mvt_ticket_uidx
  on public.bubble_stock_mouvements (source, option_id, ref_ticket_ligne_id)
  where ref_ticket_ligne_id is not null;

-- Journal en AJOUT SEUL (comme comptoir_sales) : pas d'UPDATE/DELETE, même en service_role.
create or replace function public.bubble_mvt_append_only()
returns trigger language plpgsql as $fn$
begin
  raise exception 'BUBBLE_MVT_APPEND_ONLY : le journal de stock est en ajout seul';
end $fn$;
drop trigger if exists trg_bubble_mvt_append_only on public.bubble_stock_mouvements;
create trigger trg_bubble_mvt_append_only
  before update or delete on public.bubble_stock_mouvements
  for each row execute function public.bubble_mvt_append_only();

-- Vue stock estimé par option.
create or replace view public.bubble_stock_estime as
select o.id as option_id, o.kind, o.name, o.active, o.unite, o.dose, o.seuil_doses, o.sort_order,
       coalesce(sum(m.qty),0) as stock,
       floor(coalesce(sum(m.qty),0) / o.dose)::int as doses_restantes,
       (floor(coalesce(sum(m.qty),0) / o.dose)::int < o.seuil_doses) as alerte
from public.bubble_options o
left join public.bubble_stock_mouvements m on m.option_id = o.id and coalesce(m.is_test,false) = false
group by o.id;

-- 3. Choix porté par la ligne de commande et par la ligne de ticket --------------------------
alter table public.order_items add column if not exists bubble_sirop_id uuid references public.bubble_options(id);
alter table public.order_items add column if not exists bubble_perles_id uuid references public.bubble_options(id);
alter table public.tickets_achats_lignes add column if not exists bubble_option_id uuid references public.bubble_options(id);

-- 4. Moteur de stock précommande (trigger sur orders) ----------------------------------------
-- Une ligne produit une sortie Bubble Tea ssi bubble_sirop_id ET bubble_perles_id sont posés
-- (couvre : seul, Menu Panda, pack, jeton, Panda Bonus, Sa ki ni — le choix vit sur la ligne).
-- Idempotent : rejoué sans effet (ON CONFLICT). Reflète l'état courant de la commande.
create or replace function public.bubble_sync_order(p_order_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
declare
  v_status text; v_pm text; v_is_test boolean; v_production boolean;
begin
  select o.status::text, o.payment_method, coalesce(a.is_test,false)
    into v_status, v_pm, v_is_test
    from public.orders o left join public.accounts a on a.id = o.account_id
   where o.id = p_order_id;
  if not found then return; end if;
  v_production := v_status = 'paid' or (v_status = 'pending_payment' and v_pm = 'on_site');

  if v_production then
    -- Sortie sirop.
    insert into public.bubble_stock_mouvements (option_id, qty, source, ref_order_item_id, is_test)
      select oi.bubble_sirop_id, -(bo.dose * oi.quantity), 'vente_precommande', oi.id, v_is_test
      from public.order_items oi join public.bubble_options bo on bo.id = oi.bubble_sirop_id
      where oi.order_id = p_order_id and oi.bubble_sirop_id is not null and oi.bubble_perles_id is not null
      on conflict (source, option_id, ref_order_item_id) where ref_order_item_id is not null do nothing;
    -- Sortie perles.
    insert into public.bubble_stock_mouvements (option_id, qty, source, ref_order_item_id, is_test)
      select oi.bubble_perles_id, -(bo.dose * oi.quantity), 'vente_precommande', oi.id, v_is_test
      from public.order_items oi join public.bubble_options bo on bo.id = oi.bubble_perles_id
      where oi.order_id = p_order_id and oi.bubble_sirop_id is not null and oi.bubble_perles_id is not null
      on conflict (source, option_id, ref_order_item_id) where ref_order_item_id is not null do nothing;

  elsif v_status = 'cancelled' then
    -- Annulation = inverse EXACT des sorties précommande déjà enregistrées pour cette commande.
    insert into public.bubble_stock_mouvements (option_id, qty, source, ref_order_item_id, is_test)
      select m.option_id, -m.qty, 'annulation', m.ref_order_item_id, m.is_test
      from public.bubble_stock_mouvements m
      join public.order_items oi on oi.id = m.ref_order_item_id
      where oi.order_id = p_order_id and m.source = 'vente_precommande'
      on conflict (source, option_id, ref_order_item_id) where ref_order_item_id is not null do nothing;
  end if;
end $fn$;

create or replace function public.bubble_orders_trg()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp' as $fn$
begin
  perform public.bubble_sync_order(new.id);
  return new;
end $fn$;

drop trigger if exists trg_bubble_orders on public.orders;
create trigger trg_bubble_orders after update on public.orders
  for each row
  when (new.status is distinct from old.status or new.payment_method is distinct from old.payment_method)
  execute function public.bubble_orders_trg();

-- 5. RLS --------------------------------------------------------------------------------------
alter table public.bubble_options enable row level security;
alter table public.bubble_stock_mouvements enable row level security;
drop policy if exists bubble_options_read_actives on public.bubble_options;
create policy bubble_options_read_actives on public.bubble_options
  for select to authenticated using (active = true);
-- bubble_stock_mouvements : aucune policy → service_role seul (routes admin).

comment on table public.bubble_options is 'PS-23 — parfums (sirop) et bubbles (perles) du Bubble Tea. Lecture actives = authenticated ; écriture service_role.';
comment on table public.bubble_stock_mouvements is 'PS-23 — journal (ajout seul) des mouvements de stock sirop/perles (ml/g). service_role seul.';

-- 6. comptoir_sell — émet les mouvements sirop/perles (source vente_comptoir) ----------------
create or replace function public.comptoir_sell(payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  v_key text := payload->>'idempotency_key';
  v_mode text := payload->>'payment_mode';
  v_today date := (now() at time zone 'America/Martinique')::date;
  v_service_date date := coalesce(nullif(payload->>'service_date','')::date, v_today);
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
  v_name text;
  v_parent_name text;
  v_parent_jeton int;
  v_eff_jeton int;
  v_jeton_sum int := 0;
  v_jeton_missing boolean := false;
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
  if v_service_date < v_today then v_service_date := v_today; end if;

  select * into v_existing from public.comptoir_sales where idempotency_key = v_key;
  if found then return to_jsonb(v_existing); end if;

  if v_account is null and v_profil is not null then
    select account_id into v_account from public.profils where id = v_profil;
  end if;
  if v_account is not null then
    select coalesce(is_test,false) into v_is_test from public.accounts where id = v_account;
  end if;

  for v_it in select value from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop
    v_qty := coalesce((v_it->>'qty')::int, 0);
    if v_qty <= 0 then continue; end if;
    select id, sku, name, price_alone_cents, stock_qty, active, sellable_comptoir, parent_id, jeton_price
      into v_cat from public.catalog_items where id = (v_it->>'catalog_item_id')::uuid for update;
    if not found or not v_cat.active or not coalesce(v_cat.sellable_comptoir,false) then
      raise exception 'ARTICLE_INDISPONIBLE' using errcode='22023';
    end if;
    if exists (select 1 from public.catalog_items c2 where c2.parent_id = v_cat.id and c2.active) then
      raise exception 'VARIANTE_REQUISE' using errcode='22023',
        detail = json_build_object('sku', v_cat.sku, 'name', v_cat.name)::text;
    end if;
    if v_cat.stock_qty is not null and v_cat.stock_qty < v_qty then
      raise exception 'STOCK' using errcode='22023',
        detail = json_build_object('sku', v_cat.sku, 'name', v_cat.name, 'stock', v_cat.stock_qty)::text;
    end if;
    if v_cat.parent_id is not null then
      select name, jeton_price into v_parent_name, v_parent_jeton from public.catalog_items where id = v_cat.parent_id;
      v_name := coalesce(v_parent_name, '') || ' · ' || v_cat.name;
      v_eff_jeton := coalesce(v_cat.jeton_price, v_parent_jeton);
    else
      v_name := v_cat.name;
      v_eff_jeton := v_cat.jeton_price;
    end if;
    if v_eff_jeton is not null then v_jeton_sum := v_jeton_sum + v_eff_jeton * v_qty;
    else v_jeton_missing := true; end if;
    if v_mode = 'jeton' then v_unit := 0; else v_unit := coalesce(v_cat.price_alone_cents,0); end if;
    v_total := v_total + v_unit * v_qty;
    v_items := v_items || jsonb_build_object(
      'catalog_item_id', v_cat.id, 'sku', v_cat.sku, 'name', v_name,
      'qty', v_qty, 'unit_price_cents', v_unit, 'line_total_cents', v_unit * v_qty,
      'bubble', v_it->'bubble');  -- PS-23 : parfum/bubbles choisis (ou null)
  end loop;

  if jsonb_array_length(v_items) = 0 then raise exception 'PANIER_VIDE' using errcode='22023'; end if;

  if v_mode = 'jeton' then
    v_total := 0;
    if v_jeton_missing then raise exception 'JETON_NON_DISPO' using errcode='22023'; end if;
    v_jeton_qty := v_jeton_sum;
    if coalesce(v_jeton_qty,0) <= 0 then raise exception 'JETON_QTY_REQUISE' using errcode='22023'; end if;
  end if;

  if v_mode = 'wallet' then
    if v_account is null then raise exception 'COMPTE_REQUIS_WALLET' using errcode='22023'; end if;
    select * into v_wallet from public.wallets where account_id = v_account for update;
    if not found or v_wallet.balance_cents < v_total then
      raise exception 'SOLDE_INSUFFISANT' using errcode='22023',
        detail = json_build_object('solde', coalesce(v_wallet.balance_cents,0), 'total', v_total)::text;
    end if;
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

  for v_it in select value from jsonb_array_elements(v_items) loop
    update public.catalog_items
       set stock_qty = stock_qty - (v_it->>'qty')::int
     where id = (v_it->>'catalog_item_id')::uuid and stock_qty is not null;
  end loop;

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

  -- PS-23 : mouvements sirop/perles pour chaque Bubble Tea du panier (sortie comptoir).
  for v_it in select value from jsonb_array_elements(v_items) loop
    if v_it->'bubble' is not null and v_it->'bubble' <> 'null'::jsonb then
      insert into public.bubble_stock_mouvements (option_id, qty, source, ref_comptoir_sale_id, is_test)
        select bo.id, -(bo.dose * (v_it->>'qty')::int), 'vente_comptoir', v_sale.id, v_is_test
        from public.bubble_options bo
        where bo.id = (v_it->'bubble'->>'sirop_id')::uuid
        on conflict (source, option_id, ref_comptoir_sale_id) where ref_comptoir_sale_id is not null do nothing;
      insert into public.bubble_stock_mouvements (option_id, qty, source, ref_comptoir_sale_id, is_test)
        select bo.id, -(bo.dose * (v_it->>'qty')::int), 'vente_comptoir', v_sale.id, v_is_test
        from public.bubble_options bo
        where bo.id = (v_it->'bubble'->>'perles_id')::uuid
        on conflict (source, option_id, ref_comptoir_sale_id) where ref_comptoir_sale_id is not null do nothing;
    end if;
  end loop;

  return to_jsonb(v_sale);
end $function$;

-- 7. comptoir_reverse — réincrémente le stock sirop/perles (source annulation) ---------------
create or replace function public.comptoir_reverse(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $function$
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

  for v_it in select value from jsonb_array_elements(v_orig.items) loop
    v_neg_items := v_neg_items || jsonb_build_object(
      'catalog_item_id', v_it->'catalog_item_id', 'sku', v_it->'sku', 'name', v_it->'name',
      'qty', -((v_it->>'qty')::int), 'unit_price_cents', (v_it->>'unit_price_cents')::int,
      'line_total_cents', -((v_it->>'line_total_cents')::int),
      'bubble', v_it->'bubble');  -- PS-23
  end loop;

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

  for v_it in select value from jsonb_array_elements(v_orig.items) loop
    update public.catalog_items
       set stock_qty = stock_qty + (v_it->>'qty')::int
     where id = (v_it->>'catalog_item_id')::uuid and stock_qty is not null;
  end loop;

  -- PS-23 : réincrément du stock sirop/perles (inverse exact de la vente comptoir).
  for v_it in select value from jsonb_array_elements(v_orig.items) loop
    if v_it->'bubble' is not null and v_it->'bubble' <> 'null'::jsonb then
      insert into public.bubble_stock_mouvements (option_id, qty, source, ref_comptoir_sale_id, is_test)
        select bo.id, (bo.dose * (v_it->>'qty')::int), 'annulation', p_sale_id, v_orig.is_test
        from public.bubble_options bo
        where bo.id = (v_it->'bubble'->>'sirop_id')::uuid
        on conflict (source, option_id, ref_comptoir_sale_id) where ref_comptoir_sale_id is not null do nothing;
      insert into public.bubble_stock_mouvements (option_id, qty, source, ref_comptoir_sale_id, is_test)
        select bo.id, (bo.dose * (v_it->>'qty')::int), 'annulation', p_sale_id, v_orig.is_test
        from public.bubble_options bo
        where bo.id = (v_it->'bubble'->>'perles_id')::uuid
        on conflict (source, option_id, ref_comptoir_sale_id) where ref_comptoir_sale_id is not null do nothing;
    end if;
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
end $function$;

-- 8. sa_ki_ni_commander — porte le choix sirop/perles sur la ligne + déclenche la sortie --------
create or replace function public.sa_ki_ni_commander(p_payload jsonb)
returns table(order_id uuid, order_number text, total_cents integer, wallet_balance_after integer)
language plpgsql security definer set search_path to 'public','pg_temp' as $function$
declare
  v_user uuid;
  v_account uuid;
  v_slot record;
  v_slot_id uuid;
  v_idem text;
  v_supp int := 0;
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

    if v_is_formula then
      if not coalesce(v_citem.sellable_in_menu, false) then raise exception 'SKN_FORMULE' using errcode = '22023'; end if;
      select price_cents into v_price from public.menu_formulas
        where id = v_menu_formula_id and active and code = 'MENU_PANDA';
      if v_price is null then raise exception 'SKN_FORMULE' using errcode = '22023'; end if;
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
      'formula_choices', v_item->'formula_choices',
      'bubble_sirop_id', nullif(v_item->>'bubble_sirop_id',''),   -- PS-23
      'bubble_perles_id', nullif(v_item->>'bubble_perles_id','')  -- PS-23
    ));
  end loop;

  select * into v_wallet from public.wallets where account_id = v_account for update;
  if not found or v_wallet.balance_cents < v_total then
    raise exception 'SOLDE_INSUFFISANT' using errcode = '22023';
  end if;

  begin
    insert into public.orders(
      account_id, service_slot_id, status, subtotal_cents, vat_rate, vat_cents, total_cents,
      payment_method, paid_at, sa_ki_ni, idempotency_key
    ) values (
      v_account, v_slot_id, 'paid', v_total, 0, 0, v_total,
      'wallet', v_now, true, v_idem
    ) returning id, orders.order_number into v_order_id, v_order_number;
  exception when unique_violation then
    select o.id, o.order_number, o.total_cents into v_existing
    from public.orders o where o.idempotency_key = v_idem and o.account_id = v_account limit 1;
    select w.balance_cents into v_new_balance from public.wallets w where w.account_id = v_account;
    return query select v_existing.id, v_existing.order_number, v_existing.total_cents, coalesce(v_new_balance, 0);
    return;
  end;

  insert into public.order_items(
    order_id, catalog_item_id, menu_formula_id, formula_choices, topping_ids,
    quantity, unit_price_cents, line_total_cents, profil_id, prenom_libre, notes,
    bubble_sirop_id, bubble_perles_id
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
    l->>'notes',
    nullif(l->>'bubble_sirop_id','')::uuid,
    nullif(l->>'bubble_perles_id','')::uuid
  from jsonb_array_elements(v_lines) as l;

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

  -- PS-23 : commande créée déjà 'paid' par INSERT (le trigger AFTER UPDATE ne la voit pas) → sortie explicite.
  perform public.bubble_sync_order(v_order_id);

  return query select v_order_id, v_order_number, v_total, v_new_balance;
end;
$function$;
