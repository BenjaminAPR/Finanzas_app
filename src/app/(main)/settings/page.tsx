'use client';

import { useState, type FormEvent } from 'react';
import { Icon, Sheet, WithData } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { clp } from '@/lib/format';
import type { Budget, Household, RecurringItem } from '@/lib/finance';
import { refreshData } from '@/lib/store';

function RecurringSheet({ data, item, kind, onClose }: { data: Household; item?: RecurringItem; kind: 'income' | 'expense'; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(item ? String(Math.round(Number(item.amount))) : '');
  const [day, setDay] = useState(String(item?.day_of_month ?? 1));
  const [budgetId, setBudgetId] = useState(item?.budget_id ?? '');
  const [accountId, setAccountId] = useState(item?.account_id ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      kind,
      amount: Number(amount.replace(/\D/g, '')),
      day_of_month: Number(day),
      budget_id: budgetId || null,
      account_id: accountId || null,
    };
    const { error: saveError } = item
      ? await supabase.from('recurring_items').update(payload).eq('id', item.id)
      : await supabase.from('recurring_items').insert(payload);
    if (saveError) { setError('No se pudo guardar.'); return; }
    void refreshData();
    onClose();
  }

  async function remove() {
    if (!item || !window.confirm(`¿Quitar "${item.name}" del plan mensual?`)) return;
    const { error: updateError } = await supabase.from('recurring_items').update({ active: false }).eq('id', item.id);
    if (updateError) { setError('No se pudo quitar.'); return; }
    void refreshData();
    onClose();
  }

  return (
    <Sheet title={kind === 'income' ? 'Ingreso mensual' : 'Gasto del mes'} onClose={onClose}>
      <form className="form-stack" onSubmit={e => void submit(e)}>
        <div className="input-group"><label className="input-label" htmlFor="r-name">Nombre</label><input id="r-name" className="input-field" value={name} onChange={e => setName(e.target.value)} required /></div>
        <div className="form-row">
          <div className="input-group"><label className="input-label" htmlFor="r-amount">Monto aproximado</label><input id="r-amount" className="input-field" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} required /></div>
          <div className="input-group"><label className="input-label" htmlFor="r-day">Día habitual</label><input id="r-day" className="input-field" type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)} required /></div>
        </div>
        {kind === 'expense' && (
          <div className="input-group">
            <label className="input-label" htmlFor="r-budget">Categoría</label>
            <select id="r-budget" className="input-field" value={budgetId} onChange={e => setBudgetId(e.target.value)}>
              <option value="">Sin categoría</option>
              {data.budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div className="input-group">
          <label className="input-label" htmlFor="r-account">Cuenta habitual</label>
          <select id="r-account" className="input-field" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">Sin definir</option>
            {data.accounts.filter(a => a.asset_kind === 'cash').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button className="btn-primary btn-block">Guardar</button>
        {item && <button type="button" className="btn-danger btn-block" onClick={() => void remove()}>Quitar del plan</button>}
      </form>
    </Sheet>
  );
}

function CategorySheet({ data, budget, onClose }: { data: Household; budget?: Budget; onClose: () => void }) {
  const [name, setName] = useState(budget?.name ?? '');
  const [limit, setLimit] = useState(budget && Number(budget.amount) > 0 ? String(Math.round(Number(budget.amount))) : '');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = Number(limit.replace(/\D/g, ''));
    const { error: saveError } = budget
      ? await supabase.from('budgets').update({ name: name.trim(), amount }).eq('id', budget.id)
      : await supabase.from('budgets').insert({ name: name.trim(), amount, user_id: data.userId });
    if (saveError) { setError('No se pudo guardar.'); return; }
    void refreshData();
    onClose();
  }

  return (
    <Sheet title={budget ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <form className="form-stack" onSubmit={e => void submit(e)}>
        <div className="input-group"><label className="input-label" htmlFor="c-name">Nombre</label><input id="c-name" className="input-field" value={name} onChange={e => setName(e.target.value)} required /></div>
        <div className="input-group"><label className="input-label" htmlFor="c-limit">Límite por ciclo (opcional)</label><input id="c-limit" className="input-field" inputMode="numeric" value={limit} onChange={e => setLimit(e.target.value)} /></div>
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button className="btn-primary btn-block">Guardar</button>
      </form>
    </Sheet>
  );
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const text = v === null || v === undefined ? '' : String(v);
    const safe = /^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))].join('\n');
}

function Settings({ data }: { data: Household }) {
  const [cycleDay, setCycleDay] = useState(String(data.settings.cycle_start_day));
  const [names, setNames] = useState(data.settings.own_names.join(', '));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recurring, setRecurring] = useState<{ item?: RecurringItem; kind: 'income' | 'expense' } | null>(null);
  const [category, setCategory] = useState<{ budget?: Budget } | null>(null);
  const active = data.recurring.filter(r => r.active);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    const { error: saveError } = await supabase.from('household_settings').update({
      cycle_start_day: Number(cycleDay),
      own_names: names.split(',').map(n => n.trim()).filter(Boolean),
      updated_at: new Date().toISOString(),
    }).eq('id', true);
    if (saveError) { setError('No se pudo guardar.'); return; }
    setError(null);
    setSaved(true);
    void refreshData();
  }

  function exportCsv() {
    const files: [string, Record<string, unknown>[]][] = [
      ['movimientos', data.transactions], ['cuentas', data.accounts], ['categorias', data.budgets],
      ['deudas', data.debts], ['cuotas', data.installments],
    ];
    for (const [name, rows] of files) {
      if (!rows.length) continue;
      const url = URL.createObjectURL(new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${name}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }

  const recurringList = (kind: 'income' | 'expense') => active.filter(r => r.kind === kind).map(r => (
    <button className="row" key={r.id} onClick={() => setRecurring({ item: r, kind })}>
      <span className="row-main"><span className="row-title" style={{ display: 'block' }}>{r.name}</span><span className="row-sub" style={{ display: 'block' }}>Día {r.day_of_month}</span></span>
      <span className="row-end">{clp(Number(r.amount))}</span>
    </button>
  ));

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <h1 className="h1">Ajustes</h1>

      <section className="card">
        <div className="card-head"><h2 className="h3">Ingresos mensuales</h2><button className="btn-secondary btn-small" onClick={() => setRecurring({ kind: 'income' })}><Icon name="plus" size={15} />Agregar</button></div>
        <div className="list">{recurringList('income')}</div>
      </section>

      <section className="card">
        <div className="card-head"><h2 className="h3">Gastos del mes</h2><button className="btn-secondary btn-small" onClick={() => setRecurring({ kind: 'expense' })}><Icon name="plus" size={15} />Agregar</button></div>
        <div className="list">{recurringList('expense')}</div>
      </section>

      <section className="card">
        <div className="card-head"><h2 className="h3">Categorías y límites</h2><button className="btn-secondary btn-small" onClick={() => setCategory({})}><Icon name="plus" size={15} />Agregar</button></div>
        <div className="list">
          {data.budgets.map(b => (
            <button className="row" key={b.id} onClick={() => setCategory({ budget: b })}>
              <span className="row-main row-title">{b.name}</span>
              <span className="row-end">{Number(b.amount) > 0 ? clp(Number(b.amount)) : <small>Sin límite</small>}</span>
            </button>
          ))}
        </div>
      </section>

      <form className="card form-stack" onSubmit={e => void saveSettings(e)}>
        <h2 className="h3">Hogar</h2>
        <div className="input-group">
          <label className="input-label" htmlFor="s-day">El ciclo parte el día</label>
          <input id="s-day" className="input-field" type="number" min="1" max="28" value={cycleDay} onChange={e => { setCycleDay(e.target.value); setSaved(false); }} />
        </div>
        <div className="input-group">
          <label className="input-label" htmlFor="s-names">Sus nombres en las cartolas, separados por coma</label>
          <input id="s-names" className="input-field" value={names} onChange={e => { setNames(e.target.value); setSaved(false); }} />
          <span className="text-muted">Sirve para no contar como gasto los traspasos entre ustedes.</span>
        </div>
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button className="btn-primary" disabled={saved}>{saved ? 'Guardado' : 'Guardar'}</button>
      </form>

      <section className="card">
        <h2 className="h3" style={{ marginBottom: '0.3rem' }}>Respaldo</h2>
        <p className="text-muted" style={{ marginBottom: '0.7rem' }}>Descarga todos sus datos en archivos CSV para Excel o Google Sheets.</p>
        <button className="btn-secondary" onClick={exportCsv}>Descargar CSV</button>
      </section>

      {recurring && <RecurringSheet data={data} item={recurring.item} kind={recurring.kind} onClose={() => setRecurring(null)} />}
      {category && <CategorySheet data={data} budget={category.budget} onClose={() => setCategory(null)} />}
    </div>
  );
}

export default function SettingsPage() {
  return <WithData>{data => <Settings data={data} />}</WithData>;
}
