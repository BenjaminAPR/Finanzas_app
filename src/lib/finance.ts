// Única fuente de verdad para saldos, ciclos y límites. Sin dependencias, para poder probarla.

export type Transaction = {
  id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  description: string;
  date: string | null;
  created_at: string;
  account_id: string | null;
  destination_account_id: string | null;
  budget_id: string | null;
  user_id: string;
};
export type Account = { id: string; name: string; type: string; user_id: string; created_at: string };
export type Budget = { id: string; name: string; amount: number; account_id: string | null; user_id: string };

export const CLOSE_MARKER = '🔄 Cierre de Mes';
const ROLLOVER_MARKER = '🔄 Rollover';
const OPENING_BALANCE = '[AHORRO] Saldo Inicial';
export const SAVINGS_TYPE = 'Cuenta de Ahorro';
export const CARD_TYPE = 'Tarjeta de Crédito';

const isMarker = (t: Transaction) => t.description === CLOSE_MARKER || t.description === ROLLOVER_MARKER;
const dayOf = (t: Transaction) => (t.date || t.created_at).slice(0, 10);

/** Orden cronológico por fecha del movimiento; dentro del día, por momento de registro. */
export function compareTx(a: Transaction, b: Transaction): number {
  const byDay = dayOf(a).localeCompare(dayOf(b));
  return byDay !== 0 ? byDay : Date.parse(a.created_at) - Date.parse(b.created_at);
}

export function summarize(accounts: Account[], budgets: Budget[], transactions: Transaction[]) {
  const chronological = [...transactions].sort(compareTx);
  const lastClose = chronological.filter(t => t.description === CLOSE_MARKER).at(-1) ?? null;
  const visible = chronological.filter(t => !isMarker(t)).reverse();

  const balances = new Map<string, number>(accounts.map(a => [a.id, 0]));
  const add = (id: string | null, delta: number) => {
    if (id && balances.has(id)) balances.set(id, balances.get(id)! + delta);
  };
  const spentByBudget = new Map<string, number>();
  let cycleIncome = 0;
  let cycleExpense = 0;

  for (const t of visible) {
    const amount = Number(t.amount);
    if (t.type === 'income') add(t.account_id, amount);
    if (t.type === 'expense') add(t.account_id, -amount);
    if (t.type === 'transfer') {
      add(t.account_id, -amount);
      add(t.destination_account_id, amount);
    }
    if (lastClose && compareTx(t, lastClose) <= 0) continue;
    if (t.type === 'income' && t.description !== OPENING_BALANCE) cycleIncome += amount;
    if (t.type === 'expense') {
      cycleExpense += amount;
      if (t.budget_id) spentByBudget.set(t.budget_id, (spentByBudget.get(t.budget_id) ?? 0) + amount);
    }
  }

  const accountsWithBalance = accounts.map(a => ({ ...a, balance: balances.get(a.id) ?? 0 }));
  let liquidity = 0;
  let savings = 0;
  let cardDebt = 0;
  for (const a of accountsWithBalance) {
    if (a.type === CARD_TYPE) cardDebt += Math.max(0, -a.balance); // un saldo a favor no es deuda
    else if (a.type === SAVINGS_TYPE) savings += a.balance;
    else liquidity += a.balance;
  }

  return {
    accounts: accountsWithBalance,
    budgets: budgets.map(b => ({ ...b, amount: Number(b.amount), spent: spentByBudget.get(b.id) ?? 0 })),
    visible,
    lastClose,
    liquidity,
    savings,
    cardDebt,
    cycleIncome,
    cycleExpense,
  };
}

export type Cycle = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  Ingresos: number;
  Gastos: number;
  Neto: number;
};

export function buildCycles(transactions: Transaction[], today: string): Cycle[] {
  const sorted = [...transactions].sort(compareTx);
  const cycles: Cycle[] = [];
  let income = 0;
  let expense = 0;
  let start = sorted.length ? dayOf(sorted[0]) : today;

  const push = (id: string, name: string, end: string) =>
    cycles.push({ id, name, startDate: start, endDate: end, Ingresos: income, Gastos: expense, Neto: income - expense });

  for (const t of sorted) {
    if (t.description === CLOSE_MARKER) {
      push(`cycle-${cycles.length + 1}`, `Ciclo ${cycles.length + 1}`, dayOf(t));
      income = 0;
      expense = 0;
      start = dayOf(t);
    } else if (!isMarker(t)) {
      if (t.type === 'income' && t.description !== OPENING_BALANCE) income += Number(t.amount);
      if (t.type === 'expense') expense += Number(t.amount);
    }
  }
  push('cycle-current', 'Ciclo Actual', today);
  return cycles;
}

/** Divide en cuotas de pesos enteros; la última absorbe la diferencia para cuadrar el total. */
export function splitInstallments(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? total - base * (count - 1) : base));
}
