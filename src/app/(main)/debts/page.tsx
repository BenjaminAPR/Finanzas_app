'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Icon, Meter, Sheet, WithData } from '@/components/ui';
import { PaySheet } from '@/components/PaySheet';
import { supabase } from '@/lib/supabase';
import { addMonths, todayISO } from '@/lib/dates';
import { clp, dueLabel, monthsLabel, monthYear, shortDate } from '@/lib/format';
import { splitInstallments, type Household } from '@/lib/finance';
import { debtOverview, simulatePayoff, type DebtItem, type PayoffOrder, type UpcomingPayment } from '@/lib/plan';
import { monthlyInstallments } from '@/lib/insights';
import { MonthBars } from '@/components/charts';
import { refreshData } from '@/lib/store';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

function toPayment(item: DebtItem, today: string): UpcomingPayment | null {
  if (!item.next) return null;
  return {
    key: item.next.id,
    kind: 'installment',
    flexible: item.debt.kind === 'family',
    title: item.debt.creditor ? `${item.debt.name} (${item.debt.creditor})` : item.debt.name,
    detail: `Cuota ${item.next.installment_number}`,
    date: item.next.due_date,
    amount: Number(item.next.amount),
    overdue: item.next.due_date < today,
    daysUntil: daysBetween(today, item.next.due_date),
    installment: item.next,
  };
}

function DebtCard({ item, today, onPay }: { item: DebtItem; today: string; onPay?: () => void }) {
  const paidCount = item.totalCount - item.pendingCount;
  return (
    <div style={{ padding: '0.75rem 0', borderTop: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem' }}>
        <div className="row-main">
          <div className="row-title">{item.debt.name}{item.debt.creditor ? ` · ${item.debt.creditor}` : ''}</div>
          <div className="row-sub">{paidCount} de {item.totalCount} cuotas{item.endDate ? ` · termina ${monthYear(item.endDate)}` : ''}</div>
        </div>
        <div className="row-end">{clp(item.remaining)}<small>{clp(item.monthly)} al mes</small></div>
      </div>
      <div style={{ margin: '0.45rem 0' }}><Meter value={item.paid} max={item.total} warnAt={2} /></div>
      {item.next && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span className="text-muted">
            {item.overdue > 0
              ? <span className="badge danger">{item.overdue} {item.overdue === 1 ? 'cuota atrasada' : 'cuotas atrasadas'}</span>
              : `Próxima: ${shortDate(item.next.due_date)} (${dueLabel(daysBetween(today, item.next.due_date)).toLowerCase()})`}
          </span>
          {onPay && <button className="btn-secondary btn-small" onClick={onPay}>Registrar pago</button>}
        </div>
      )}
    </div>
  );
}

function NewDebtSheet({ data, onClose }: { data: Household; onClose: () => void }) {
  const [name, setName] = useState('');
  const [creditor, setCreditor] = useState('');
  const [total, setTotal] = useState('');
  const [count, setCount] = useState('1');
  const [firstDue, setFirstDue] = useState(todayISO());
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cards = data.accounts.filter(a => a.asset_kind === 'card' && !a.archived);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = Number(total.replace(/\D/g, ''));
    const installments = Number(count);
    if (!amount || installments < 1) { setError('Revisa el monto y las cuotas.'); return; }
    setSaving(true);
    setError(null);
    const { data: debt, error: debtError } = await supabase
      .from('debts')
      .insert({
        name: name.trim(),
        creditor: creditor.trim() || null,
        total_amount: amount,
        user_id: data.userId,
        kind: creditor.trim() ? 'family' : 'installments',
        account_id: accountId || null,
      })
      .select('id')
      .single();
    if (debtError || !debt) { setSaving(false); setError('No se pudo guardar la deuda.'); return; }
    const rows = splitInstallments(amount, installments).map((value, i) => ({
      debt_id: debt.id,
      installment_number: i + 1,
      amount: value,
      due_date: addMonths(firstDue, i),
      status: 'pending',
    }));
    const { error: rowsError } = await supabase.from('installments').insert(rows);
    setSaving(false);
    if (rowsError) {
      await supabase.from('debts').delete().eq('id', debt.id);
      setError('No se pudieron crear las cuotas.');
      return;
    }
    void refreshData();
    onClose();
  }

  return (
    <Sheet title="Nueva deuda" onClose={onClose}>
      <form className="form-stack" onSubmit={e => void submit(e)}>
        <div className="input-group"><label className="input-label" htmlFor="d-name">Nombre</label><input id="d-name" className="input-field" value={name} onChange={e => setName(e.target.value)} required /></div>
        <div className="input-group"><label className="input-label" htmlFor="d-creditor">A quién se le debe (si es una persona)</label><input id="d-creditor" className="input-field" value={creditor} onChange={e => setCreditor(e.target.value)} /></div>
        <div className="form-row">
          <div className="input-group"><label className="input-label" htmlFor="d-total">Total pendiente</label><input id="d-total" className="input-field" inputMode="numeric" value={total} onChange={e => setTotal(e.target.value)} required /></div>
          <div className="input-group"><label className="input-label" htmlFor="d-count">Cuotas</label><input id="d-count" className="input-field" type="number" min="1" value={count} onChange={e => setCount(e.target.value)} required /></div>
        </div>
        <div className="input-group"><label className="input-label" htmlFor="d-first">Primera cuota</label><input id="d-first" className="input-field" type="date" value={firstDue} onChange={e => setFirstDue(e.target.value)} required /></div>
        <div className="input-group">
          <label className="input-label" htmlFor="d-card">¿Se cobra en una tarjeta?</label>
          <select id="d-card" className="input-field" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">No</option>
            {cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button className="btn-primary btn-block" disabled={saving}>{saving ? 'Guardando…' : 'Guardar deuda'}</button>
      </form>
    </Sheet>
  );
}

function Debts({ data }: { data: Household }) {
  const today = todayISO();
  const overview = useMemo(() => debtOverview(data, today), [data, today]);
  const [extra, setExtra] = useState(Number(data.settings.extra_debt_payment) || 0);
  const [order, setOrder] = useState<PayoffOrder>('smallest');
  const [paying, setPaying] = useState<UpcomingPayment | null>(null);
  const [adding, setAdding] = useState(false);
  const [saved, setSaved] = useState(false);

  const simulation = useMemo(() => simulatePayoff(overview.payable, extra, order), [overview.payable, extra, order]);
  const finishDate = (months: number) => monthYear(addMonths(today, months));
  const paid = overview.payable.reduce((s, i) => s + i.paid, 0);
  const planned = overview.payable.reduce((s, i) => s + i.total, 0);
  const months = useMemo(() => monthlyInstallments(data, today), [data, today]);
  const monthName = (key: string) => monthYear(`${key}-01`);
  const firstRelief = months.series.findIndex((s, i) => i > 0 && s.total < months.series[i - 1].total - 20000);

  async function saveExtra() {
    await supabase.from('household_settings').update({ extra_debt_payment: extra }).eq('id', true);
    setSaved(true);
    void refreshData();
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Deudas</h1>
        <button className="btn-primary btn-small" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Nueva</button>
      </div>

      <section className="card hero">
        <div className="hero-label">Deben en total</div>
        <div className="hero-value">{clp(overview.total)}</div>
        <div className="hero-sub">{clp(overview.monthlyInstallments)} al mes en cuotas</div>
        <Meter value={paid} max={planned} warnAt={2} />
        <div className="hero-foot"><span>Cuotas pagadas {clp(paid)}</span><span>de {clp(planned)}</span></div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="h3">Cuotas por mes</h2>
          {months.freeFrom && <span className="text-muted">Última cuota: {monthName(months.freeFrom)}</span>}
        </div>
        <MonthBars
          data={months.series.map(s => ({
            label: monthYear(`${s.month}-01`).split(' ')[0],
            value: s.total,
            title: `${monthName(s.month)}: ${clp(s.total)}`,
          }))}
        />
        {firstRelief > 0 && (
          <p className="text-muted" style={{ marginTop: '0.5rem' }}>
            Desde {monthName(months.series[firstRelief].month)} pagan {clp(months.series[firstRelief - 1].total - months.series[firstRelief].total)} menos al mes en cuotas.
          </p>
        )}
      </section>

      <div className="columns">
        <div className="stack">
          {overview.cards.map(card => (
            <section className="card" key={card.account.id}>
              <div className="card-head" style={{ marginBottom: '0.3rem' }}>
                <h2 className="h3">{card.account.name}</h2>
                <span className="num" style={{ fontWeight: 680 }}>{clp(card.owed)}</span>
              </div>
              {card.statement && (
                <p className="text-muted">
                  {card.statement.paid_at
                    ? `Último estado pagado (${shortDate(card.statement.due_date)})`
                    : `Facturado ${clp(Number(card.statement.billed_amount))}, vence ${shortDate(card.statement.due_date)}`}
                  {card.statement.cae ? ` · CAE ${String(card.statement.cae).replace('.', ',')}%` : ''}
                </p>
              )}
              {card.plans.map(item => <DebtCard key={item.debt.id} item={item} today={today} />)}
            </section>
          ))}

          <section className="card">
            <h2 className="h3" style={{ marginBottom: '0.4rem' }}>Créditos y personas</h2>
            {overview.standalone.length === 0 && <p className="text-muted">No hay deudas fuera de las tarjetas.</p>}
            {overview.standalone.map(item => {
              const payment = toPayment(item, today);
              return <DebtCard key={item.debt.id} item={item} today={today} onPay={payment ? () => setPaying(payment) : undefined} />;
            })}
          </section>
        </div>

        <section className="card">
          <h2 className="h3">¿Y si abonan más?</h2>
          <p className="text-muted" style={{ margin: '0.2rem 0 0.8rem' }}>Simula cuándo terminarían sus cuotas. No incluye el ahorro de intereses ni es asesoría financiera.</p>
          <label className="input-label" htmlFor="extra">Abono extra al mes: <strong className="num">{clp(extra)}</strong></label>
          <input id="extra" type="range" min="0" max="500000" step="10000" value={extra} onChange={e => { setExtra(Number(e.target.value)); setSaved(false); }} style={{ width: '100%', accentColor: 'var(--accent-color)', margin: '0.4rem 0 0.7rem' }} />
          <div className="segmented" style={{ marginBottom: '0.8rem' }}>
            <button className={order === 'smallest' ? 'active' : ''} onClick={() => setOrder('smallest')}>Menor saldo primero</button>
            <button className={order === 'rate' ? 'active' : ''} onClick={() => setOrder('rate')}>Mayor tasa primero</button>
          </div>
          <div className="tiles">
            <div><div className="tile-label">Sin abono</div><div className="tile-value">{finishDate(simulation.baseline)}</div><div className="tile-sub">{monthsLabel(simulation.baseline)}</div></div>
            <div><div className="tile-label">Con abono</div><div className="tile-value">{finishDate(simulation.withExtra)}</div><div className="tile-sub">{simulation.saved > 0 ? `${monthsLabel(simulation.saved)} antes` : 'Sin cambio'}</div></div>
          </div>
          <button className="btn-secondary btn-block" style={{ marginTop: '0.9rem' }} onClick={() => void saveExtra()} disabled={saved || extra === Number(data.settings.extra_debt_payment)}>
            {saved ? 'Incluido en el plan' : 'Incluir este abono en el plan mensual'}
          </button>
        </section>
      </div>

      {paying && <PaySheet data={data} payment={paying} onClose={() => setPaying(null)} />}
      {adding && <NewDebtSheet data={data} onClose={() => setAdding(false)} />}
    </div>
  );
}

export default function DebtsPage() {
  return <WithData>{data => <Debts data={data} />}</WithData>;
}
