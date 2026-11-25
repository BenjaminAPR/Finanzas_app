// Modelo y cálculos base del hogar. Sin dependencias, para poder probarlo.

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
  source?: 'manual' | 'import';
  import_hash?: string | null;
  spender?: string | null;
  recurring_id?: string | null;
};

export type AssetKind = 'cash' | 'deposit' | 'investment' | 'card';

export type Account = {
  id: string;
  name: string;
  type: string;
  user_id: string;
  created_at: string;
  institution?: string | null;
  owner_label?: string | null;
  asset_kind: AssetKind;
  statement_ref?: string | null;
  anchor_balance?: number | null;
  anchor_date?: string | null;
  anchor_set_at?: string | null;
  maturity_date?: string | null;
  credit_limit?: number | null;
  archived?: boolean;
};

export type Budget = { id: string; name: string; amount: number; account_id: string | null; user_id: string };

export type Debt = {
  id: string;
  name: string;
  total_amount: number;
  user_id: string;
  created_at: string;
  kind: 'installments' | 'family' | 'loan';
  creditor?: string | null;
  account_id?: string | null;
  monthly_rate?: number | null;
  cae?: number | null;
  match_text?: string | null;
};

export type Installment = {
  id: string;
  debt_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: 'pending' | 'paid';
  transaction_id: string | null;
};

export type CardStatement = {
  id: string;
  account_id: string;
  period_end: string;
  due_date: string;
  billed_amount: number;
  minimum_amount: number;
  prepay_amount: number | null;
  monthly_rate: number | null;
  cae: number | null;
  paid_amount: number;
  paid_at: string | null;
};

export type RecurringItem = {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  amount: number;
  day_of_month: number;
  budget_id: string | null;
  account_id: string | null;
  owner_label: string | null;
  active: boolean;
  match_text?: string | null;
};

export type CategoryRule = {
  id: string;
  pattern: string;
  budget_id: string | null;
  treat_as: 'expense' | 'internal' | 'ignore';
};

export type HouseholdSettings = {
  cycle_start_day: number;
  own_names: string[];
  extra_debt_payment: number;
};

export type Household = {
  userId: string;
  profiles: { id: string; full_name: string | null }[];
  accounts: Account[];
  budgets: Budget[];
  transactions: Transaction[];
  debts: Debt[];
  installments: Installment[];
  statements: CardStatement[];
  recurring: RecurringItem[];
  rules: CategoryRule[];
  settings: HouseholdSettings;
};

const CLOSE_MARKER = '🔄 Cierre de Mes';
const ROLLOVER_MARKER = '🔄 Rollover';
const OPENING_BALANCE = '[AHORRO] Saldo Inicial';
const ADJUSTMENT = /^cuadrar$/i;

export const isMarker = (t: Transaction) => t.description === CLOSE_MARKER || t.description === ROLLOVER_MARKER;
export const isAdjustment = (t: Transaction) => ADJUSTMENT.test((t.description ?? '').trim());
export const isOpeningBalance = (t: Transaction) => t.description === OPENING_BALANCE;
export const dayOf = (t: Transaction) => (t.date || t.created_at).slice(0, 10);

export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Orden cronológico por fecha del movimiento; dentro del día, por momento de registro. */
export function compareTx(a: Transaction, b: Transaction): number {
  const byDay = dayOf(a).localeCompare(dayOf(b));
  return byDay !== 0 ? byDay : Date.parse(a.created_at) - Date.parse(b.created_at);
}

export const visibleTransactions = (transactions: Transaction[]) =>
  transactions.filter(t => !isMarker(t)).sort((a, b) => compareTx(b, a));

/** Un saldo confirmado reemplaza todo lo anterior a su fecha, sin movimientos falsos de "cuadre". */
function countsAfterAnchor(t: Transaction, account: Account): boolean {
  if (!account.anchor_date) return true;
  const day = dayOf(t);
  if (day > account.anchor_date) return true;
  return (
    day === account.anchor_date &&
    t.source !== 'import' &&
    !!account.anchor_set_at &&
    Date.parse(t.created_at) > Date.parse(account.anchor_set_at)
  );
}

export function computeBalances(accounts: Account[], transactions: Transaction[]): Map<string, number> {
  const byId = new Map(accounts.map(a => [a.id, a]));
  const balances = new Map(accounts.map(a => [a.id, Number(a.anchor_balance ?? 0)]));
  const apply = (id: string | null, delta: number, t: Transaction) => {
    const account = id ? byId.get(id) : undefined;
    if (account && countsAfterAnchor(t, account)) balances.set(account.id, balances.get(account.id)! + delta);
  };
  for (const t of transactions) {
    if (isMarker(t)) continue;
    const amount = Number(t.amount);
    if (t.type === 'income') apply(t.account_id, amount, t);
    if (t.type === 'expense') apply(t.account_id, -amount, t);
    if (t.type === 'transfer') {
      apply(t.account_id, -amount, t);
      apply(t.destination_account_id, amount, t);
    }
  }
  return balances;
}

export type AccountWithBalance = Account & { balance: number };

export function wealthSummary(accounts: Account[], transactions: Transaction[]) {
  const balances = computeBalances(accounts, transactions);
  const items: AccountWithBalance[] = accounts
    .filter(a => !a.archived)
    .map(a => ({ ...a, balance: balances.get(a.id) ?? 0 }));
  const sum = (kind: AssetKind) => items.filter(a => a.asset_kind === kind).reduce((s, a) => s + a.balance, 0);
  const cash = sum('cash');
  const deposits = sum('deposit');
  const investments = sum('investment');
  const cardDebt = items.filter(a => a.asset_kind === 'card').reduce((s, a) => s + Math.max(0, -a.balance), 0);
  return { items, cash, deposits, investments, cardDebt, assets: cash + deposits + investments };
}

/** Divide en cuotas de pesos enteros; la última absorbe la diferencia para cuadrar el total. */
export function splitInstallments(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? total - base * (count - 1) : base));
}
