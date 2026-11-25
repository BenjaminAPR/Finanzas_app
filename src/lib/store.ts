'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type {
  Account,
  Budget,
  CardStatement,
  CategoryRule,
  Debt,
  Household,
  HouseholdSettings,
  Installment,
  Period,
  PeriodBudget,
  RecurringItem,
  Transaction,
} from './finance';

type State = { data: Household | null; loading: boolean; error: string | null; fetchedAt: number };

const PAGE_SIZE = 1000; // Supabase corta cada respuesta en 1000 filas por defecto
const STALE_MS = 30_000;
const TX_COLUMNS =
  'id,type,amount,description,date,created_at,account_id,destination_account_id,budget_id,user_id,source,import_hash,spender,recurring_id';
const DEFAULT_SETTINGS: HouseholdSettings = { cycle_start_day: 23, own_names: [], extra_debt_payment: 0 };
const INITIAL: State = { data: null, loading: true, error: null, fetchedAt: 0 };

let state = INITIAL;
let inflight: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach(l => l());
}

async function fetchAllTransactions(): Promise<Transaction[]> {
  const rows: Transaction[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('transactions')
      .select(TX_COLUMNS)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Transaction[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function load(gen: number) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      if (gen === generation) setState({ data: null, loading: false, error: null, fetchedAt: 0 });
      return;
    }
    const [accounts, budgets, profiles, debts, installments, statements, recurring, rules, settings, periods, periodBudgets, transactions] =
      await Promise.all([
        supabase.from('accounts').select('*').order('created_at'),
        supabase.from('budgets').select('id,name,amount,account_id,user_id').order('name'),
        supabase.from('profiles').select('id,full_name'),
        supabase.from('debts').select('*').order('created_at'),
        supabase.from('installments').select('*').order('installment_number'),
        supabase.from('card_statements').select('*').order('due_date', { ascending: false }),
        supabase.from('recurring_items').select('*').order('day_of_month'),
        supabase.from('category_rules').select('id,pattern,budget_id,treat_as'),
        supabase.from('household_settings').select('cycle_start_day,own_names,extra_debt_payment').maybeSingle(),
        supabase.from('periods').select('id,start_date,end_date').order('start_date'),
        supabase.from('period_budgets').select('id,period_id,budget_id,amount'),
        fetchAllTransactions(),
      ]);
    const failed =
      accounts.error || budgets.error || profiles.error || debts.error || installments.error ||
      statements.error || recurring.error || rules.error || settings.error || periods.error || periodBudgets.error;
    if (failed) throw failed;
    if (gen !== generation) return; // llegó una recarga más nueva o se cerró sesión
    setState({
      data: {
        userId: session.user.id,
        accounts: (accounts.data ?? []) as Account[],
        budgets: (budgets.data ?? []) as Budget[],
        profiles: profiles.data ?? [],
        debts: (debts.data ?? []) as Debt[],
        installments: (installments.data ?? []) as Installment[],
        statements: (statements.data ?? []) as CardStatement[],
        recurring: (recurring.data ?? []) as RecurringItem[],
        rules: (rules.data ?? []) as CategoryRule[],
        settings: (settings.data as HouseholdSettings | null) ?? DEFAULT_SETTINGS,
        periods: (periods.data ?? []) as Period[],
        periodBudgets: (periodBudgets.data ?? []) as PeriodBudget[],
        transactions,
      },
      loading: false,
      error: null,
      fetchedAt: Date.now(),
    });
  } catch (err) {
    console.error('Error cargando datos', err);
    if (gen === generation) setState({ loading: false, error: 'No se pudieron cargar los datos.' });
  }
}

/** Recarga desde el servidor. Tras guardar algo, descarta cualquier lectura anterior en curso. */
export function refreshData(): Promise<void> {
  const gen = ++generation;
  const run = load(gen).finally(() => {
    if (gen === generation) inflight = null;
  });
  inflight = run;
  return run;
}

/** Debe llamarse al cerrar sesión para no mostrar datos de la sesión anterior. */
export function clearData() {
  generation++;
  inflight = null;
  setState(INITIAL);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function useHouseholdData() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => INITIAL);

  useEffect(() => {
    if (!inflight && Date.now() - state.fetchedAt > STALE_MS) void refreshData();
  }, []);

  const refresh = useCallback(() => refreshData(), []);
  return { data: snapshot.data, loading: snapshot.loading && !snapshot.data, error: snapshot.error, refresh };
}
