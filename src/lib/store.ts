'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import type { Account, Budget, Transaction } from './finance';

export type Profile = { id: string; full_name: string | null };
export type HouseholdData = {
  userId: string;
  profiles: Profile[];
  accounts: Account[];
  budgets: Budget[];
  transactions: Transaction[];
};
type State = { data: HouseholdData | null; loading: boolean; error: string | null; fetchedAt: number };

const PAGE_SIZE = 1000; // Supabase corta cada respuesta en 1000 filas por defecto
const STALE_MS = 30_000;
const TX_COLUMNS = 'id,type,amount,description,date,created_at,account_id,destination_account_id,budget_id,user_id';
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
    const [accounts, budgets, profiles, transactions] = await Promise.all([
      supabase.from('accounts').select('id,name,type,user_id,created_at').order('created_at', { ascending: false }),
      supabase.from('budgets').select('id,name,amount,account_id,user_id').order('name'),
      supabase.from('profiles').select('id,full_name'),
      fetchAllTransactions(),
    ]);
    const failed = accounts.error || budgets.error || profiles.error;
    if (failed) throw failed;
    if (gen !== generation) return; // llegó una recarga más nueva o se cerró sesión
    setState({
      data: {
        userId: session.user.id,
        accounts: (accounts.data ?? []) as Account[],
        budgets: (budgets.data ?? []) as Budget[],
        profiles: (profiles.data ?? []) as Profile[],
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
