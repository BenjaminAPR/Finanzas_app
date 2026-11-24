'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon, Meter, WithData } from '@/components/ui';
import { PaySheet } from '@/components/PaySheet';
import { todayISO } from '@/lib/dates';
import { clp, dueLabel, shortDate } from '@/lib/format';
import { dayOf, type Household } from '@/lib/finance';
import { buildPlan, debtOverview, type UpcomingPayment } from '@/lib/plan';

function Dashboard({ data }: { data: Household }) {
  const today = todayISO();
  const plan = useMemo(() => buildPlan(data, today), [data, today]);
  const debts = useMemo(() => debtOverview(data, today), [data, today]);
  const [paying, setPaying] = useState<UpcomingPayment | null>(null);

  const urgent = plan.upcoming.filter(u => u.daysUntil <= 2);
  const lastImport = data.transactions.filter(t => t.source === 'import').map(dayOf).sort().at(-1);
  const hasPlan = plan.incomeTotal > 0;
  const maxCategory = plan.categories[0]?.total ?? 0;
  const uncategorized = plan.categories.find(c => c.id === null)?.total ?? 0;

  return (
    <div className="page">
      <section className="card hero" aria-label="Disponible para gastar">
        <div className="hero-label">Pueden gastar hasta el {shortDate(plan.cycle.end)}</div>
        <div className="hero-value">{hasPlan ? clp(plan.remaining) : '—'}</div>
        {hasPlan ? (
          <>
            <div className="hero-sub">
              {plan.remaining > 0 ? `Unos ${clp(plan.perDay)} al día por ${plan.cycle.daysLeft} días` : 'Ya se pasaron de lo planificado en este ciclo'}
            </div>
            <Meter value={plan.spent} max={plan.available} warnAt={2} />
            <div className="hero-foot"><span>Gastado {clp(plan.spent)}</span><span>Plan {clp(plan.available)}</span></div>
          </>
        ) : (
          <div className="hero-sub">Agrega sus ingresos y gastos fijos en Ajustes para calcularlo.</div>
        )}
      </section>

      {urgent.map(u => (
        <button key={u.key} className={`notice ${u.overdue ? 'danger' : ''}`} style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => setPaying(u)}>
          <Icon name="alert" size={18} />
          <span><strong>{u.title}: {clp(u.amount)}.</strong> {dueLabel(u.daysUntil)}. Toca para registrar el pago.</span>
        </button>
      ))}

      {hasPlan && plan.cashAfterPayments < 0 && (
        <div className="notice"><Icon name="alert" size={18} /><span>Con el dinero disponible y los ingresos pendientes faltan <strong>{clp(-plan.cashAfterPayments)}</strong> para cubrir los pagos de este ciclo.</span></div>
      )}

      <div className="columns">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2 className="h3">Próximos pagos</h2><span className="text-muted">{clp(plan.dueInCycle)} este ciclo</span></div>
            <div className="list">
              {plan.upcoming.length === 0 && <p className="text-muted">No hay pagos pendientes.</p>}
              {plan.upcoming.slice(0, 7).map(u => (
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

          {hasPlan && (
            <section className="card">
              <h2 className="h3" style={{ marginBottom: '0.5rem' }}>Cómo se reparte el ciclo</h2>
              <div className="list">
                <div className="row"><span className="row-main">Ingresos</span><span className="row-end pos">{clp(plan.incomeTotal)}</span></div>
                <div className="row"><span className="row-main">Gastos fijos</span><span className="row-end">-{clp(plan.fixedTotal)}</span></div>
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

export default function DashboardPage() {
  return <WithData>{data => <Dashboard data={data} />}</WithData>;
}
