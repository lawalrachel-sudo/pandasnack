-- PS-08a-b — Caisse du jour : clôtures (Z), rapprochement espèces, analytique.
-- L'appli n'encaisse rien, elle consolide. Journal en ajout seul. is_test exclu partout.

create table if not exists public.caisse_clotures (
  id uuid primary key default gen_random_uuid(),
  period_type text not null check (period_type in ('jour','mois','annee')),
  period_start date not null,
  period_end date not null,
  generated_at timestamptz not null default now(),
  data jsonb not null,
  cash_expected_cents integer not null default 0,
  cash_counted_cents integer,
  cash_diff_cents integer,
  cash_note text,
  cash_counted_at timestamptz,
  csv_path text,
  unique (period_type, period_start)
);
alter table public.caisse_clotures enable row level security;

-- Bucket Storage privé pour les CSV de clôture.
insert into storage.buckets (id, name, public) values ('clotures','clotures', false) on conflict (id) do nothing;

-- Trigger : seul le rapprochement espèces + csv_path (métadonnée) peuvent changer ; jamais
-- data / période / cash_expected / generated_at ; jamais DELETE.
create or replace function public.caisse_clotures_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'caisse_clotures : suppression interdite'; end if;
  if new.data is distinct from old.data
     or new.period_type is distinct from old.period_type
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.cash_expected_cents is distinct from old.cash_expected_cents
     or new.generated_at is distinct from old.generated_at then
    raise exception 'caisse_clotures : seules les colonnes de rapprochement especes et csv_path sont modifiables';
  end if;
  return new;
end $$;

drop trigger if exists trg_caisse_clotures_guard on public.caisse_clotures;
create trigger trg_caisse_clotures_guard
  before update or delete on public.caisse_clotures
  for each row execute function public.caisse_clotures_guard();

-- caisse_z : Z d'une période (pure lecture). Voir la structure `data` dans src/lib/caisse.ts.
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
    where service_date between p_start and p_end and is_test = false
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
  where coalesce(ac.is_test,false)=false and wt.created_at::date between p_start and p_end;

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

create or replace function public.caisse_close(p_type text, p_start date)
returns jsonb language plpgsql security definer set search_path to 'public','pg_temp' as $$
declare
  v_end date; v_data jsonb; v_existing public.caisse_clotures; v_row public.caisse_clotures; v_cash int;
begin
  if p_type not in ('jour','mois','annee') then raise exception 'TYPE_INVALIDE'; end if;
  v_end := case p_type
    when 'jour' then p_start
    when 'mois' then (date_trunc('month', p_start) + interval '1 month - 1 day')::date
    else (date_trunc('year', p_start) + interval '1 year - 1 day')::date end;
  select * into v_existing from public.caisse_clotures where period_type=p_type and period_start=p_start;
  if found then return to_jsonb(v_existing); end if;
  v_data := public.caisse_z(p_start, v_end);
  v_cash := coalesce((v_data->'totaux'->>'especes_attendues')::int, 0);
  insert into public.caisse_clotures (period_type, period_start, period_end, data, cash_expected_cents)
    values (p_type, p_start, v_end, v_data, v_cash)
    on conflict (period_type, period_start) do nothing
    returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.caisse_clotures where period_type=p_type and period_start=p_start;
  end if;
  return to_jsonb(v_row);
end $$;
