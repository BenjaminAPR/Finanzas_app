'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon, Meter, WithData } from '@/components/ui';
import { CashflowChart } from '@/components/charts';
import { BudgetSheet, PeriodSheet } from '@/components/BudgetSheets';
import { PaySheet } from '@/components/PaySheet';
import { todayISO } from '@/lib/dates';
import { clp, dueLabel, shortDate } from '@/lib/format';
import type { Household } from '@/lib/finance';
import { buildPlan, type UpcomingPayment } from '@/lib/plan';
import { nextPeriodDates, periodView, type BudgetLine } from '@/lib/period';

function Budget({ data }: { data: Household }) {
  const today = todayISO();
  const view = useMemo(() => periodView(data, today), [data, today]);
  const plan = useMemo(() => buildPlan(data, today), [data, today]);
  const suggested = useMemo(() => nextPeriodDates(data.periods, today), [data.periods, today]);
  const [editingBudget, setEditingBudget] = useState<BudgetLine | 'new' | null>(null);
  const [periodSheet, setPeriodSheet] = useState<'new' | 'edit' | null>(null);
  const [paying, setPaying] = useState<UpcomingPayment | null>(null);

  if (!view) {
    return (
      <div className="page">
        <h1 className="h1">Presupuesto</h1>
        <section className="card" style={{ textAlign: 'center', padding: '2rem 1.2rem' }}>
          <h2 className="h3">Empiecen un período</h2>
          <p className="text-muted" style={{ margin: '0.4rem 0 1rem' }}>Elijan un inicio y un fin, por ejemplo de sueldo a sueldo, y pónganle presupuesto a cada categoría.</p>
          <button className="btn-primary" onClick={() => setPeriodSheet('new')}>Crear período</button>
        </section>
        {periodSheet && <PeriodSheet data={data} suggested={suggested} onClose={() => setPeriodSheet(null)} />}
      </div>
    );
  }

  const { period } = view;
  const ended = today > period.end_date;
  const dueDated = plan.upcoming.filter(u => !u.flexible && u.date <= period.end_date);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="h1">Presupuesto</h1>
          <button className="period-chip" onClick={() => setPeriodSheet('edit')} aria-label="Editar fechas del período">
            {shortDate(period.start_date)} – {shortDate(period.end_date)} · {ended ? 'terminó' : `quedan ${view.daysLeft} ${view.daysLeft === 1 ? 'día' : 'días'}`}
          </button>
        </div>
        <button className="btn-secondary btn-small" onClick={() => setPeriodSheet('new')}><Icon name="plus" size={15} />Nuevo período</button>
      </div>

      {ended && (
        <div className="notice"><Icon name="alert" size={18} /><span>Este período ya terminó. Creen el siguiente para seguir midiendo.</span></div>
      )}

      <section className={`card hero ${view.free < 0 ? 'short' : ''}`} aria-label="Plata libre del período">
        <div className="hero-label">{view.free >= 0 ? `Libre hasta el ${shortDate(period.end_date)}` : `Les faltan para llegar al ${shortDate(period.end_date)}`}</div>
        <div className="hero-value">{clp(Math.abs(view.free))}</div>
        <div className="hero-sub">
          {view.free > 0 ? `Unos ${clp(view.perDay)} al día, además de lo presupuestado` : 'Lo que tienen y lo que les falta recibir no alcanza para todo lo planeado'}
        </div>
        <div className="hero-lines">
          <div><span>Hoy en sus cuentas</span><span>{clp(view.cash)}</span></div>
          {view.incomePending > 0 && <div><span>Sueldos por llegar</span><span>+{clp(view.incomePending)}</span></div>}
          {view.remainingBudgets > 0 && <div><span>Presupuesto por gastar</span><span>-{clp(view.remainingBudgets)}</span></div>}
          {view.debtsDue > 0 && <div><span>Cuotas de créditos y personas</span><span>-{clp(view.debtsDue)}</span></div>}
          {view.cardsSpent > 0 && <div><span>Tarjetas: lo ya gastado</span><span>-{clp(view.cardsSpent)}</span></div>}
          <div className="total"><span>{view.free >= 0 ? 'Libre' : 'Faltan'}</span><span>{clp(Math.abs(view.free))}</span></div>
        </div>
      </section>

      <section aria-label="Presupuestos">
        <div className="wallet-head">
          <h2 className="h3">Presupuestos</h2>
          <span className="num">{clp(view.totalSpent)} de {clp(view.totalBudget)}</span>
        </div>
        <div className="budget-grid">
          {view.budgets.map(b => (
            <button key={b.id} className={`btile ${b.over > 0 ? 'over' : ''}`} onClick={() => setEditingBudget(b)}>
              <span className="btile-name">{b.name}</span>
              <span className="btile-left">{clp(b.over > 0 ? b.over : b.remaining)}</span>
              <span className="btile-hint">{b.over > 0 ? 'se pasaron' : 'quedan'}</span>
              <Meter value={b.spent} max={b.amount} />
              <span className="btile-foot">{clp(b.spent)} de {clp(b.amount)}</span>
            </button>
          ))}
          <button className="btile add" onClick={() => setEditingBudget('new')}>
            <Icon name="plus" size={20} />
            <span>Agregar presupuesto</span>
          </button>
        </div>
        {view.unbudgetedSpent > 0 && (
          <Link className="card-link" href="/transactions?category=none" style={{ display: 'inline-block', marginTop: '0.6rem' }}>
            {clp(view.unbudgetedSpent)} gastados fuera de los presupuestos ({view.unbudgetedCount}) · ordenar
          </Link>
        )}
      </section>

      <div className="columns">
        <section className="card">
          <div className="card-head">
            <h2 className="h3">Cómo viene la plata</h2>
            {view.points.length > 0 && <span className="text-muted">Al {shortDate(period.end_date)}: {clp(view.points.at(-1)!.balance)}</span>}
          </div>
          {view.points.length > 1 && view.low
            ? <CashflowChart points={view.points} low={view.low} />
            : <p className="text-muted">El período ya terminó.</p>}
          <div className="chart-legend"><span><i className="in" />Entra plata</span><span><i />Pagos</span><span>Incluye gastar parejo lo que queda de presupuesto ({clp(view.dailyBurn)}/día)</span></div>
        </section>

        <section className="card">
          <div className="card-head"><h2 className="h3">Vencimientos</h2><span className="text-muted">Tarjetas y créditos</span></div>
          <div className="list">
            {dueDated.length === 0 && <p className="text-muted">No hay vencimientos en este período.</p>}
            {dueDated.map(u => (
              <button key={u.key} className="row" onClick={() => setPaying(u)}>
                <span className="row-main">
                  <span className="row-title" style={{ display: 'block' }}>{u.title}</span>
                  <span className="row-sub" style={{ display: 'block' }}>{u.detail} · {shortDate(u.date)}</span>
                </span>
                <span className="row-end">{clp(u.amount)}<small className={u.overdue ? 'neg' : ''}>{dueLabel(u.daysUntil)}</small></span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {editingBudget && (
        <BudgetSheet data={data} period={period} line={editingBudget === 'new' ? undefined : editingBudget} onClose={() => setEditingBudget(null)} />
      )}
      {periodSheet && (
        <PeriodSheet data={data} period={periodSheet === 'edit' ? period : undefined} suggested={suggested} onClose={() => setPeriodSheet(null)} />
      )}
      {paying && <PaySheet data={data} payment={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

export default function PlanPage() {
  return <WithData>{data => <Budget data={data} />}</WithData>;
}
