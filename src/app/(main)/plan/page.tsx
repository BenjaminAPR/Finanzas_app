'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon, Meter, WithData } from '@/components/ui';
import { PaySheet } from '@/components/PaySheet';
import { todayISO } from '@/lib/dates';
import { clp, dueLabel, shortDate } from '@/lib/format';
import { dayOf, type Household } from '@/lib/finance';
import { buildPlan, debtOverview, type UpcomingPayment } from '@/lib/plan';
import { insights, projectCash } from '@/lib/insights';
import { CashflowChart } from '@/components/charts';

function Month({ data }: { data: Household }) {
  const today = todayISO();
  const plan = useMemo(() => buildPlan(data, today), [data, today]);
  const debts = useMemo(() => debtOverview(data, today), [data, today]);
  const [paying, setPaying] = useState<UpcomingPayment | null>(null);

  // Solo lo que cobra un banco en fecha fija genera avisos; lo demás va a "Pendientes del mes".
  const urgent = plan.upcoming.filter(u => !u.flexible && u.daysUntil <= 2);
  const dueDated = plan.upcoming.filter(u => !u.flexible);
  const monthly = plan.upcoming.filter(u => u.flexible && u.date <= plan.cycle.end);
  const projection = useMemo(() => projectCash(data, today), [data, today]);
  const notes = useMemo(() => insights(data, today), [data, today]);
  const lastImport = data.transactions.filter(t => t.source === 'import').map(dayOf).sort().at(-1);
  const hasPlan = plan.incomeTotal > 0;
  const maxCategory = plan.categories[0]?.total ?? 0;
  const uncategorized = plan.categories.find(c => c.id === null)?.total ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">El mes</h1>
        <span className="text-muted">Ciclo {shortDate(plan.cycle.start)} al {shortDate(plan.cycle.end)}</span>
      </div>
      <section className={`card hero ${plan.free < 0 ? 'short' : ''}`} aria-label="Plata libre hasta fin de ciclo">
        <div className="hero-label">
          {plan.free >= 0 ? `Libre hasta el ${shortDate(plan.cycle.end)}` : `Les faltan para llegar al ${shortDate(plan.cycle.end)}`}
        </div>
        <div className="hero-value">{clp(Math.abs(plan.free))}</div>
        <div className="hero-sub">
          {plan.free > 0
            ? `Unos ${clp(plan.perDayFree)} al día por ${plan.cycle.daysLeft} días, después de pagar todo lo comprometido`
            : 'Lo que tienen y lo que les falta recibir no alcanza para lo ya comprometido'}
        </div>
        <div className="hero-lines">
          <div><span>Hoy en sus cuentas</span><span>{clp(plan.freeParts.cash)}</span></div>
          {plan.freeParts.incomePending > 0 && <div><span>Sueldos por llegar</span><span>+{clp(plan.freeParts.incomePending)}</span></div>}
          {plan.freeParts.fixedPending > 0 && <div><span>Gastos del mes por pagar (aprox.)</span><span>-{clp(plan.freeParts.fixedPending)}</span></div>}
          {plan.freeParts.debtsDue > 0 && <div><span>Cuotas de créditos y personas</span><span>-{clp(plan.freeParts.debtsDue)}</span></div>}
          {plan.freeParts.cardsSpent > 0 && <div><span>Tarjetas: lo ya gastado</span><span>-{clp(plan.freeParts.cardsSpent)}</span></div>}
          {plan.freeParts.extraDebt > 0 && <div><span>Abono extra a deudas</span><span>-{clp(plan.freeParts.extraDebt)}</span></div>}
          <div className="total"><span>{plan.free >= 0 ? 'Libre' : 'Faltan'}</span><span>{clp(Math.abs(plan.free))}</span></div>
        </div>
      </section>

      {urgent.map(u => (
        <button key={u.key} className={`notice ${u.overdue ? 'danger' : ''}`} style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => setPaying(u)}>
          <Icon name="alert" size={18} />
          <span><strong>{u.title}: {clp(u.amount)}.</strong> {dueLabel(u.daysUntil)}. Toca para registrar el pago.</span>
        </button>
      ))}


      {notes.length > 0 && (
        <div className="insights" aria-label="Avisos">
          {notes.map(n => n.href
            ? <Link key={n.text} href={n.href} className={`insight ${n.tone}`}>{n.text}</Link>
            : <div key={n.text} className={`insight ${n.tone}`}>{n.text}</div>)}
        </div>
      )}

      <div className="columns">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2 className="h3">Cómo viene la plata</h2>
              <span className="text-muted">Al {shortDate(projection.end.date)}: {clp(projection.end.balance)}</span>
            </div>
            <CashflowChart points={projection.points} low={projection.low} />
            <div className="chart-legend"><span><i className="in" />Entra plata</span><span><i />Pagos</span><span>Toca el gráfico para ver cada día</span></div>
          </section>

          <section className="card">
            <div className="card-head"><h2 className="h3">Vencimientos</h2><span className="text-muted">Tarjetas y créditos</span></div>
            <div className="list">
              {dueDated.length === 0 && <p className="text-muted">No hay vencimientos próximos.</p>}
              {dueDated.slice(0, 6).map(u => (
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

          {monthly.length > 0 && (
            <section className="card">
              <div className="card-head">
                <h2 className="h3">Pendientes del mes</h2>
                <span className="text-muted">Unos {clp(monthly.reduce((s, u) => s + u.amount, 0))}</span>
              </div>
              <p className="text-muted" style={{ marginBottom: '0.2rem' }}>Montos y fechas aproximados. Tócalos cuando los paguen.</p>
              <div className="list">
                {monthly.map(u => (
                  <button key={u.key} className="row" onClick={() => setPaying(u)}>
                    <span className="row-main">
                      <span className="row-title" style={{ display: 'block' }}>{u.title}</span>
                      <span className="row-sub" style={{ display: 'block' }}>{u.detail}</span>
                    </span>
                    <span className="row-end">~{clp(u.amount)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {hasPlan && (
            <section className="card">
              <div className="card-head"><h2 className="h3">Presupuesto del ciclo</h2><span className="text-muted">Gastado {clp(plan.spent)}</span></div>
              <Meter value={plan.spent} max={plan.available} />
              <p className="text-muted" style={{ margin: '0.4rem 0 0.2rem' }}>Con sueldos completos, así se reparte un mes normal.</p>
              <div className="list">
                <div className="row"><span className="row-main">Ingresos</span><span className="row-end pos">{clp(plan.incomeTotal)}</span></div>
                <div className="row"><span className="row-main">Gastos del mes (aprox.)</span><span className="row-end">-{clp(plan.fixedTotal)}</span></div>
                <div className="row"><span className="row-main">Cuotas de deudas</span><span className="row-end">-{clp(plan.installmentsTotal)}</span></div>
                {plan.extraDebt > 0 && <div className="row"><span className="row-main">Abono extra a deudas</span><span className="row-end">-{clp(plan.extraDebt)}</span></div>}
                <div className="row"><span className="row-main"><strong>Para gastar</strong></span><span className="row-end">{clp(plan.available)}</span></div>
              </div>
            </section>
          )}
        </div>

        <div className="stack">
          <div className="tiles">
            <Link href="/debts" className="card tile">
              <div className="tile-label">Deuda total</div>
              <div className="tile-value">{clp(debts.total)}</div>
              <div className="tile-sub">{clp(debts.monthlyInstallments)} en cuotas al mes</div>
            </Link>
            <Link href="/accounts" className="card tile">
              <div className="tile-label">Patrimonio neto</div>
              <div className="tile-value">{clp(debts.netWorth)}</div>
              <div className="tile-sub">Activos {clp(debts.wealth.assets)}</div>
            </Link>
          </div>

          <section className="card">
            <div className="card-head"><h2 className="h3">En qué se ha ido</h2><Link className="card-link" href="/reports">Ver análisis</Link></div>
            {plan.categories.length === 0 && <p className="text-muted">Aún no hay gastos en este ciclo.</p>}
            {plan.categories.slice(0, 6).map(c => (
              <div key={c.id ?? 'none'} className="hbar">
                <span>{c.name}</span>
                <span className="num">{clp(c.total)}{c.limit > 0 ? ` / ${clp(c.limit)}` : ''}</span>
                <Meter value={c.total} max={c.limit > 0 ? c.limit : maxCategory} warnAt={c.limit > 0 ? 0.85 : 2} />
              </div>
            ))}
            {uncategorized > 0 && <Link className="card-link" href="/transactions?category=none">Ordenar lo que está sin categoría</Link>}
          </section>

          <Link href="/import" className="card" style={{ display: 'flex', gap: '0.7rem', alignItems: 'center' }}>
            <Icon name="upload" />
            <span className="row-main">
              <span className="row-title" style={{ display: 'block' }}>Importar cartolas</span>
              <span className="row-sub" style={{ display: 'block' }}>{lastImport ? `Última al ${shortDate(lastImport)}` : 'Sube sus PDF y se ordena solo'}</span>
            </span>
          </Link>
        </div>
      </div>

      {paying && <PaySheet data={data} payment={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

export default function PlanPage() {
  return <WithData>{data => <Month data={data} />}</WithData>;
}
