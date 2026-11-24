'use client';

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/dates';
import { clp, shortDate } from '@/lib/format';
import type { Household } from '@/lib/finance';
import type { UpcomingPayment } from '@/lib/plan';
import { refreshData } from '@/lib/store';
import { Sheet } from './ui';

export function PaySheet({ data, payment, onClose }: { data: Household; payment: UpcomingPayment; onClose: () => void }) {
  const accounts = data.accounts.filter(a => !a.archived && a.asset_kind === 'cash');
  const [amount, setAmount] = useState(String(Math.round(payment.amount)));
  const [accountId, setAccountId] = useState(payment.recurring?.account_id ?? accounts[0]?.id ?? '');
  const [date, setDate] = useState(todayISO());
  const [noAccount, setNoAccount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = Number(amount.replace(/\D/g, ''));
  const allowNoAccount = payment.kind === 'installment';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value) { setError('Ingresa un monto.'); return; }
    if (!accountId && !noAccount) { setError('Elige una cuenta.'); return; }
    setSaving(true);
    setError(null);
    let failure: unknown = null;
    if (payment.kind === 'statement') {
      const { error: rpcError } = await supabase.rpc('pay_card_statement', {
        p_statement: payment.statement!.id, p_from_account: accountId, p_amount: value, p_date: date,
      });
      failure = rpcError;
    } else if (payment.kind === 'installment') {
      const { error: rpcError } = await supabase.rpc('pay_installment', {
        p_installment: payment.installment!.id, p_account: noAccount ? null : accountId, p_amount: value, p_date: date,
      });
      failure = rpcError;
    } else {
      const { error: insertError } = await supabase.from('transactions').insert({
        type: 'expense',
        amount: value,
        description: payment.title,
        date,
        account_id: accountId,
        budget_id: payment.recurring?.budget_id ?? null,
        recurring_id: payment.recurring?.id,
        user_id: data.userId,
      });
      failure = insertError;
    }
    setSaving(false);
    if (failure) { setError('No se pudo registrar el pago. Intenta de nuevo.'); return; }
    void refreshData();
    onClose();
  }

  return (
    <Sheet title={`Registrar pago: ${payment.title}`} onClose={onClose}>
      <form className="form-stack" onSubmit={e => void submit(e)}>
        <p className="text-muted">{payment.detail} · vence {shortDate(payment.date)}. Esto solo lo anota en la app, no mueve dinero de tu banco.</p>

        <input
          className="amount-input"
          inputMode="numeric"
          aria-label="Monto pagado"
          value={value ? `$${value.toLocaleString('es-CL')}` : ''}
          onChange={e => setAmount(e.target.value)}
        />

        {payment.minimum !== undefined && (
          <div className="chips" role="group" aria-label="Montos sugeridos">
            <button type="button" className={`chip ${value === Math.round(payment.amount) ? 'active' : ''}`} onClick={() => setAmount(String(Math.round(payment.amount)))}>Total {clp(payment.amount)}</button>
            <button type="button" className={`chip ${value === Math.round(payment.minimum) ? 'active' : ''}`} onClick={() => setAmount(String(Math.round(payment.minimum!)))}>Mínimo {clp(payment.minimum)}</button>
          </div>
        )}

        {!noAccount && (
          <div className="input-group">
            <label className="input-label" htmlFor="pay-account">Pagado desde</label>
            <select id="pay-account" className="input-field" value={accountId} onChange={e => setAccountId(e.target.value)}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {allowNoAccount && (
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.9rem' }}>
            <input type="checkbox" checked={noAccount} onChange={e => setNoAccount(e.target.checked)} />
            Ya estaba pagada, no descontar de ninguna cuenta
          </label>
        )}

        <div className="input-group">
          <label className="input-label" htmlFor="pay-date">Fecha de pago</label>
          <input id="pay-date" type="date" className="input-field" value={date} onChange={e => setDate(e.target.value)} required />
        </div>

        {error && <div className="notice danger" role="alert">{error}</div>}
        <button type="submit" className="btn-primary btn-block" disabled={saving}>{saving ? 'Guardando…' : 'Registrar pago'}</button>
      </form>
    </Sheet>
  );
}
