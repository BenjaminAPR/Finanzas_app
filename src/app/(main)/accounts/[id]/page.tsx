'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon, Meter, WithData } from '@/components/ui';
import { WalletCard } from '@/components/WalletCard';
import { BalanceSheet } from '@/components/AccountSheets';
import { PaySheet } from '@/components/PaySheet';
import { TransactionSheet } from '@/components/TransactionSheet';
import { todayISO } from '@/lib/dates';
import { clp, dueLabel, longDate, monthYear, shortDate } from '@/lib/format';
import { dayOf, wealthSummary, type Household, type Transaction } from '@/lib/finance';
import { buildPlan, type UpcomingPayment } from '@/lib/plan';
import { accountMovements, cardDetail, daysUntil } from '@/lib/wallet';

function Line({ label, value, strong = false, hint }: { label: string; value: string; strong?: boolean; hint?: string }) {
  return (
    <div className="row">
      <span className="row-main">
        <span className={strong ? 'row-title' : ''} style={{ display: 'block' }}>{label}</span>
        {hint && <span className="row-sub" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <span className="row-end">{value}</span>
    </div>
  );
}

function Detail({ data, id }: { data: Household; id: string }) {
  const today = todayISO();
  const account = useMemo(
    () => wealthSummary(data.accounts, data.transactions).items.find(a => a.id === id) ?? null,
    [data, id],
  );
  const plan = useMemo(() => buildPlan(data, today), [data, today]);
  const movements = useMemo(() => accountMovements(data, id), [data, id]);
  const card = useMemo(() => (account?.asset_kind === 'card' ? cardDetail(data, account, today) : null), [data, account, today]);
  const [updating, setUpdating] = useState(false);
  const [paying, setPaying] = useState<UpcomingPayment | null>(null);
  const [editing, setEditing] = useState<Transaction | null>(null);

  if (!account) {
    return <div className="page"><p className="text-muted">No encontramos esta cuenta.</p><Link className="card-link" href="/dashboard">Volver a la billetera</Link></div>;
  }

  const accountName = new Map(data.accounts.map(a => [a.id, a.name]));
  const statementPayment = card?.statement ? plan.upcoming.find(u => u.statement?.id === card.statement!.id) ?? null : null;
  const groups = new Map<string, Transaction[]>();
  for (const t of movements) {
    const day = dayOf(t);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(t);
  }
  const signed = (t: Transaction) => {
    if (t.type === 'income') return Number(t.amount);
    if (t.type === 'expense') return -Number(t.amount);
    return t.destination_account_id === id ? Number(t.amount) : -Number(t.amount);
  };

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <Link href="/dashboard" className="card-link">← Billetera</Link>
      <WalletCard account={account} today={today} large />

      {card && (
        <section className="card">
          <h2 className="h3" style={{ marginBottom: '0.3rem' }}>Cuánto debes y en qué</h2>
          <div className="list">
            <Line
              label="Facturado por pagar"
              value={clp(card.billedOwed)}
              hint={card.statement
                ? card.billedOwed > 0 ? `Vence ${shortDate(card.statement.due_date)} · mínimo ${clp(Number(card.statement.minimum_amount))}` : `Pagado (${shortDate(card.statement.due_date)})`
                : 'Sin estado de cuenta cargado'}
            />
            <Line label="Compras al contado sin facturar" value={clp(card.unbilled)} hint={card.since ? `Desde el cierre del ${shortDate(card.since)}; se cobran en el próximo estado` : undefined} />
            <Line label="Cuotas que vienen" value={clp(card.installmentsAhead)} hint={card.plans.length ? `${card.plans.length} ${card.plans.length === 1 ? "compra" : "compras"} en cuotas` : undefined} />
            <Line label="Deuda total" value={clp(card.owed)} strong />
          </div>
          {card.limit && (
            <div style={{ marginTop: '0.8rem' }}>
              <div className="hbar" style={{ padding: 0 }}>
                <span>Cupo usado</span>
                <span className="num">{clp(card.owed)} de {clp(card.limit)}</span>
                <Meter value={card.owed} max={card.limit} warnAt={0.7} />
              </div>
              <p className="text-muted" style={{ marginTop: '0.3rem' }}>Disponible {clp(card.available ?? 0)}</p>
            </div>
          )}
          {statementPayment && (
            <button className="btn-primary btn-block" style={{ marginTop: '0.9rem' }} onClick={() => setPaying(statementPayment)}>
              Registrar pago · {dueLabel(statementPayment.daysUntil)}
            </button>
          )}
        </section>
      )}

      {card && card.plans.length > 0 && (
        <section className="card">
          <div className="card-head"><h2 className="h3">Compras en cuotas</h2><span className="text-muted">{clp(card.monthlyInstallments)} al mes</span></div>
          {card.plans.map(p => (
            <div key={p.debt.id} style={{ padding: '0.6rem 0', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem' }}>
                <div className="row-main">
                  <div className="row-title">{p.debt.name}</div>
                  <div className="row-sub">{p.totalCount - p.pendingCount} de {p.totalCount} pagadas{p.endDate ? ` · última ${monthYear(p.endDate)}` : ''}</div>
                </div>
                <div className="row-end">{clp(p.monthly)}<small>quedan {clp(p.remaining)}</small></div>
              </div>
              <div style={{ marginTop: '0.4rem' }}><Meter value={p.paid} max={p.total} warnAt={2} /></div>
            </div>
          ))}
        </section>
      )}

      {account.asset_kind === 'deposit' && (
        <section className="card">
          <h2 className="h3" style={{ marginBottom: '0.3rem' }}>Depósito</h2>
          <div className="list">
            <Line label="Monto" value={clp(account.balance)} strong />
            {account.maturity_date
              ? <Line label={account.maturity_date >= today ? 'Vence' : 'Venció'} value={shortDate(account.maturity_date)} hint={account.maturity_date >= today ? `En ${daysUntil(today, account.maturity_date)} días` : 'Actualiza el saldo si lo renovaron'} />
              : <Line label="Vencimiento" value="Sin fecha" hint="Agrégala en Actualizar" />}
          </div>
        </section>
      )}

      <div className="wallet-actions">
        <button className="btn-secondary" onClick={() => setUpdating(true)}><Icon name="check" size={16} />{account.asset_kind === 'card' ? 'Actualizar deuda y cupo' : 'Actualizar saldo'}</button>
        <Link className="btn-secondary" href="/import"><Icon name="upload" size={16} />Importar cartola</Link>
      </div>

      <section className="card" style={{ paddingTop: '0.3rem' }}>
        <h2 className="h3" style={{ padding: '0.6rem 0 0.1rem' }}>Movimientos</h2>
        {movements.length === 0 && <p className="text-muted" style={{ padding: '0.5rem 0' }}>Todavía no hay movimientos en esta cuenta.</p>}
        {[...groups.entries()].map(([day, items]) => (
          <div key={day}>
            <div className="day-title">{longDate(day)}</div>
            <div className="list">
              {items.map(t => {
                const value = signed(t);
                const other = t.type === 'transfer' ? accountName.get((t.account_id === id ? t.destination_account_id : t.account_id) ?? '') : null;
                return (
                  <button key={t.id} className="row" onClick={() => setEditing(t)}>
                    <span className="row-main">
                      <span className="row-title" style={{ display: 'block' }}>{t.description}</span>
                      <span className="row-sub" style={{ display: 'block' }}>{other ? (value > 0 ? `Desde ${other}` : `Hacia ${other}`) : data.budgets.find(b => b.id === t.budget_id)?.name ?? ''}</span>
                    </span>
                    <span className={`row-end ${value > 0 && account.asset_kind !== 'card' ? 'pos' : ''}`}>
                      {account.asset_kind === 'card' ? (value < 0 ? clp(-value) : `-${clp(value)}`) : `${value > 0 ? '+' : ''}${clp(value)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {updating && <BalanceSheet account={account} onClose={() => setUpdating(false)} />}
      {paying && <PaySheet data={data} payment={paying} onClose={() => setPaying(null)} />}
      {editing && <TransactionSheet data={data} transaction={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export default function AccountPage() {
  const params = useParams<{ id: string }>();
  return <WithData>{data => <Detail data={data} id={params.id} />}</WithData>;
}
