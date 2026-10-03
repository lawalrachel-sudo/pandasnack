-- PS-14b — Sa ki ni : durcissement.
--  1) RPC admin sa_ki_ni_reverse : execute révoqué pour public/anon/authenticated (était
--     appelable par tout parent connecté → auto-remboursement possible). Appliqué en prod 03/10.
--     Règle générale : toute RPC réservée admin = execute révoqué dès sa création.
--  2) sa_ki_ni_commander : le supplément n'est plus lu du payload (valeur fixe dans la fonction,
--     miroir de SA_KI_NI_SUPPLEMENT_CENTS). En formule : uniquement Menu Panda (code MENU_PANDA)
--     ET un plat catalog_items.sellable_in_menu = true, sinon SKN_MENU.

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
  v_supp int := 0;  -- PS-14b : supplément FIXE ici, miroir de SA_KI_NI_SUPPLEMENT_CENTS (src/lib/sa-ki-ni.ts). Jamais lu du payload.
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
      -- PS-14b : en formule, uniquement le Menu Panda ET un plat autorisé en menu.
      if not coalesce(v_citem.sellable_in_menu, false) then raise exception 'SKN_MENU' using errcode = '22023'; end if;
      select price_cents into v_price from public.menu_formulas
        where id = v_menu_formula_id and active and code = 'MENU_PANDA';
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

-- RPC admin : jamais exécutable par public/anon/authenticated.
revoke execute on function public.sa_ki_ni_reverse(uuid) from public, anon, authenticated;
grant execute on function public.sa_ki_ni_reverse(uuid) to service_role;

-- PS-14b — Z de caisse : ajoute « dont Sa ki ni » (total + nb) dans precommandes. Additif :
-- aucun total existant modifié. (Fonction caisse_z d'origine : 20260927_ps08ab_caisse.sql.)
CREATE OR REPLACE FUNCTION public.caisse_z(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  pre_stripe int := 0; pre_wallet int := 0; pre_especes int := 0; pre_cbsumup int := 0; pre_non int := 0; pre_nb int := 0;
  skn_total int := 0; skn_nb int := 0;  -- PS-14b : dont Sa ki ni
  cpt_wallet int := 0; cpt_especes int := 0; cpt_cbsumup int := 0; cpt_jeton int := 0; cpt_jetons_qty int := 0; cpt_nb int := 0; cpt_annul int := 0;
  w_consomme int := 0; w_stripe int := 0; w_especes int := 0; w_cbsumup int := 0; w_dette int := 0;
  articles jsonb := '[]'::jsonb;
  o record; s record; pit record; it jsonb;
  amap jsonb := '{}'::jsonb; akey text; a jsonb;
begin
  for o in
    select ord.total_cents, ord.payment_method, ord.payment_mode, ord.status, ord.sa_ki_ni
    from public.orders ord
    join public.service_slots ss on ss.id = ord.service_slot_id
    join public.accounts ac on ac.id = ord.account_id
    where ss.service_date between p_start and p_end
      and coalesce(ac.is_test,false) = false
      and (ord.status = 'paid' or (ord.status = 'pending_payment' and ord.payment_method = 'on_site'))
  loop
    pre_nb := pre_nb + 1;
    if o.sa_ki_ni then skn_total := skn_total + o.total_cents; skn_nb := skn_nb + 1; end if;
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
    'precommandes', jsonb_build_object('par_mode', jsonb_build_object('stripe',pre_stripe,'wallet',pre_wallet,'especes',pre_especes,'cb_sumup',pre_cbsumup,'non_encaisse',pre_non), 'nb', pre_nb, 'dont_sa_ki_ni', jsonb_build_object('total', skn_total, 'nb', skn_nb)),
    'comptoir', jsonb_build_object('par_mode', jsonb_build_object('wallet',cpt_wallet,'especes',cpt_especes,'cb_sumup',cpt_cbsumup,'jeton',cpt_jeton), 'jetons_qty', cpt_jetons_qty, 'nb', cpt_nb, 'nb_annulations', cpt_annul),
    'articles', articles,
    'wallet', jsonb_build_object('consomme', w_consomme, 'recharge', jsonb_build_object('stripe',w_stripe,'especes',w_especes,'cb_sumup',w_cbsumup), 'dette_totale', w_dette),
    'totaux', jsonb_build_object(
      'ttc_par_mode', jsonb_build_object('stripe', pre_stripe, 'wallet', pre_wallet + cpt_wallet, 'especes', pre_especes + cpt_especes, 'cb_sumup', pre_cbsumup + cpt_cbsumup, 'non_encaisse', pre_non, 'jeton', cpt_jeton),
      'ttc', pre_stripe + pre_wallet + pre_especes + pre_cbsumup + pre_non + cpt_wallet + cpt_especes + cpt_cbsumup,
      'especes_attendues', pre_especes + cpt_especes + w_especes)
  );
end $function$;
