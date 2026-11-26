'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/dates';
import type { Household, Transaction } from '@/lib/finance';
import { refreshData } from '@/lib/store';
import { Sheet } from './ui';

type TxType = Transaction['type'];
const LAST_ACCOUNT_KEY = 'finanzas:last-account';

function rememberedAccount(): string {
  try { return localStorage.getItem(LAST_ACCOUNT_KEY) ?? ''; } catch { return ''; }
}

export function TransactionSheet({ data, transaction, onClose }: {
  data: Household;
  transaction?: Transaction;
  onClose: () => void;
}) {
  const accounts = useMemo(
    () => data.accounts.filter(a => !a.archived),
    [data.accounts],
  );
  const transferAccounts = useMemo(() => data.accounts.filter(a => !a.archived), [data.accounts]);
  const categories = useMemo(() => {
    const usage = new Map<string, number>();
    for (const t of data.transactions) if (t.budget_id) usage.set(t.budget_id, (usage.get(t.budget_id) ?? 0) + 1);
    return [...data.budgets].sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0));
  }, [data.budgets, data.transactions]);

  const [type, setType] = useState<TxType>(transaction?.type ?? 'expense');
  const [amount, setAmount] = useState(transaction ? String(Math.round(Number(transaction.amount))) : '');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [budgetId, setBudgetId] = useState(transaction?.budget_id ?? '');
  const [date, setDate] = useState(transaction?.date ?? todayISO());
  const [accountId, setAccountId] = useState(() => {
    if (transaction?.account_id) return transaction.account_id;
    const last = rememberedAccount();
    return accounts.some(a => a.id === last) ? last : accounts[0]?.id ?? '';
  });
  const [destinationId, setDestinationId] = useState(transaction?.destination_account_id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const digits = amount.replace(/\D/g, '');
  const display = digits ? Number(digits).toLocaleString('es-CL') : '';
  const selectable = type === 'transfer' ? transferAccounts : accounts;

  async function save(addAnother: boolean) {
    const value = Number(digits);
    if (!value) { setError('Ingresa un monto.'); return; }
    if (!accountId) { setError('Elige una cuenta.'); return; }
    if (type === 'transfer' && (!destinationId || destinationId === accountId)) {
      setError('Elige una cuenta de destino distinta.');
      return;
    }
    const category = data.budgets.find(b => b.id === budgetId);
    const label = description.trim() || category?.name || (type === 'income' ? 'Ingreso' : type === 'transfer' ? 'Traspaso' : 'Gasto');
    const payload = {
      type,
      amount: value,
      description: label,
      date,
      account_id: accountId,
      destination_account_id: type === 'transfer' ? destinationId : null,
      budget_id: type === 'expense' ? budgetId || null : null,
    };
    setSaving(true);
    setError(null);
    const { error: saveError } = transaction
      ? await supabase.from('transactions').update(payload).eq('id', transaction.id)
      : await supabase.from('transactions').insert({ ...payload, user_id: data.userId });
    setSaving(false);
    if (saveError) { setError('No se pudo guardar. Intenta de nuevo.'); return; }
    try { localStorage.setItem(LAST_ACCOUNT_KEY, accountId); } catch { /* preferencia opcional */ }
    void refreshData();
    if (addAnother) {
      setAmount('');
      setDescription('');
      setBudgetId('');
      setSavedCount(c => c + 1);
    } else {
      onClose();
    }
  }

  async function remove() {
    if (!transaction || !window.confirm('¿Eliminar este movimiento?')) return;
    setSaving(true);
    const { error: deleteError } = await supabase.from('transactions').delete().eq('id', transaction.id);
    setSaving(false);
    if (deleteError) {
      setError('No se pudo eliminar. Si es el pago de una cuota, primero revisa esa deuda.');
      return;
    }
    void refreshData();
    onClose();
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void save(false); };

  return (
    <Sheet title={transaction ? 'Editar movimiento' : 'Nuevo movimiento'} onClose={onClose}>
      <form className="form-stack" onSubmit={submit}>
        <div className="segmented" role="tablist" aria-label="Tipo de movimiento">
          {([['expense', 'Gasto'], ['income', 'Ingreso'], ['transfer', 'Traspaso']] as [TxType, string][]).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={type === value} className={type === value ? 'active' : ''} onClick={() => setType(value)}>{label}</button>
          ))}
        </div>

        <input
          className="amount-input"
          inputMode="numeric"
          autoFocus={!transaction}
          placeholder="$0"
          aria-label="Monto"
          value={display ? `$${display}` : ''}
          onChange={e => setAmount(e.target.value)}
        />

        {type === 'expense' && (
          <div className="chips" role="group" aria-label="Categoría">
            {categories.map(c => (
              <button key={c.id} type="button" className={`chip ${budgetId === c.id ? 'active' : ''}`} aria-pressed={budgetId === c.id} onClick={() => setBudgetId(budgetId === c.id ? '' : c.id)}>{c.name}</button>
            ))}
          </div>
        )}

        <div className="input-group">
          <label className="input-label" htmlFor="tx-description">Detalle (opcional)</label>
          <input id="tx-description" className="input-field" value={description} onChange={e => setDescription(e.target.value)} placeholder="Ej. Jumbo" />
        </div>

        <div className="form-row">
          <div className="input-group">
            <label className="input-label" htmlFor="tx-account">{type === 'income' ? 'Entró a' : type === 'transfer' ? 'Desde' : 'Pagado con'}</label>
            <select id="tx-account" className="input-field" value={accountId} onChange={e => setAccountId(e.target.value)}>
              {selectable.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {type === 'transfer' ? (
            <div className="input-group">
              <label className="input-label" htmlFor="tx-destination">Hacia</label>
              <select id="tx-destination" className="input-field" value={destinationId} onChange={e => setDestinationId(e.target.value)}>
                <option value="">Elegir</option>
                {transferAccounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          ) : (
            <div className="input-group">
              <label className="input-label" htmlFor="tx-date">Fecha</label>
              <input id="tx-date" type="date" className="input-field" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
          )}
        </div>
        {type === 'transfer' && (
          <div className="input-group">
            <label className="input-label" htmlFor="tx-date-transfer">Fecha</label>
            <input id="tx-date-transfer" type="date" className="input-field" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
        )}

        {error && <div className="notice danger" role="alert">{error}</div>}
        {savedCount > 0 && !error && <div className="notice ok" role="status">{savedCount === 1 ? '1 movimiento guardado' : `${savedCount} movimientos guardados`}</div>}

        <button type="submit" className="btn-primary btn-block" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
        {transaction ? (
          <button type="button" className="btn-danger btn-block" onClick={() => void remove()} disabled={saving}>Eliminar</button>
        ) : (
          <button type="button" className="btn-secondary btn-block" onClick={() => void save(true)} disabled={saving}>Guardar y agregar otro</button>
        )}
      </form>
    </Sheet>
  );
}
