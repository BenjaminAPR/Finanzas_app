-- Agrega planificación del hogar. Solo añade columnas, tablas y funciones:
-- no modifica ni borra movimientos, y la versión anterior de la app sigue funcionando.

alter table public.accounts
  add column institution text,
  add column owner_label text,
  add column asset_kind text not null default 'cash'
    check (asset_kind in ('cash', 'deposit', 'investment', 'card')),
  add column statement_ref text,
  add column anchor_balance numeric,
  add column anchor_date date,
  add column anchor_set_at timestamptz,
  add column maturity_date date,
  add column archived boolean not null default false;

update public.accounts set asset_kind = 'card' where type = 'Tarjeta de Crédito';
update public.accounts set asset_kind = 'deposit' where type = 'Cuenta de Ahorro';
create unique index accounts_statement_ref_key on public.accounts (statement_ref);

create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric not null check (amount >= 0),
  day_of_month integer not null check (day_of_month between 1 and 31),
  budget_id uuid references public.budgets(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  owner_label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column source text not null default 'manual' check (source in ('manual', 'import')),
  add column import_hash text,
  add column spender text,
  add column recurring_id uuid references public.recurring_items(id) on delete set null;

create unique index transactions_import_hash_key on public.transactions (import_hash);
create index transactions_date_idx on public.transactions (date desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_destination_idx on public.transactions (destination_account_id);
create index transactions_budget_idx on public.transactions (budget_id);
create index installments_debt_idx on public.installments (debt_id);
create index installments_transaction_idx on public.installments (transaction_id);

alter table public.debts
  add column kind text not null default 'installments'
    check (kind in ('installments', 'family', 'loan')),
  add column creditor text,
  add column account_id uuid references public.accounts(id) on delete set null,
  add column monthly_rate numeric,
  add column cae numeric;

create index debts_account_idx on public.debts (account_id);

create table public.card_statements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  period_end date not null,
  due_date date not null,
  billed_amount numeric not null,
  minimum_amount numeric not null,
  prepay_amount numeric,
  monthly_rate numeric,
  cae numeric,
  paid_amount numeric not null default 0,
  paid_at date,
  created_at timestamptz not null default now(),
  unique (account_id, due_date)
);

create table public.category_rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null unique,
  budget_id uuid references public.budgets(id) on delete cascade,
  treat_as text not null default 'expense' check (treat_as in ('expense', 'internal', 'ignore')),
  created_at timestamptz not null default now()
);

create table public.household_settings (
  id boolean primary key default true check (id),
  cycle_start_day integer not null default 23 check (cycle_start_day between 1 and 28),
  own_names text[] not null default '{}',
  extra_debt_payment numeric not null default 0 check (extra_debt_payment >= 0),
  updated_at timestamptz not null default now()
);

insert into public.household_settings (id) values (true);

alter table public.recurring_items enable row level security;
alter table public.card_statements enable row level security;
alter table public.category_rules enable row level security;
alter table public.household_settings enable row level security;

create policy "Household members full access" on public.recurring_items for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));
create policy "Household members full access" on public.card_statements for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));
create policy "Household members full access" on public.category_rules for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));
create policy "Household members full access" on public.household_settings for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));

revoke all on public.recurring_items, public.card_statements, public.category_rules, public.household_settings from anon;

-- Registra el pago de una cuota en una sola operación: si algo falla, no queda nada a medias.
create function public.pay_installment(
  p_installment uuid,
  p_account uuid,
  p_amount numeric,
  p_date date
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_installment public.installments%rowtype;
  v_debt public.debts%rowtype;
  v_last uuid;
  v_tx uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  select * into v_installment from public.installments where id = p_installment for update;
  if not found then raise exception 'Cuota no encontrada'; end if;
  if v_installment.status = 'paid' then raise exception 'La cuota ya está pagada'; end if;

  select * into v_debt from public.debts where id = v_installment.debt_id;

  if p_account is not null then
    insert into public.transactions (type, amount, description, date, account_id, user_id)
    values ('expense', p_amount,
            'Pago cuota ' || v_installment.installment_number || ' - ' || v_debt.name,
            p_date, p_account, (select auth.uid()))
    returning id into v_tx;
  end if;

  update public.installments
     set status = 'paid', paid_date = p_date, transaction_id = v_tx, amount = p_amount
   where id = p_installment;

  if p_amount <> v_installment.amount then
    select id into v_last
      from public.installments
     where debt_id = v_installment.debt_id and status = 'pending'
     order by installment_number desc
     limit 1
     for update;
    if v_last is not null then
      update public.installments
         set amount = greatest(amount - (p_amount - v_installment.amount), 0)
       where id = v_last;
    end if;
  end if;

  return v_tx;
end;
$$;

-- Registra el pago de una tarjeta como traspaso; un pago total marca también sus cuotas del período.
create function public.pay_card_statement(
  p_statement uuid,
  p_from_account uuid,
  p_amount numeric,
  p_date date
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_statement public.card_statements%rowtype;
  v_card_name text;
  v_tx uuid;
  v_total numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;

  select * into v_statement from public.card_statements where id = p_statement for update;
  if not found then raise exception 'Estado de cuenta no encontrado'; end if;

  select name into v_card_name from public.accounts where id = v_statement.account_id;

  insert into public.transactions (type, amount, description, date, account_id, destination_account_id, user_id)
  values ('transfer', p_amount, 'Pago ' || v_card_name, p_date, p_from_account,
          v_statement.account_id, (select auth.uid()))
  returning id into v_tx;

  v_total := v_statement.paid_amount + p_amount;

  update public.card_statements
     set paid_amount = v_total,
         paid_at = case when v_total >= billed_amount then p_date else paid_at end
   where id = p_statement;

  if v_total >= v_statement.billed_amount then
    update public.installments i
       set status = 'paid', paid_date = p_date
      from public.debts d
     where d.id = i.debt_id
       and d.account_id = v_statement.account_id
       and i.status = 'pending'
       and i.due_date <= v_statement.due_date;
  end if;

  return v_tx;
end;
$$;

revoke all on function public.pay_installment(uuid, uuid, numeric, date) from public, anon;
revoke all on function public.pay_card_statement(uuid, uuid, numeric, date) from public, anon;
grant execute on function public.pay_installment(uuid, uuid, numeric, date) to authenticated;
grant execute on function public.pay_card_statement(uuid, uuid, numeric, date) to authenticated;
