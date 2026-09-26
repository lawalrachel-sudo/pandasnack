-- PS-06a §3 — idempotence du crédit manuel wallet.
-- L'admin envoie un Idempotency-Key par saisie ; un double clic réutilise la même clé,
-- l'insert est rejeté (unique_violation) et le wallet n'est crédité qu'une fois.
alter table public.wallet_transactions
  add column if not exists idempotency_key text;

create unique index if not exists wallet_transactions_idempotency_key_uidx
  on public.wallet_transactions (idempotency_key)
  where idempotency_key is not null;

comment on column public.wallet_transactions.idempotency_key is
  'PS-06a : jeton anti-doublon des crédits manuels admin. NULL pour les autres transactions.';
