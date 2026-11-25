-- Texto opcional para reconocer pagos en las cartolas (por ejemplo, la plataforma del arriendo).
alter table public.recurring_items add column match_text text;
alter table public.debts add column match_text text;
