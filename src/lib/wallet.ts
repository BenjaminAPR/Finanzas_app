// Vista de billetera: cuánto tienen, cuánto deben y el detalle de cada cuenta o tarjeta.
import { dayOf, isMarker, type AccountWithBalance, type Household, type Transaction } from './finance.ts';
import { debtItem, debtOverview } from './plan.ts';

export function walletSummary(data: Household, today: string) {
  const overview = debtOverview(data, today);
  const { wealth } = overview;
  const standaloneDebt = overview.standalone.reduce((s, i) => s + i.remaining, 0);
  return {
    have: wealth.assets,
    owe: overview.total,
    net: overview.netWorth,
    cash: wealth.cash,
    savings: wealth.deposits,
    investments: wealth.investments,
    cardDebt: wealth.cardDebt,
    standaloneDebt,
    accounts: wealth.items,
    standalone: overview.standalone.filter(i => i.remaining > 0),
  };
}

export function accountMovements(data: Household, accountId: string, limit = 60): Transaction[] {
  return data.transactions
    .filter(t => !isMarker(t) && (t.account_id === accountId || t.destination_account_id === accountId))
    .sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, limit);
}

/**
 * Desglose de una tarjeta de crédito:
 * deuda total = facturado por pagar + compras al contado aún sin facturar + cuotas que vienen.
 */
export function cardDetail(data: Household, card: AccountWithBalance, today: string) {
  const owed = Math.max(0, -card.balance);
  const statement = data.statements
    .filter(s => s.account_id === card.id)
    .sort((a, b) => b.due_date.localeCompare(a.due_date))[0] ?? null;
  const billedOwed = statement ? Math.max(0, Number(statement.billed_amount) - Number(statement.paid_amount)) : 0;

  const plans = data.debts
    .filter(d => d.account_id === card.id)
    .map(d => debtItem(d, data.installments, today))
    .filter(i => i.remaining > 0);
  const cutoff = statement && !statement.paid_at ? statement.due_date : today;
  const futureInstallments = data.installments
    .filter(i => i.status === 'pending' && i.due_date > cutoff && plans.some(p => p.debt.id === i.debt_id))
    .reduce((s, i) => s + Number(i.amount), 0);
  // El banco informa el saldo sin intereses futuros, así que las cuotas nunca pueden superar la deuda.
  const installmentsAhead = Math.min(futureInstallments, Math.max(0, owed - billedOwed));
  const unbilled = Math.max(0, owed - billedOwed - installmentsAhead);

  const limit = card.credit_limit ? Number(card.credit_limit) : null;
  const since = statement?.period_end ?? null;
  const recent = data.transactions.filter(t =>
    t.account_id === card.id && t.type === 'expense' && !isMarker(t) && (!since || dayOf(t) > since),
  );

  return {
    owed,
    statement,
    billedOwed,
    unbilled,
    installmentsAhead,
    plans,
    monthlyInstallments: plans.reduce((s, p) => s + p.monthly, 0),
    limit,
    available: limit === null ? null : Math.max(0, limit - owed),
    used: limit ? owed / limit : null,
    since,
    recentCount: recent.length,
  };
}

export const daysUntil = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / 86_400_000);
