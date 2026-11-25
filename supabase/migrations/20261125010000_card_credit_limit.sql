-- Cupo total de las tarjetas, para mostrar el cupo disponible.
alter table public.accounts add column credit_limit numeric check (credit_limit is null or credit_limit >= 0);
