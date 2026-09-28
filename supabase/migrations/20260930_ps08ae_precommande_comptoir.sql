-- PS-08a-e — Précommande comptoir : une vente a DEUX dates.
--   created_at (Martinique) = jour d'encaissement → compté par le Z ; wallet/stock immédiats.
--   service_date = jour de consommation/préparation → feuille de route + plafond goûter.
-- Ici :
--   1. comptoir_sell : service_date = payload.service_date validée (≥ aujourd'hui Martinique),
--      sinon aujourd'hui ; plafond calculé sur la service_date demandée (inchangé, net des
--      contre-passations). Wallet/stock/journal/idempotence immédiats (inchangés).
--   2. caisse_z : les comptoir_sales sont comptées par (created_at at time zone
--      'America/Martinique')::date — JAMAIS par service_date.

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
  -- Jour de consommation : jamais dans le passé (défaut aujourd'hui Martinique).
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
    select id, sku, name, price_alone_cents, stock_qty, active, sellable_comptoir, parent_id
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
      select name into v_parent_name from public.catalog_items where id = v_cat.parent_id;
      v_name := coalesce(v_parent_name, '') || ' · ' || v_cat.name;
    else
      v_name := v_cat.name;
    end if;
    if v_mode = 'jeton' then v_unit := 0; else v_unit := coalesce(v_cat.price_alone_cents,0); end if;
    v_total := v_total + v_unit * v_qty;
    v_items := v_items || jsonb_build_object(
      'catalog_item_id', v_cat.id, 'sku', v_cat.sku, 'name', v_name,
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
    if v_profil is not null then
      select plafond_gouter_cents into v_plafond from public.profils where id = v_profil;
      if v_plafond is not null then
        -- Plafond « goûter » du jour de consommation : net des contre-passations (les lignes
        -- d'annulation portent la même service_date et un total négatif).
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

-- caisse_z : comptoir compté par jour d'ENCAISSEMENT (created_at Martinique), pas service_date.
create or replace function public.caisse_z(p_start date, p_end date)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  pre_stripe int := 0; pre_wallet int := 0; pre_especes int := 0; pre_cbsumup int := 0; pre_non int := 0; pre_nb int := 0;
  cpt_wallet int := 0; cpt_especes int := 0; cpt_cbsumup int := 0; cpt_jeton int := 0; cpt_jetons_qty int := 0; cpt_nb int := 0; cpt_annul int := 0;
  w_consomme int := 0; w_stripe int := 0; w_especes int := 0; w_cbsumup int := 0; w_dette int := 0;
  articles jsonb := '[]'::jsonb;
  o record; s record; pit record; it jsonb;
  amap jsonb := '{}'::jsonb; akey text; a jsonb;
begin
  for o in
    select ord.total_cents, ord.payment_method, ord.payment_mode, ord.status
    from public.orders ord
    join public.service_slots ss on ss.id = ord.service_slot_id
    join public.accounts ac on ac.id = ord.account_id
    where ss.service_date between p_start and p_end
      and coalesce(ac.is_test,false) = false
      and (ord.status = 'paid' or (ord.status = 'pending_payment' and ord.payment_method = 'on_site'))
  loop
    pre_nb := pre_nb + 1;
    if o.payment_method = 'card' then pre_stripe := pre_stripe + o.total_cents;
    elsif o.payment_method in ('wallet','wallet_card') then pre_wallet := pre_wallet + o.total_cents;
    elsif o.payment_method = 'on_site' and o.payment_mode = 'especes' then pre_especes := pre_especes + o.total_cents;
    elsif o.payment_method = 'on_site' and o.payment_mode = 'cb_sumup' then pre_cbsumup := pre_cbsumup + o.total_cents;
    else pre_non := pre_non + o.total_cents;
    end if;
  end loop;

  for pit in
    select coalesce(ci.sku, mf.code, 'AUTRE') as sku,
           coalesce(mf.name, ci.name, 'Article') as name,
           oi.quantity as qty, oi.line_total_cents as total
    from public.order_items oi
    join public.orders ord on ord.id = oi.order_id
    join public.service_slots ss on ss.id = ord.service_slot_id
    join public.accounts ac on ac.id = ord.account_id
    left join public.catalog_items ci on ci.id = oi.catalog_item_id
    left join public.menu_formulas mf on mf.id = oi.menu_formula_id
    where ss.service_date between p_start and p_end
      and coalesce(ac.is_test,false) = false
      and (ord.status = 'paid' or (ord.status = 'pending_payment' and ord.payment_method = 'on_site'))
  loop
    akey := 'P:' || pit.sku;
    a := coalesce(amap->akey, jsonb_build_object('sku', pit.sku, 'name', pit.name, 'qty', 0, 'total_cents', 0, 'source', 'precommande'));
    a := jsonb_set(a, '{qty}', to_jsonb((a->>'qty')::int + coalesce(pit.qty,1)));
    a := jsonb_set(a, '{total_cents}', to_jsonb((a->>'total_cents')::int + coalesce(pit.total,0)));
    amap := jsonb_set(amap, array[akey], a);
  end loop;

  for s in
    select payment_mode, total_cents, jeton_qty, reverses_sale_id, items
    from public.comptoir_sales
    where (created_at at time zone 'America/Martinique')::date between p_start and p_end
      and is_test = false
  loop
    if s.reverses_sale_id is null then cpt_nb := cpt_nb + 1; else cpt_annul := cpt_annul + 1; end if;
    if s.payment_mode = 'wallet' then cpt_wallet := cpt_wallet + s.total_cents;
    elsif s.payment_mode = 'especes' then cpt_especes := cpt_especes + s.total_cents;
    elsif s.payment_mode = 'cb_sumup' then cpt_cbsumup := cpt_cbsumup + s.total_cents;
    elsif s.payment_mode = 'jeton' then cpt_jetons_qty := cpt_jetons_qty + coalesce(s.jeton_qty,0);
    end if;
    for it in select value from jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) loop
      akey := 'C:' || (it->>'sku');
      a := coalesce(amap->akey, jsonb_build_object('sku', it->>'sku', 'name', it->>'name', 'qty', 0, 'total_cents', 0, 'source', 'comptoir'));
      a := jsonb_set(a, '{qty}', to_jsonb((a->>'qty')::int + coalesce((it->>'qty')::int,0)));
      a := jsonb_set(a, '{total_cents}', to_jsonb((a->>'total_cents')::int + coalesce((it->>'line_total_cents')::int,0)));
      amap := jsonb_set(amap, array[akey], a);
    end loop;
  end loop;

  select coalesce(jsonb_agg(v), '[]'::jsonb) into articles from (select value v from jsonb_each(amap)) t;

  select
    coalesce(-sum(amount_cents) filter (where wt.type in ('debit_order','debit_boutique')),0)
      - coalesce(sum(amount_cents) filter (where wt.type in ('refund','refund_boutique')),0),
    coalesce(sum(amount_cents) filter (where wt.type in ('credit_purchase','credit_stripe')),0),
    coalesce(sum(amount_cents) filter (where wt.type='adjustment' and coalesce(wt.description,'') not ilike '%SumUp%'),0),
    coalesce(sum(amount_cents) filter (where wt.type='adjustment' and coalesce(wt.description,'') ilike '%SumUp%'),0)
  into w_consomme, w_stripe, w_especes, w_cbsumup
  from public.wallet_transactions wt
  join public.wallets w on w.id = wt.wallet_id
  join public.accounts ac on ac.id = w.account_id
  where coalesce(ac.is_test,false)=false
    and (wt.created_at at time zone 'America/Martinique')::date between p_start and p_end;

  select coalesce(sum(w.balance_cents),0) into w_dette
  from public.wallets w join public.accounts ac on ac.id=w.account_id where coalesce(ac.is_test,false)=false;

  return jsonb_build_object(
    'periode', jsonb_build_object('type', case when p_start=p_end then 'jour' else 'periode' end, 'start', p_start, 'end', p_end),
    'precommandes', jsonb_build_object('par_mode', jsonb_build_object('stripe',pre_stripe,'wallet',pre_wallet,'especes',pre_especes,'cb_sumup',pre_cbsumup,'non_encaisse',pre_non), 'nb', pre_nb),
    'comptoir', jsonb_build_object('par_mode', jsonb_build_object('wallet',cpt_wallet,'especes',cpt_especes,'cb_sumup',cpt_cbsumup,'jeton',cpt_jeton), 'jetons_qty', cpt_jetons_qty, 'nb', cpt_nb, 'nb_annulations', cpt_annul),
    'articles', articles,
    'wallet', jsonb_build_object('consomme', w_consomme, 'recharge', jsonb_build_object('stripe',w_stripe,'especes',w_especes,'cb_sumup',w_cbsumup), 'dette_totale', w_dette),
    'totaux', jsonb_build_object(
      'ttc_par_mode', jsonb_build_object('stripe', pre_stripe, 'wallet', pre_wallet + cpt_wallet, 'especes', pre_especes + cpt_especes, 'cb_sumup', pre_cbsumup + cpt_cbsumup, 'non_encaisse', pre_non, 'jeton', cpt_jeton),
      'ttc', pre_stripe + pre_wallet + pre_especes + pre_cbsumup + pre_non + cpt_wallet + cpt_especes + cpt_cbsumup,
      'especes_attendues', pre_especes + cpt_especes + w_especes)
  );
end $$;
