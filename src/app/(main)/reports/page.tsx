'use client';

import { useMemo } from 'react';
import { Meter, WithData } from '@/components/ui';
import { todayISO } from '@/lib/dates';
import { clp, shortDate } from '@/lib/format';
import { dayOf, isAdjustment, isMarker, type Household } from '@/lib/finance';
import { cycleHistory } from '@/lib/plan';

function Analysis({ data }: { data: Household }) {
  const today = todayISO();
  const cycles = useMemo(
    () => cycleHistory(data, today, 6).filter(c => c.income > 0 || c.expense > 0),
    [data, today],
  );
  const closed = cycles.slice(0, -1);
  const average = closed.length ? closed.reduce((s, c) => s + c.expense, 0) / closed.length : 0;
  const maxExpense = Math.max(1, ...cycles.map(c => c.expense));

  const categories = useMemo(() => {
    const first = cycles[0]?.start ?? today;
    const totals = new Map<string | null, number>();
    for (const t of data.transactions) {
      if (t.type !== 'expense' || isMarker(t) || isAdjustment(t) || dayOf(t) < first) continue;
      totals.set(t.budget_id, (totals.get(t.budget_id) ?? 0) + Number(t.amount));
    }
    const count = Math.max(1, cycles.length);
    return [...totals.entries()]
      .map(([id, total]) => ({ id, name: data.budgets.find(b => b.id === id)?.name ?? 'Sin categoría', total, perCycle: total / count }))
      .sort((a, b) => b.total - a.total);
  }, [data, cycles, today]);

  return (
    <div className="page">
      <h1 className="h1">Análisis</h1>

      <section className="card">
        <div className="card-head">
          <h2 className="h3">Gastos por ciclo</h2>
          {average > 0 && <span className="text-muted">Promedio {clp(average)}</span>}
        </div>
        <div className="cols-bars" role="img" aria-label="Gastos de cada ciclo; el detalle está en la tabla siguiente">
          {cycles.map((c, i) => (
            <div key={c.start} className={`col-bar ${i === cycles.length - 1 ? 'current' : ''}`} title={`${shortDate(c.start)} a ${shortDate(c.end)}: ${clp(c.expense)}`}>
              <i style={{ height: `${(c.expense / maxExpense) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="col-labels">{cycles.map(c => <span key={c.start}>{shortDate(c.start)}</span>)}</div>
      </section>

      <div className="columns">
        <section className="card">
          <h2 className="h3" style={{ marginBottom: '0.3rem' }}>Detalle de ciclos</h2>
          <div className="list">
            {[...cycles].reverse().map(c => (
              <div className="row" key={c.start}>
                <div className="row-main">
                  <div className="row-title">{shortDate(c.start)} a {shortDate(c.end)}</div>
                  <div className="row-sub">Entró {clp(c.income)} · salió {clp(c.expense)}</div>
                </div>
                <div className={`row-end ${c.net >= 0 ? 'pos' : 'neg'}`}>{c.net >= 0 ? '+' : ''}{clp(c.net)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2 className="h3" style={{ marginBottom: '0.3rem' }}>Categorías</h2>
          {categories.map(c => (
            <div className="hbar" key={c.id ?? 'none'}>
              <span>{c.name}</span>
              <span className="num">{clp(c.perCycle)} / ciclo</span>
              <Meter value={c.total} max={categories[0].total} warnAt={2} />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return <WithData>{data => <Analysis data={data} />}</WithData>;
}
