// Vistas hacia adelante: saldo día a día, cuotas por mes y avisos. Sin dependencias de React.
import { dayOf, isAdjustment, isMarker, type Household } from './finance.ts';
import { buildPlan, cycleHistory } from './plan.ts';
import { daysBetween, periodView } from './period.ts';

const pad = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export type CashEvent = { title: string; amount: number };
export type CashPoint = { date: string; balance: number; events: CashEvent[] };

/**
 * Saldo de las cuentas día a día hasta fin de ciclo, con los sueldos y pagos ya conocidos.
 * Lo vencido sin pagar se ubica hoy. Las compras con tarjeta aún no facturadas no aparecen:
 * se pagan en el ciclo siguiente.
 */
export function projectCash(data: Household, today: string) {
  const plan = buildPlan(data, today);
  const events = new Map<string, CashEvent[]>();
  const add = (date: string, event: CashEvent) => {
    const day = date < today ? today : date;
    if (day > plan.cycle.end) return;
    if (!events.has(day)) events.set(day, []);
    events.get(day)!.push(event);
  };
  for (const i of plan.income) if (!i.received) add(i.date, { title: i.item.name, amount: i.amount });
  for (const u of plan.upcoming) add(u.date, { title: u.flexible ? `${u.title} (aprox.)` : u.title, amount: -u.amount });

  const points: CashPoint[] = [];
  let balance = plan.wealth.cash;
  for (let day = today; day <= plan.cycle.end; day = addDays(day, 1)) {
    const dayEvents = events.get(day) ?? [];
    balance += dayEvents.reduce((s, e) => s + e.amount, 0);
    points.push({ date: day, balance: Math.round(balance), events: dayEvents });
  }
  const low = points.reduce((min, p) => (p.balance < min.balance ? p : min), points[0]);
  return { start: Math.round(plan.wealth.cash), points, low, end: points.at(-1)! };
}

/** Total de cuotas por mes (créditos, personas y tarjetas) para ver cuándo se alivia el presupuesto. */
export function monthlyInstallments(data: Household, today: string, months = 18) {
  const start = parse(today);
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  });
  const totals = new Map(keys.map(k => [k, 0]));
  for (const i of data.installments) {
    if (i.status !== 'pending') continue;
    const key = i.due_date < today ? keys[0] : i.due_date.slice(0, 7);
    if (totals.has(key)) totals.set(key, totals.get(key)! + Number(i.amount));
  }
  const series = keys.map(k => ({ month: k, total: Math.round(totals.get(k)!) }));
  const lastWithDebt = [...series].reverse().find(s => s.total > 0)?.month ?? null;
  const pending = data.installments.filter(i => i.status === 'pending');
  const freeFrom = pending.length
    ? pending.reduce((max, i) => (i.due_date > max ? i.due_date : max), '').slice(0, 7)
    : null;
  return { series, lastWithDebt, freeFrom };
}

export type Insight = { tone: 'ok' | 'warn' | 'danger' | 'info'; text: string; href?: string };

const clp = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;

/** Hasta cuatro avisos, del más urgente al más informativo. */
export function insights(data: Household, today: string): Insight[] {
  const plan = buildPlan(data, today);
  const list: Insight[] = [];

  const view = periodView(data, today);
  if (view?.low && view.low.balance < 0) {
    list.push({
      tone: 'danger',
      text: `El ${parse(view.low.date).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')} sus cuentas quedarían en ${clp(view.low.balance)} si gastan todo lo presupuestado.`,
      href: '/plan',
    });
  }

  if (view && view.totalBudget > 0 && today <= view.period.end_date) {
    const elapsed = daysBetween(view.period.start_date, today) + 1;
    if (elapsed >= 4) {
      const expected = (view.totalBudget * elapsed) / view.totalDays;
      const ratio = view.totalSpent / expected;
      const over = view.budgets.filter(b => b.over > 0);
      if (over.length) {
        list.push({ tone: 'warn', text: `Se pasaron en ${over.map(b => b.name).join(', ')}.`, href: '/plan' });
      } else if (ratio > 1.15) {
        list.push({ tone: 'warn', text: `Van gastando más rápido que el presupuesto: ${clp(view.totalSpent)} cuando a esta altura lo esperable era ${clp(expected)}.`, href: '/plan' });
      } else if (ratio < 0.85) {
        list.push({ tone: 'ok', text: `Van bien: llevan ${clp(view.totalSpent)} de ${clp(view.totalBudget)} presupuestados.` });
      }
    }
  }

  const history = cycleHistory(data, today, 4).slice(0, -1).filter(c => c.expense > 0);
  if (history.length) {
    const byCategory = (start: string, end: string) => {
      const totals = new Map<string, number>();
      for (const t of data.transactions) {
        if (t.type !== 'expense' || !t.budget_id || isMarker(t) || isAdjustment(t)) continue;
        const day = dayOf(t);
        if (day < start || day > end) continue;
        totals.set(t.budget_id, (totals.get(t.budget_id) ?? 0) + Number(t.amount));
      }
      return totals;
    };
    const now = byCategory(plan.cycle.start, plan.cycle.end);
    const past = history.map(c => byCategory(c.start, c.end));
    let worst: { name: string; now: number; avg: number } | null = null;
    for (const [id, amount] of now) {
      const avg = past.reduce((s, m) => s + (m.get(id) ?? 0), 0) / past.length;
      if (avg < 20000 || amount < avg * 1.25) continue;
      const name = data.budgets.find(b => b.id === id)?.name ?? '';
      if (!worst || amount - avg > worst.now - worst.avg) worst = { name, now: amount, avg };
    }
    if (worst) {
      list.push({ tone: 'warn', text: `En ${worst.name} ya llevan ${clp(worst.now)}; su promedio por ciclo es ${clp(worst.avg)}.`, href: '/reports' });
    }
  }

  const uncategorized = data.transactions.filter(t =>
    t.type === 'expense' && !t.budget_id && !isMarker(t) && dayOf(t) >= plan.cycle.start && dayOf(t) <= plan.cycle.end,
  ).length;
  if (uncategorized >= 3) {
    list.push({ tone: 'info', text: `${uncategorized} gastos de este ciclo no tienen categoría.`, href: '/transactions?category=none' });
  }

  const maturing = plan.wealth.items.find(a =>
    a.asset_kind === 'deposit' && a.maturity_date && a.maturity_date >= today && a.maturity_date <= addDays(today, 7) && a.balance > 0,
  );
  if (maturing) {
    list.push({ tone: 'info', text: `${maturing.name} vence pronto (${clp(maturing.balance)}). Decidan si lo renuevan.`, href: '/accounts' });
  }

  return list.slice(0, 4);
}
