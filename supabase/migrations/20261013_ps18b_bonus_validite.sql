-- PS-18b — Panda Bonus : date de validité (défaut fin d'année scolaire 30/06/2027).
-- La RPC d'application (20261012) ne consomme plus que les bonus 'emis' ET non échus.
alter table public.panda_bonus add column if not exists valide_jusqu_au date not null default '2027-06-30';

create or replace function public.panda_bonus_appliquer(p_order_id uuid)
returns table(applied int, new_total int)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid; v_account uuid; v_order record;
  v_bbt_units int; v_unit_price int; v_avail int; v_n int; v_discount int;
  v_today date := (now() at time zone 'America/Martinique')::date;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  select id into v_account from public.accounts where auth_user_id = v_user limit 1;
  if v_account is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = '28000'; end if;

  select * into v_order from public.orders where id = p_order_id and account_id = v_account for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = '02000'; end if;
  if v_order.status <> 'pending_payment'
     or exists (select 1 from public.panda_bonus where commande_id = p_order_id) then
    return query select 0, v_order.total_cents; return;
  end if;

  select coalesce(sum(oi.quantity), 0), coalesce(max(oi.unit_price_cents), 0)
    into v_bbt_units, v_unit_price
  from public.order_items oi join public.catalog_items ci on ci.id = oi.catalog_item_id
  where oi.order_id = p_order_id and ci.sku = 'DRINK-BBL' and oi.unit_price_cents > 0;
  if v_bbt_units = 0 or v_unit_price = 0 then return query select 0, v_order.total_cents; return; end if;

  select count(*) into v_avail
  from public.panda_bonus pb join public.profils p on p.id = pb.profil_id
  where p.account_id = v_account and pb.statut = 'emis' and pb.produit = 'bubble_tea'
    and pb.valide_jusqu_au >= v_today;

  v_n := least(v_bbt_units, v_avail);
  if v_n = 0 then return query select 0, v_order.total_cents; return; end if;
  v_discount := v_n * v_unit_price;

  update public.panda_bonus set statut = 'consomme', consomme_at = now(), commande_id = p_order_id
  where id in (
    select pb.id from public.panda_bonus pb join public.profils p on p.id = pb.profil_id
    where p.account_id = v_account and pb.statut = 'emis' and pb.produit = 'bubble_tea'
      and pb.valide_jusqu_au >= v_today
    order by pb.emis_at asc limit v_n
  );

  update public.orders
    set total_cents = greatest(total_cents - v_discount, 0),
        subtotal_cents = greatest(subtotal_cents - v_discount, 0)
  where id = p_order_id;

  return query select v_n, (select total_cents from public.orders where id = p_order_id);
end;
$function$;
revoke all on function public.panda_bonus_appliquer(uuid) from public;
grant execute on function public.panda_bonus_appliquer(uuid) to authenticated, service_role;
