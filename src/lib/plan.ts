import {
  dayOf,
  isAdjustment,
  isMarker,
  isOpeningBalance,
  normalize,
  wealthSummary,
  type CardStatement,
  type Debt,
  type Household,
  type Installment,
  type RecurringItem,
  type Transaction,
} from './finance.ts';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => {
  const date = new Date(y, m, d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const parts = (s: string) => s.split('-').map(Number);
const daysBetween = (a: string, b: string) => {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
};

export type Cycle = { start: string; end: string; daysLeft: number };

/** El ciclo va de un día de pago al siguiente y avanza solo: ya no hay que "reiniciarlo". */
export function cycleFor(today: string, startDay: number): Cycle {
  const [y, m, d] = parts(today);
  const month = m - 1;
  const startMonth = d >= startDay ? month : month - 1;
  const start = iso(y, startMonth, startDay);
  const end = iso(y, startMonth + 1, startDay - 1);
  return { start, end, daysLeft: daysBetween(today, end) + 1 };
}

export function previousCycles(today: string, startDay: number, count: number): Cycle[] {
  const cycles: Cycle[] = [];
  let cursor = today;
  for (let i = 0; i < count; i++) {
    const cycle = cycleFor(cursor, startDay);
    cycles.unshift(cycle);
    const [y, m, d] = parts(cycle.start);
    cursor = iso(y, m - 1, d - 1);
  }
  return cycles;
}

function occurrence(item: RecurringItem, cycle: Cycle): string {
  const [sy, sm] = parts(cycle.start);
  const candidates = [0, 1].map(offset => {
    const year = sy + Math.floor((sm - 1 + offset) / 12);
    const month = (sm - 1 + offset) % 12;
    return iso(year, month, Math.min(item.day_of_month, lastDay(year, month)));
  });
  return candidates.find(c => c >= cycle.start && c <= cycle.end) ?? candidates[0];
}

function findRecurringPayment(item: RecurringItem, cycle: Cycle, transactions: Transaction[]) {
  const name = normalize(item.name);
  const type = item.kind === 'income' ? 'income' : 'expense';
  const expected = Number(item.amount);
  return transactions.filter(t => {
    if (t.type !== type || isMarker(t)) return false;
    const day = dayOf(t);
    if (day < cycle.start || day > cycle.end) return false;
    if (t.recurring_id) return t.recurring_id === item.id;
    const text = normalize(t.description ?? '');
    if (text.includes(name)) return true;
    // Las cartolas describen el sueldo de forma genérica ("Pago de sueldos").
    return item.kind === 'income' && name.includes('sueldo') && /sueldo|remuneracion/.test(text) &&
      Math.abs(Number(t.amount) - expected) <= expected * 0.25;
  });
}

const totalOf = (payments: Transaction[]) => payments.reduce((s, t) => s + Number(t.amount), 0);

export type UpcomingPayment = {
  key: string;
  kind: 'statement' | 'installment' | 'recurring';
  title: string;
  detail: string;
  date: string;
  amount: number;
  minimum?: number;
  overdue: boolean;
  daysUntil: number;
  /** Sin fecha ni monto exactos (gastos del mes, deudas con personas): no generan avisos de vencimiento. */
  flexible: boolean;
  statement?: CardStatement;
  installment?: Installment;
  recurring?: RecurringItem;
};

export function buildPlan(data: Household, today: string) {
  const cycle = cycleFor(today, data.settings.cycle_start_day);
  const transactions = data.transactions;
  const debtById = new Map(data.debts.map(d => [d.id, d]));
  const accountById = new Map(data.accounts.map(a => [a.id, a]));
  const linkedTx = new Set(data.installments.map(i => i.transaction_id).filter(Boolean));
  const active = data.recurring.filter(r => r.active);
  const recurringPayments = new Set<string>();

  const income = active.filter(r => r.kind === 'income').map(item => {
    const payments = findRecurringPayment(item, cycle, transactions);
    payments.forEach(p => recurringPayments.add(p.id));
    return { item, date: occurrence(item, cycle), received: payments.length > 0, amount: payments.length ? totalOf(payments) : Number(item.amount) };
  });
  const fixed = active.filter(r => r.kind === 'expense').map(item => {
    const payments = findRecurringPayment(item, cycle, transactions);
    payments.forEach(p => recurringPayments.add(p.id));
    return { item, date: occurrence(item, cycle), paid: payments.length > 0, amount: payments.length ? totalOf(payments) : Number(item.amount) };
  });

  const cycleInstallments = data.installments.filter(i => i.due_date >= cycle.start && i.due_date <= cycle.end);
  const incomeTotal = income.reduce((s, i) => s + i.amount, 0);
  const incomePending = income.filter(i => !i.received).reduce((s, i) => s + i.amount, 0);
  const fixedTotal = fixed.reduce((s, f) => s + f.amount, 0);
  const installmentsTotal = cycleInstallments.reduce((s, i) => s + Number(i.amount), 0);
  const extraDebt = Number(data.settings.extra_debt_payment);
  const available = incomeTotal - fixedTotal - installmentsTotal - extraDebt;

  const spending = transactions.filter(t => {
    if (t.type !== 'expense' || isMarker(t) || isAdjustment(t)) return false;
    if (recurringPayments.has(t.id) || linkedTx.has(t.id)) return false;
    const day = dayOf(t);
    return day >= cycle.start && day <= cycle.end;
  });
  const spent = spending.reduce((s, t) => s + Number(t.amount), 0);
  const remaining = available - spent;

  const byCategory = new Map<string | null, number>();
  for (const t of spending) byCategory.set(t.budget_id, (byCategory.get(t.budget_id) ?? 0) + Number(t.amount));
  const categories = [...byCategory.entries()]
    .map(([id, total]) => {
      const budget = data.budgets.find(b => b.id === id);
      return { id, name: budget?.name ?? 'Sin categoría', total, limit: Number(budget?.amount ?? 0) };
    })
    .sort((a, b) => b.total - a.total);

  const horizon = iso(parts(today)[0], parts(today)[1] - 1, parts(today)[2] + 45);
  const upcoming: UpcomingPayment[] = [];

  // Un estado de cuenta nuevo reemplaza al anterior: lo impago ya viene incluido en él.
  const latestStatements = new Map<string, CardStatement>();
  for (const s of data.statements) {
    const current = latestStatements.get(s.account_id);
    if (!current || s.due_date > current.due_date) latestStatements.set(s.account_id, s);
  }

  for (const s of latestStatements.values()) {
    const owed = Number(s.billed_amount) - Number(s.paid_amount);
    if (s.paid_at || owed <= 0 || s.due_date > horizon) continue;
    upcoming.push({
      key: `statement-${s.id}`,
      kind: 'statement',
      flexible: false,
      title: accountById.get(s.account_id)?.name ?? 'Tarjeta',
      detail: 'Estado de cuenta',
      date: s.due_date,
      amount: owed,
      minimum: Math.max(0, Number(s.minimum_amount) - Number(s.paid_amount)),
      overdue: s.due_date < today,
      daysUntil: daysBetween(today, s.due_date),
      statement: s,
    });
  }

  for (const i of data.installments) {
    const debt = debtById.get(i.debt_id);
    if (i.status !== 'pending' || !debt || debt.account_id || i.due_date > horizon) continue;
    upcoming.push({
      key: `installment-${i.id}`,
      kind: 'installment',
      flexible: debt.kind === 'family',
      title: debt.creditor ? `${debt.name} (${debt.creditor})` : debt.name,
      detail: `Cuota ${i.installment_number}`,
      date: i.due_date,
      amount: Number(i.amount),
      overdue: i.due_date < today,
      daysUntil: daysBetween(today, i.due_date),
      installment: i,
    });
  }

  for (const f of fixed) {
    if (f.paid || f.date > horizon) continue;
    upcoming.push({
      key: `recurring-${f.item.id}`,
      kind: 'recurring',
      flexible: true,
      title: f.item.name,
      detail: 'Gasto del mes',
      date: f.date,
      amount: f.amount,
      overdue: f.date < today,
      daysUntil: daysBetween(today, f.date),
      recurring: f.item,
    });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);

  const wealth = wealthSummary(data.accounts, transactions);
  const dueInCycle = upcoming.filter(u => u.date <= cycle.end).reduce((s, u) => s + u.amount, 0);
  const cashAfterPayments = wealth.cash + incomePending - dueInCycle;

  // Lo libre parte de la plata real: lo que hay hoy más lo que falta recibir, menos todo
  // lo que ya está comprometido hasta fin de ciclo, incluidas las compras con tarjeta.
  const fixedPending = fixed.filter(f => !f.paid).reduce((s, f) => s + f.amount, 0);
  const debtsDue = data.installments
    .filter(i => i.status === 'pending' && i.due_date <= cycle.end && !debtById.get(i.debt_id)?.account_id)
    .reduce((s, i) => s + Number(i.amount), 0);
  const cardsSpent = wealth.items
    .filter(a => a.asset_kind === 'card')
    .reduce((sum, card) => {
      const laterPlans = data.installments
        .filter(i => i.status === 'pending' && i.due_date > cycle.end && debtById.get(i.debt_id)?.account_id === card.id)
        .reduce((s, i) => s + Number(i.amount), 0);
      return sum + Math.max(0, Math.max(0, -card.balance) - laterPlans);
    }, 0);
  const free = Math.round(wealth.cash + incomePending - fixedPending - debtsDue - cardsSpent - extraDebt);

  return {
    free,
    freeParts: { cash: wealth.cash, incomePending, fixedPending, debtsDue, cardsSpent, extraDebt },
    perDayFree: cycle.daysLeft > 0 ? Math.max(0, free) / cycle.daysLeft : 0,
    cycle,
    income,
    fixed,
    incomeTotal,
    incomePending,
    fixedTotal,
    installmentsTotal,
    extraDebt,
    available,
    spent,
    remaining,
    perDay: cycle.daysLeft > 0 ? Math.max(0, remaining) / cycle.daysLeft : 0,
    categories,
    upcoming,
    dueInCycle,
    cashAfterPayments,
    wealth,
  };
}

export type DebtItem = {
  debt: Debt;
  remaining: number;
  paid: number;
  total: number;
  monthly: number;
  pendingCount: number;
  totalCount: number;
  next: Installment | null;
  endDate: string | null;
  overdue: number;
};

export function debtItem(debt: Debt, installments: Installment[], today: string): DebtItem {
  const own = installments.filter(i => i.debt_id === debt.id).sort((a, b) => a.installment_number - b.installment_number);
  const pending = own.filter(i => i.status === 'pending');
  const paid = own.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
  const remaining = Math.round(pending.reduce((s, i) => s + Number(i.amount), 0));
  return {
    debt,
    remaining,
    paid,
    total: paid + remaining,
    monthly: Number(pending[0]?.amount ?? 0),
    pendingCount: pending.length,
    totalCount: own.length,
    next: pending[0] ?? null,
    endDate: pending.at(-1)?.due_date ?? null,
    overdue: pending.filter(i => i.due_date < today).length,
  };
}

export function debtOverview(data: Household, today: string) {
  const items = data.debts.map(d => debtItem(d, data.installments, today)).filter(i => i.totalCount > 0);
  const wealth = wealthSummary(data.accounts, data.transactions);
  const standalone = items.filter(i => !i.debt.account_id);
  const cards = wealth.items.filter(a => a.asset_kind === 'card').map(account => ({
    account,
    owed: Math.max(0, -account.balance),
    statement: data.statements
      .filter(s => s.account_id === account.id)
      .sort((a, b) => b.due_date.localeCompare(a.due_date))[0] ?? null,
    plans: items.filter(i => i.debt.account_id === account.id),
  }));
  const standaloneTotal = standalone.reduce((s, i) => s + i.remaining, 0);
  const total = standaloneTotal + wealth.cardDebt;
  const payable = items.filter(i => i.remaining > 0);
  return {
    total,
    standalone,
    cards,
    payable,
    monthlyInstallments: payable.reduce((s, i) => s + i.monthly, 0),
    netWorth: wealth.assets - total,
    wealth,
  };
}

export type PayoffOrder = 'smallest' | 'rate';

/**
 * Compara cuándo terminan las cuotas con un abono extra mensual. Es una aproximación:
 * no recalcula intereses, porque cada institución define su propio prepago.
 */
export function simulatePayoff(items: DebtItem[], extra: number, order: PayoffOrder) {
  const run = (monthlyExtra: number) => {
    const debts = items
      .filter(i => i.remaining > 0 && i.monthly > 0)
      .map(i => ({ balance: i.remaining, monthly: i.monthly, rate: Number(i.debt.monthly_rate ?? 0) }));
    let months = 0;
    while (debts.some(d => d.balance > 0) && months < 600) {
      months++;
      let pool = monthlyExtra;
      for (const d of debts) {
        if (d.balance <= 0) {
          if (monthlyExtra > 0) pool += d.monthly;
          continue;
        }
        const pay = Math.min(d.monthly, d.balance);
        d.balance -= pay;
        if (monthlyExtra > 0) pool += d.monthly - pay;
      }
      const targets = debts
        .filter(d => d.balance > 0)
        .sort((a, b) => (order === 'rate' ? b.rate - a.rate || a.balance - b.balance : a.balance - b.balance));
      for (const d of targets) {
        if (pool <= 0) break;
        const pay = Math.min(pool, d.balance);
        d.balance -= pay;
        pool -= pay;
      }
    }
    return months;
  };
  const baseline = run(0);
  const withExtra = extra > 0 ? run(extra) : baseline;
  return { baseline, withExtra, saved: baseline - withExtra };
}

export function cycleHistory(data: Household, today: string, count: number) {
  const linked = new Set(data.installments.map(i => i.transaction_id).filter(Boolean));
  return previousCycles(today, data.settings.cycle_start_day, count).map(cycle => {
    let income = 0;
    let expense = 0;
    for (const t of data.transactions) {
      if (isMarker(t) || isAdjustment(t) || isOpeningBalance(t)) continue;
      const day = dayOf(t);
      if (day < cycle.start || day > cycle.end) continue;
      if (t.type === 'income') income += Number(t.amount);
      if (t.type === 'expense' && !linked.has(t.id)) expense += Number(t.amount);
    }
    return { ...cycle, income, expense, net: income - expense };
  });
}
