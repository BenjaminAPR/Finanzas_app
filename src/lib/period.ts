// Período con inicio y fin, presupuestos que bajan con cada gasto y proyección de la plata.
import { dayOf, isAdjustment, isMarker, normalize, wealthSummary, type Household, type Period, type Transaction } from './finance.ts';

const pad = (n: number) => String(n).padStart(2, '0');
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);

/** El período que contiene hoy; si no hay, el más reciente. */
export function currentPeriod(periods: Period[], today: string): Period | null {
  const sorted = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  return sorted.find(p => p.start_date <= today && p.end_date >= today) ?? sorted.at(-1) ?? null;
}

/** Propuesta para el período siguiente: parte el día después del último y dura lo mismo. */
export function nextPeriodDates(periods: Period[], today: string) {
  const last = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date)).at(-1);
  if (!last) return { start: today, end: addDays(today, 29) };
  const start = addDays(last.end_date, 1);
  return { start, end: addDays(start, daysBetween(last.start_date, last.end_date)) };
}

const spendingIn = (t: Transaction, start: string, end: string) =>
  t.type === 'expense' && !isMarker(t) && !isAdjustment(t) && dayOf(t) >= start && dayOf(t) <= end;

export type BudgetLine = {
  id: string;
  budgetId: string;
  name: string;
  amount: number;
  spent: number;
  remaining: number;
  over: number;
};

export type ProjectionPoint = { date: string; balance: number; events: { title: string; amount: number }[] };

export function periodView(data: Household, today: string) {
  const period = currentPeriod(data.periods, today);
  if (!period) return null;
  const { start, end } = { start: period.start_date, end: period.end_date };
  const from = today < start ? start : today;
  const daysLeft = today > end ? 0 : daysBetween(from, end) + 1;
  const totalDays = daysBetween(start, end) + 1;

  // Lo pagado con cuotas ya se cuenta en las deudas; no se vuelve a sumar como gasto.
  const linked = new Set(data.installments.map(i => i.transaction_id).filter(Boolean));
  const spending = data.transactions.filter(t => spendingIn(t, start, end) && !linked.has(t.id));
  const spentBy = new Map<string | null, number>();
  for (const t of spending) spentBy.set(t.budget_id, (spentBy.get(t.budget_id) ?? 0) + Number(t.amount));

  const budgets: BudgetLine[] = data.periodBudgets
    .filter(b => b.period_id === period.id)
    .map(b => {
      const amount = Number(b.amount);
      const spent = spentBy.get(b.budget_id) ?? 0;
      return {
        id: b.id,
        budgetId: b.budget_id,
        name: data.budgets.find(c => c.id === b.budget_id)?.name ?? 'Categoría',
        amount,
        spent,
        remaining: Math.max(0, amount - spent),
        over: Math.max(0, spent - amount),
      };
    })
    .sort((a, b) => b.amount - a.amount);
  const budgeted = new Set(budgets.map(b => b.budgetId));
  const unbudgeted = spending.filter(t => !t.budget_id || !budgeted.has(t.budget_id));
  const unbudgetedSpent = unbudgeted.reduce((s, t) => s + Number(t.amount), 0);
  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const remainingBudgets = budgets.reduce((s, b) => s + b.remaining, 0);

  // Sueldos y otros ingresos mensuales que todavía no llegan dentro del período.
  const incomeEvents: { date: string; title: string; amount: number }[] = [];
  for (const item of data.recurring.filter(r => r.active && r.kind === 'income')) {
    const name = normalize(item.name);
    const expected = Number(item.amount);
    const received = data.transactions.filter(t =>
      t.type === 'income' && dayOf(t) >= start && dayOf(t) <= end &&
      (t.recurring_id === item.id || normalize(t.description ?? '').includes(name) ||
        (name.includes('sueldo') && /sueldo|remuneracion/.test(normalize(t.description ?? '')) &&
          Math.abs(Number(t.amount) - expected) <= expected * 0.25)),
    ).length;
    const occurrences: string[] = [];
    for (let d = parse(start); toISO(d) <= end; d.setMonth(d.getMonth() + 1, 1)) {
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const day = toISO(new Date(d.getFullYear(), d.getMonth(), Math.min(item.day_of_month, last)));
      if (day >= start && day <= end) occurrences.push(day);
    }
    occurrences.slice(received).forEach(day => incomeEvents.push({ date: day < from ? from : day, title: item.name, amount: expected }));
  }
  const incomePending = incomeEvents.reduce((s, e) => s + e.amount, 0);

  // Cuotas de créditos y personas que vencen dentro del período.
  const debtById = new Map(data.debts.map(d => [d.id, d]));
  const dueInstallments = data.installments.filter(i =>
    i.status === 'pending' && i.due_date <= end && !debtById.get(i.debt_id)?.account_id,
  );
  const debtsDue = dueInstallments.reduce((s, i) => s + Number(i.amount), 0);

  // Tarjetas: lo ya gastado se paga sí o sí; las cuotas que vencen después del período quedan para después.
  const wealth = wealthSummary(data.accounts, data.transactions);
  const statementEvents: { date: string; title: string; amount: number }[] = [];
  let cardsSpent = 0;
  for (const card of wealth.items.filter(a => a.asset_kind === 'card')) {
    const later = data.installments
      .filter(i => i.status === 'pending' && i.due_date > end && debtById.get(i.debt_id)?.account_id === card.id)
      .reduce((s, i) => s + Number(i.amount), 0);
    cardsSpent += Math.max(0, Math.max(0, -card.balance) - later);
    const statement = data.statements
      .filter(s => s.account_id === card.id)
      .sort((a, b) => b.due_date.localeCompare(a.due_date))[0];
    const owed = statement ? Number(statement.billed_amount) - Number(statement.paid_amount) : 0;
    if (statement && !statement.paid_at && owed > 0 && statement.due_date <= end) {
      statementEvents.push({ date: statement.due_date < from ? from : statement.due_date, title: card.name, amount: owed });
    }
  }

  const cash = wealth.cash;
  const free = Math.round(cash + incomePending - remainingBudgets - debtsDue - cardsSpent);

  // Proyección: sueldos y vencimientos en su fecha; lo que queda de presupuesto se gasta parejo.
  const events = new Map<string, { title: string; amount: number }[]>();
  const add = (date: string, title: string, amount: number) => {
    if (!events.has(date)) events.set(date, []);
    events.get(date)!.push({ title, amount });
  };
  incomeEvents.forEach(e => add(e.date, e.title, e.amount));
  statementEvents.forEach(e => add(e.date, e.title, -e.amount));
  dueInstallments.forEach(i => {
    const debt = debtById.get(i.debt_id)!;
    add(i.due_date < from ? from : i.due_date, debt.name, -Number(i.amount));
  });
  const dailyBurn = daysLeft > 0 ? remainingBudgets / daysLeft : 0;
  const points: ProjectionPoint[] = [];
  let balance = cash;
  for (let day = from; day <= end; day = addDays(day, 1)) {
    const list = events.get(day) ?? [];
    balance += list.reduce((s, e) => s + e.amount, 0) - dailyBurn;
    points.push({ date: day, balance: Math.round(balance), events: list });
  }
  const low = points.length ? points.reduce((m, p) => (p.balance < m.balance ? p : m), points[0]) : null;

  return {
    period,
    totalDays,
    daysLeft,
    budgets,
    unbudgetedSpent,
    unbudgetedCount: unbudgeted.length,
    totalBudget,
    totalSpent,
    remainingBudgets,
    cash,
    incomePending,
    debtsDue,
    cardsSpent,
    free,
    perDay: daysLeft > 0 ? Math.max(0, free) / daysLeft : 0,
    dailyBurn,
    points,
    low,
  };
}
