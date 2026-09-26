-- PS-06a §5 — anti-doublon de la notification « nouvelle commande ».
-- Un seul e-mail par commande : notifyNewOrder pose notified_at et ne renvoie jamais deux fois.
alter table public.orders
  add column if not exists notified_at timestamptz;

comment on column public.orders.notified_at is
  'PS-06a : horodatage de l''e-mail « nouvelle commande » (Resend). NULL = pas encore notifiée.';
