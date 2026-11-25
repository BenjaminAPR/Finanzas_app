'use client';

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import type { Household, Period } from '@/lib/finance';
import type { BudgetLine } from '@/lib/period';
import { refreshData } from '@/lib/store';
import { Sheet } from './ui';

const digits = (s: string) => Number(s.replace(/\D/g, ''));

export function BudgetSheet({ data, period, line, onClose }: { data: Household; period: Period; line?: BudgetLine; onClose: () => void }) {
  const used = new Set(data.periodBudgets.filter(b => b.period_id === period.id).map(b => b.budget_id));
  const available = data.budgets.filter(b => !used.has(b.id));
  const [categoryId, setCategoryId] = useState(line?.budgetId ?? available[0]?.id ?? 'new');
  const [newName, setNewName] = useState('');
  const [amount, setAmount] = useState(line ? String(Math.round(line.amount)) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = digits(amount);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value) { setError('Ingresa un monto.'); return; }
    setSaving(true);
    setError(null);
    let budgetId = categoryId;
    if (!line && categoryId === 'new') {
      if (!newName.trim()) { setSaving(false); setError('Ponle nombre a la categoría.'); return; }
      const { data: created, error: createError } = await supabase
        .from('budgets')
        .insert({ name: newName.trim(), amount: 0, user_id: data.userId })
        .select('id')
        .single();
      if (createError || !created) { setSaving(false); setError('No se pudo crear la categoría.'); return; }
      budgetId = created.id;
    }
    const { error: saveError } = line
      ? await supabase.from('period_budgets').update({ amount: value }).eq('id', line.id)
      : await supabase.from('period_budgets').insert({ period_id: period.id, budget_id: budgetId, amount: value });
    setSaving(false);
    if (saveError) { setError('No se pudo guardar.'); return; }
    void refreshData();
    onClose();
  }

  async function remove() {
    if (!line || !window.confirm(`¿Quitar el presupuesto de ${line.name} de este período? Sus gastos no se borran.`)) return;
    const { error: deleteError } = await supabase.from('period_budgets').delete().eq('id', line.id);
    if (deleteError) { setError('No se pudo quitar.'); return; }
    void refreshData();
    onClose();
  }

  return (
    <Sheet title={line ? `Presupuesto de ${line.name}` : 'Nuevo presupuesto'} onClose={onClose}>
      <form className="form-stack" onSubmit={e => void submit(e)}>
        {!line && (
          <div className="input-group">
            <label className="input-label" htmlFor="b-cat">Categoría</label>
            <select id="b-cat" className="input-field" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              {available.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value="new">Nueva categoría…</option>
            </select>
          </div>
        )}
        {!line && categoryId === 'new' && (
          <div className="input-group">
            <label className="input-label" htmlFor="b-name">Nombre</label>
            <input id="b-name" className="input-field" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej. Luz" />
          </div>
        )}
        <label className="input-label" htmlFor="b-amount">Cuánto quieren gastar en este período</label>
        <input id="b-amount" className="amount-input" inputMode="numeric" autoFocus value={value ? `$${value.toLocaleString('es-CL')}` : ''} placeholder="$0" onChange={e => setAmount(e.target.value)} />
        {line && <p className="text-muted">Llevan gastado ${Math.round(line.spent).toLocaleString('es-CL')} en este período.</p>}
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button className="btn-primary btn-block" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        {line && <button type="button" className="btn-danger btn-block" onClick={() => void remove()}>Quitar presupuesto</button>}
      </form>
    </Sheet>
  );
}

export function PeriodSheet({ data, period, suggested, onClose }: {
  data: Household;
  period?: Period;
  suggested: { start: string; end: string };
  onClose: () => void;
}) {
  const [start, setStart] = useState(period?.start_date ?? suggested.start);
  const [end, setEnd] = useState(period?.end_date ?? suggested.end);
  const [copy, setCopy] = useState(!period);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previous = [...data.periods].sort((a, b) => a.start_date.localeCompare(b.start_date)).at(-1);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (end < start) { setError('El fin debe ser después del inicio.'); return; }
    setSaving(true);
    setError(null);
    if (period) {
      const { error: updateError } = await supabase.from('periods').update({ start_date: start, end_date: end }).eq('id', period.id);
      setSaving(false);
      if (updateError) { setError('No se pudo guardar.'); return; }
    } else {
      const { data: created, error: createError } = await supabase
        .from('periods')
        .insert({ start_date: start, end_date: end })
        .select('id')
        .single();
      if (createError || !created) { setSaving(false); setError('No se pudo crear el período.'); return; }
      if (copy && previous) {
        const rows = data.periodBudgets
          .filter(b => b.period_id === previous.id)
          .map(b => ({ period_id: created.id, budget_id: b.budget_id, amount: b.amount }));
        if (rows.length) {
          const { error: copyError } = await supabase.from('period_budgets').insert(rows);
          if (copyError) { setSaving(false); setError('Se creó el período, pero no se copiaron los presupuestos.'); return; }
        }
      }
      setSaving(false);
    }
    void refreshData();
    onClose();
  }

  return (
    <Sheet title={period ? 'Editar período' : 'Nuevo período'} onClose={onClose}>
      <form className="form-stack" onSubmit={e => void submit(e)}>
        <p className="text-muted">Por ejemplo, de sueldo a sueldo. Los presupuestos se miden entre estas fechas.</p>
        <div className="form-row">
          <div className="input-group"><label className="input-label" htmlFor="p-start">Inicio</label><input id="p-start" type="date" className="input-field" value={start} onChange={e => setStart(e.target.value)} required /></div>
          <div className="input-group"><label className="input-label" htmlFor="p-end">Fin</label><input id="p-end" type="date" className="input-field" value={end} onChange={e => setEnd(e.target.value)} required /></div>
        </div>
        {!period && previous && (
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.92rem' }}>
            <input type="checkbox" checked={copy} onChange={e => setCopy(e.target.checked)} />
            Copiar los presupuestos del período anterior
          </label>
        )}
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button className="btn-primary btn-block" disabled={saving}>{saving ? 'Guardando…' : period ? 'Guardar' : 'Crear período'}</button>
      </form>
    </Sheet>
  );
}
