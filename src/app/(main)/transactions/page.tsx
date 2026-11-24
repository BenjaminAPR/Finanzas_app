'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Icon, WithData } from '@/components/ui';
import { TransactionSheet } from '@/components/TransactionSheet';
import { useQuickAdd } from '@/components/AppShell';
import { clp, longDate } from '@/lib/format';
import { dayOf, normalize, visibleTransactions, type Household, type Transaction } from '@/lib/finance';

const PAGE_STEP = 80;

function Movements({ data }: { data: Household }) {
  const params = useSearchParams();
  const openAdd = useQuickAdd();
  const [search, setSearch] = useState('');
  const [accountId, setAccountId] = useState(params.get('account') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? params.get('budget') ?? '');
  const [limit, setLimit] = useState(PAGE_STEP);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const accountName = useMemo(() => new Map(data.accounts.map(a => [a.id, a.name])), [data.accounts]);
  const budgetName = useMemo(() => new Map(data.budgets.map(b => [b.id, b.name])), [data.budgets]);
  const all = useMemo(() => visibleTransactions(data.transactions), [data.transactions]);

  const filtered = useMemo(() => {
    const query = normalize(search);
    return all.filter(t => {
      if (accountId && t.account_id !== accountId && t.destination_account_id !== accountId) return false;
      if (category === 'none' && (t.type !== 'expense' || t.budget_id)) return false;
      if (category && category !== 'none' && t.budget_id !== category) return false;
      return !query || normalize(t.description ?? '').includes(query);
    });
  }, [all, search, accountId, category]);

  const groups = useMemo(() => {
    const byDay = new Map<string, Transaction[]>();
    for (const t of filtered.slice(0, limit)) {
      const day = dayOf(t);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(t);
    }
    return [...byDay.entries()];
  }, [filtered, limit]);

  const total = filtered.reduce((s, t) => s + (t.type === 'expense' ? Number(t.amount) : 0), 0);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Movimientos</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link href="/import" className="btn-secondary btn-small"><Icon name="upload" size={16} />Importar</Link>
          <button className="btn-primary btn-small" onClick={openAdd}><Icon name="plus" size={16} />Agregar</button>
        </div>
      </div>

      <input className="input-field" type="search" placeholder="Buscar" aria-label="Buscar movimientos" value={search} onChange={e => setSearch(e.target.value)} />

      <div className="form-row">
        <select className="input-field" aria-label="Filtrar por cuenta" value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">Todas las cuentas</option>
          {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="input-field" aria-label="Filtrar por categoría" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Todas las categorías</option>
          <option value="none">Sin categoría</option>
          {data.budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      <p className="text-muted">{filtered.length} movimientos · {clp(total)} en gastos</p>

      <section className="card" style={{ paddingTop: '0.3rem' }}>
        {groups.length === 0 && <p className="text-muted" style={{ padding: '0.7rem 0' }}>No hay movimientos con estos filtros.</p>}
        {groups.map(([day, items]) => (
          <div key={day}>
            <div className="day-title">{longDate(day)}</div>
            <div className="list">
              {items.map(t => (
                <button key={t.id} className="row" onClick={() => setEditing(t)}>
                  <span className="row-main">
                    <span className="row-title" style={{ display: 'block' }}>{t.description}</span>
                    <span className="row-sub" style={{ display: 'block' }}>
                      {t.type === 'transfer'
                        ? `${accountName.get(t.account_id ?? '') ?? '?'} → ${accountName.get(t.destination_account_id ?? '') ?? '?'}`
                        : accountName.get(t.account_id ?? '') ?? 'Sin cuenta'}
                      {t.budget_id ? ` · ${budgetName.get(t.budget_id) ?? ''}` : ''}
                    </span>
                  </span>
                  <span className={`row-end ${t.type === 'income' ? 'pos' : ''}`}>
                    {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}{clp(Number(t.amount))}
                    {t.type === 'expense' && !t.budget_id && <small><span className="badge warn">Sin categoría</span></small>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {filtered.length > limit && (
        <button className="btn-secondary" onClick={() => setLimit(l => l + PAGE_STEP)}>Ver más</button>
      )}

      {editing && <TransactionSheet data={data} transaction={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense>
      <WithData>{data => <Movements data={data} />}</WithData>
    </Suspense>
  );
}
