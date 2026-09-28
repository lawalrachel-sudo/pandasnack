-- PS-09a — Alignements avant révision CGV.
--   2. IBAN de remboursement du parent (accounts.iban, iban_titulaire).
--   4. Barème jetons Bambou paramétrable (catalog_items.jeton_price) + comptoir_sell qui
--      calcule jeton_qty = Σ(jeton_price × qty) et refuse un article non payable en jetons.

-- ── 2. IBAN parent ────────────────────────────────────────────────────────────
alter table public.accounts add column if not exists iban text;
alter table public.accounts add column if not exists iban_titulaire text;

-- ── 4. Prix en jetons par article ──────────────────────────────────────────────
alter table public.catalog_items add column if not exists jeton_price int;

-- Barème initial (Rachel le fera varier) : Biscuit = 5, Gaufre = 10, Bubble Tea = 15.
update public.catalog_items set jeton_price = 5  where jeton_price is null and name ilike '%biscuit%';
update public.catalog_items set jeton_price = 10 where jeton_price is null and name ilike '%gaufre%';
update public.catalog_items set jeton_price = 15 where jeton_price is null and (sku = 'DRINK-BBL' or name ilike '%bubble tea%');

-- comptoir_sell v5 (PS-09a) : mode jeton → jeton_qty = Σ(jeton_price × qty), refus d'un
-- article sans jeton_price. Reste inchangé (deux dates, is_test hérité, variantes, plafond).
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
      v_eff_jeton := coalesce(v_cat.jeton_price, v_parent_jeton);   -- variante hérite du parent
    else
      v_name := v_cat.name;
      v_eff_jeton := v_cat.jeton_price;
    end if;
    -- Cumul jetons (mode jeton) : refuse un article sans prix en jetons.
    if v_eff_jeton is not null then v_jeton_sum := v_jeton_sum + v_eff_jeton * v_qty;
    else v_jeton_missing := true; end if;
    if v_mode = 'jeton' then v_unit := 0; else v_unit := coalesce(v_cat.price_alone_cents,0); end if;
    v_total := v_total + v_unit * v_qty;
    v_items := v_items || jsonb_build_object(
      'catalog_item_id', v_cat.id, 'sku', v_cat.sku, 'name', v_name,
      'qty', v_qty, 'unit_price_cents', v_unit, 'line_total_cents', v_unit * v_qty);
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

  return to_jsonb(v_sale);
end $function$;
