'use client';

import { useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/dates';
import type { AccountWithBalance, AssetKind, Household } from '@/lib/finance';
import { refreshData } from '@/lib/store';
import { Sheet } from './ui';

const KIND_TYPE: Record<AssetKind, string> = {
  cash: 'Cuenta Corriente',
  deposit: 'Cuenta de Ahorro',
  investment: 'Cuenta de Ahorro',
  card: 'Tarjeta de Crédito',
};

const digits = (s: string) => Number(s.replace(/\D/g, ''));

export function BalanceSheet({ account, onClose }: { account: AccountWithBalance; onClose: () => void }) {
  const isCard = account.asset_kind === 'card';
  const [value, setValue] = useState(String(Math.abs(Math.round(account.balance))));
  const [maturity, setMaturity] = useState(account.maturity_date ?? '');
  const [limit, setLimit] = useState(account.credit_limit ? String(Math.round(Number(account.credit_limit))) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = digits(value);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error: updateError } = await supabase.from('accounts').update({
      anchor_balance: isCard ? -amount : amount,
      anchor_date: todayISO(),
      anchor_set_at: new Date().toISOString(),
      maturity_date: account.asset_kind === 'deposit' ? maturity || null : account.maturity_date ?? null,
      credit_limit: isCard ? (limit ? digits(limit) : null) : account.credit_limit ?? null,
    }).eq('id', account.id);
    setSaving(false);
    if (updateError) { setError('No se pudo actualizar.'); return; }
    void refreshData();
    onClose();
  }

  return (
    <Sheet title={`Actualizar ${account.name}`} onClose={onClose}>
      <form className="form-stack" onSubmit={e => void submit(e)}>
        <p className="text-muted">{isCard ? 'Escribe cuánto debes hoy en esta tarjeta.' : 'Escribe el saldo real de hoy.'} Desde ahora la app parte de este número.</p>
        <input className="amount-input" inputMode="numeric" aria-label="Saldo" value={amount ? `$${amount.toLocaleString('es-CL')}` : '$0'} onChange={e => setValue(e.target.value)} />
        {account.asset_kind === 'deposit' && (
          <div className="input-group">
            <label className="input-label" htmlFor="maturity">Fecha de vencimiento (si es depósito a plazo)</label>
            <input id="maturity" type="date" className="input-field" value={maturity} onChange={e => setMaturity(e.target.value)} />
          </div>
        )}
        {isCard && (
          <div className="input-group">
            <label className="input-label" htmlFor="limit">Cupo total de la tarjeta</label>
            <input id="limit" className="input-field" inputMode="numeric" value={limit} onChange={e => setLimit(e.target.value)} />
          </div>
        )}
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button className="btn-primary btn-block" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Sheet>
  );
}

export function NewAccountSheet({ data, onClose }: { data: Household; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>('cash');
  const [institution, setInstitution] = useState('');
  const [owner, setOwner] = useState('');
  const [balance, setBalance] = useState('');
  const [limit, setLimit] = useState('');
  const [maturity, setMaturity] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = digits(balance);
    const { error: insertError } = await supabase.from('accounts').insert({
      name: name.trim(),
      type: KIND_TYPE[kind],
      asset_kind: kind,
      institution: institution.trim() || null,
      owner_label: owner.trim() || null,
      user_id: data.userId,
      anchor_balance: kind === 'card' ? -amount : amount,
      anchor_date: todayISO(),
      anchor_set_at: new Date().toISOString(),
      credit_limit: kind === 'card' && limit ? digits(limit) : null,
      maturity_date: kind === 'deposit' && maturity ? maturity : null,
    });
    if (insertError) { setError('No se pudo crear.'); return; }
    void refreshData();
    onClose();
  }

  return (
    <Sheet title="Agregar a la billetera" onClose={onClose}>
      <form className="form-stack" onSubmit={e => void submit(e)}>
        <div className="segmented" role="tablist" aria-label="Tipo">
          {([['cash', 'Cuenta'], ['deposit', 'Ahorro/DAP'], ['investment', 'Inversión'], ['card', 'Tarjeta']] as [AssetKind, string][]).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={kind === value} className={kind === value ? 'active' : ''} onClick={() => setKind(value)}>{label}</button>
          ))}
        </div>
        <div className="input-group"><label className="input-label" htmlFor="a-name">Nombre</label><input id="a-name" className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder={kind === 'card' ? 'Ej. Visa Banco de Chile' : 'Ej. Cuenta RUT'} required /></div>
        <div className="form-row">
          <div className="input-group"><label className="input-label" htmlFor="a-inst">Institución</label><input id="a-inst" className="input-field" value={institution} onChange={e => setInstitution(e.target.value)} /></div>
          <div className="input-group"><label className="input-label" htmlFor="a-owner">De quién</label><input id="a-owner" className="input-field" value={owner} onChange={e => setOwner(e.target.value)} placeholder="Hogar" /></div>
        </div>
        <div className="input-group"><label className="input-label" htmlFor="a-balance">{kind === 'card' ? 'Deuda actual' : 'Saldo actual'}</label><input id="a-balance" className="input-field" inputMode="numeric" value={balance} onChange={e => setBalance(e.target.value)} /></div>
        {kind === 'card' && <div className="input-group"><label className="input-label" htmlFor="a-limit">Cupo total</label><input id="a-limit" className="input-field" inputMode="numeric" value={limit} onChange={e => setLimit(e.target.value)} /></div>}
        {kind === 'deposit' && <div className="input-group"><label className="input-label" htmlFor="a-maturity">Vence (si es DAP)</label><input id="a-maturity" type="date" className="input-field" value={maturity} onChange={e => setMaturity(e.target.value)} /></div>}
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button className="btn-primary btn-block">Agregar</button>
      </form>
    </Sheet>
  );
}
