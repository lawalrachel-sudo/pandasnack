-- PS-06b — Vue « Service du jour »
--
-- 1. orders.payment_mode : mode d'encaissement au comptoir (espèces / CB SumUp),
--    saisi au moment de « Marquer encaissé ». Alimente la caisse de PS-08.
--    NULL tant que non encaissé ou payé en ligne (wallet/CB Stripe).
-- 2. accounts.is_test : comptes de test exclus de la production et des compteurs
--    (affichés dans une section TEST repliée). Posé sur les deux comptes internes.

alter table public.orders
  add column if not exists payment_mode text;

comment on column public.orders.payment_mode is
  'Mode d''encaissement comptoir (especes | cb_sumup) saisi au mark-paid on_site. NULL sinon.';

alter table public.accounts
  add column if not exists is_test boolean not null default false;

comment on column public.accounts.is_test is
  'Compte de test interne : exclu de la production et des compteurs admin, affiché en section TEST.';

update public.accounts
   set is_test = true
 where lower(email) in ('lawalrachel@gmail.com', 'secretariat@pandattitude.com');
