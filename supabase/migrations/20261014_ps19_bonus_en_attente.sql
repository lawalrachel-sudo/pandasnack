-- PS-19 — Panda Bonus émis AVANT l'existence du compte Snack : par email, rattaché à la 1re
-- connexion. profil_id/famille_id nullables + email_famille + prenom_enfant. Lien compte↔bonus =
-- (profil du compte) OU (email_famille = email normalisé du compte).
alter table public.panda_bonus alter column profil_id drop not null;
alter table public.panda_bonus add column if not exists email_famille text;  -- normalisé lower/trim
alter table public.panda_bonus add column if not exists prenom_enfant text;   -- affichage avant rattachement
alter table public.panda_bonus drop constraint if exists panda_bonus_cible_chk;
alter table public.panda_bonus add constraint panda_bonus_cible_chk
  check (profil_id is not null or email_famille is not null);
create index if not exists panda_bonus_email_idx on public.panda_bonus(email_famille);

-- RLS : la famille lit ses bonus par profil OU par email (bonus en attente avant rattachement).
drop policy if exists panda_bonus_read_family on public.panda_bonus;
create policy panda_bonus_read_family on public.panda_bonus
for select to authenticated
using (exists (
  select 1 from public.accounts a
  where a.auth_user_id = auth.uid()
    and (
      panda_bonus.email_famille = lower(btrim(a.email))
      or exists (select 1 from public.profils p where p.id = panda_bonus.profil_id and p.account_id = a.id)
    )
));

-- RPC d'application : bonus du compte via profil OU email, emis, non échu, bubble_tea.
create or replace function public.panda_bonus_appliquer(p_order_id uuid)
returns table(applied int, new_total int)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid; v_account uuid; v_email text; v_order record;
  v_bbt_units int; v_unit_price int; v_avail int; v_n int; v_discount int;
  v_today date := (now() at time zone 'America/Martinique')::date;
begin
  v_user := auth.uid();
  if v_user is null then raise exception 'NOT_AUTHENTICATED' using errcode = '28000'; end if;
  select id, lower(btrim(email)) into v_account, v_email from public.accounts where auth_user_id = v_user limit 1;
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

  select count(*) into v_avail from public.panda_bonus pb
  where pb.statut = 'emis' and pb.produit = 'bubble_tea' and pb.valide_jusqu_au >= v_today
    and (
      pb.email_famille = v_email
      or exists (select 1 from public.profils p where p.id = pb.profil_id and p.account_id = v_account)
    );

  v_n := least(v_bbt_units, v_avail);
  if v_n = 0 then return query select 0, v_order.total_cents; return; end if;
  v_discount := v_n * v_unit_price;

  update public.panda_bonus set statut = 'consomme', consomme_at = now(), commande_id = p_order_id
  where id in (
    select pb.id from public.panda_bonus pb
    where pb.statut = 'emis' and pb.produit = 'bubble_tea' and pb.valide_jusqu_au >= v_today
      and (
        pb.email_famille = v_email
        or exists (select 1 from public.profils p where p.id = pb.profil_id and p.account_id = v_account)
      )
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
