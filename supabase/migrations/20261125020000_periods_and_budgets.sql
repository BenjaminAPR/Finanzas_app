-- Períodos con inicio y fin, y presupuestos por categoría dentro de cada uno.
create table public.periods (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.period_budgets (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (period_id, budget_id)
);

create index period_budgets_period_idx on public.period_budgets (period_id);
create index period_budgets_budget_idx on public.period_budgets (budget_id);

alter table public.periods enable row level security;
alter table public.period_budgets enable row level security;

create policy "Household members full access" on public.periods for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));
create policy "Household members full access" on public.period_budgets for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));

revoke all on public.periods, public.period_budgets from anon;
