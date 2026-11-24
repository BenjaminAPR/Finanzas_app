-- Antes, cualquier usuario autenticado podía leer y modificar todas las tablas.
-- Ahora solo acceden quienes estén en household_members.
-- Aborta si existe más de un usuario, para no autorizar a alguien desconocido.

do $$
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Se esperaba exactamente 1 usuario. Revisar auth.users antes de migrar.';
  end if;
end $$;

create table public.household_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.household_members enable row level security;
revoke all on public.household_members from anon, authenticated;
grant select on public.household_members to authenticated;

create policy "Members can see their own membership"
  on public.household_members for select to authenticated
  using (user_id = (select auth.uid()));

insert into public.household_members (user_id)
select id from auth.users;

create function public.is_household_member()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_household_member() from public, anon;
grant execute on function public.is_household_member() to authenticated;

drop policy "Allow authenticated users full access to accounts" on public.accounts;
drop policy "Allow authenticated users full access to budgets" on public.budgets;
drop policy "Allow authenticated users full access to debts" on public.debts;
drop policy "Allow authenticated users full access to installments" on public.installments;
drop policy "Allow authenticated users full access to profiles" on public.profiles;
drop policy "Allow authenticated users full access to transactions" on public.transactions;

create policy "Household members full access" on public.accounts for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));
create policy "Household members full access" on public.budgets for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));
create policy "Household members full access" on public.debts for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));
create policy "Household members full access" on public.installments for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));
create policy "Household members full access" on public.profiles for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));
create policy "Household members full access" on public.transactions for all to authenticated
  using ((select public.is_household_member())) with check ((select public.is_household_member()));

-- El trigger de registro sigue funcionando, pero ya no se puede invocar por la API.
alter function public.handle_new_user() set search_path = '';
revoke execute on function public.handle_new_user() from public, anon, authenticated;
