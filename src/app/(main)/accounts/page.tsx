'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Icon, Sheet, WithData } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/dates';
import { clp, shortDate } from '@/lib/format';
import type { AccountWithBalance, AssetKind, Household } from '@/lib/finance';
import { debtOverview } from '@/lib/plan';
import { refreshData } from '@/lib/store';

const KIND_TYPE: Record<AssetKind, string> = {
  cash: 'Cuenta Corriente',
  deposit: 'Cuenta de Ahorro',
  investment: 'Cuenta de Ahorro',
  card: 'Tarjeta de Crédito',
};
const GROUPS: { kind: AssetKind; title: string }[] = [
  { kind: 'cash', title: 'Disponible' },
  { kind: 'deposit', title: 'Ahorro y depósitos' },
  { kind: 'investment', title: 'Inversiones' },
  { kind: 'card', title: 'Tarjetas' },
];

function BalanceSheet({ account, onClose }: { account: AccountWithBalance; onClose: () => void }) {
  const isCard = account.asset_kind === 'card';
  const [value, setValue] = useState(String(Math.abs(Math.round(account.balance))));
  const [maturity, setMaturity] = useState(account.maturity_date ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(value.replace(/\D/g, ''));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error: updateError } = await supabase.from('accounts').update({
      anchor_balance: isCard ? -amount : amount,
      anchor_date: todayISO(),
      anchor_set_at: new Date().toISOString(),
      maturity_date: account.asset_kind === 'deposit' ? maturity || null : account.maturity_date ?? null,
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
            <label className="input-label" htmlFor="maturity">Fecha de vencimiento</label>
            <input id="maturity" type="date" className="input-field" value={maturity} onChange={e => setMaturity(e.target.value)} />
          </div>
        )}
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button className="btn-primary btn-block" disabled={saving}>{saving ? 'Guardando…' : 'Guardar saldo'}</button>
      </form>
    </Sheet>
  );
}

function NewAccountSheet({ data, onClose }: { data: Household; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>('cash');
  const [institution, setInstitution] = useState('');
  const [owner, setOwner] = useState('');
  const [balance, setBalance] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amount = Number(balance.replace(/\D/g, ''));
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
    });
    if (insertError) { setError('No se pudo crear la cuenta.'); return; }
    void refreshData();
    onClose();
  }

  return (
    <Sheet title="Nueva cuenta o inversión" onClose={onClose}>
      <form className="form-stack" onSubmit={e => void submit(e)}>
        <div className="input-group"><label className="input-label" htmlFor="a-name">Nombre</label><input id="a-name" className="input-field" value={name} onChange={e => setName(e.target.value)} required /></div>
        <div className="input-group">
          <label className="input-label" htmlFor="a-kind">Tipo</label>
          <select id="a-kind" className="input-field" value={kind} onChange={e => setKind(e.target.value as AssetKind)}>
            <option value="cash">Cuenta o efectivo</option>
            <option value="deposit">Ahorro o depósito a plazo</option>
            <option value="investment">Inversión</option>
            <option value="card">Tarjeta de crédito</option>
          </select>
        </div>
        <div className="form-row">
          <div className="input-group"><label className="input-label" htmlFor="a-inst">Institución</label><input id="a-inst" className="input-field" value={institution} onChange={e => setInstitution(e.target.value)} /></div>
          <div className="input-group"><label className="input-label" htmlFor="a-owner">De quién</label><input id="a-owner" className="input-field" value={owner} onChange={e => setOwner(e.target.value)} /></div>
        </div>
        <div className="input-group"><label className="input-label" htmlFor="a-balance">{kind === 'card' ? 'Deuda actual' : 'Saldo actual'}</label><input id="a-balance" className="input-field" inputMode="numeric" value={balance} onChange={e => setBalance(e.target.value)} /></div>
        {error && <div className="notice danger" role="alert">{error}</div>}
        <button className="btn-primary btn-block">Crear</button>
      </form>
    </Sheet>
  );
}

function Wealth({ data }: { data: Household }) {
  const today = todayISO();
  const overview = useMemo(() => debtOverview(data, today), [data, today]);
  const { wealth } = overview;
  const [editing, setEditing] = useState<AccountWithBalance | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Patrimonio</h1>
        <button className="btn-primary btn-small" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Agregar</button>
      </div>

      <section className="card hero">
        <div className="hero-label">Patrimonio neto del hogar</div>
        <div className="hero-value">{clp(overview.netWorth)}</div>
        <div className="hero-sub">Tienen {clp(wealth.assets)} y deben {clp(overview.total)}</div>
      </section>

      <div className="tiles four">
        <div className="card"><div className="tile-label">Disponible</div><div className="tile-value">{clp(wealth.cash)}</div></div>
        <div className="card"><div className="tile-label">Ahorro</div><div className="tile-value">{clp(wealth.deposits)}</div></div>
        <div className="card"><div className="tile-label">Inversiones</div><div className="tile-value">{clp(wealth.investments)}</div></div>
        <Link href="/debts" className="card"><div className="tile-label">Deudas</div><div className="tile-value">{clp(overview.total)}</div></Link>
      </div>

      {GROUPS.map(group => {
        const items = wealth.items.filter(a => a.asset_kind === group.kind);
        if (!items.length) return null;
        return (
          <section className="card" key={group.kind}>
            <h2 className="h3" style={{ marginBottom: '0.3rem' }}>{group.title}</h2>
            <div className="list">
              {items.map(a => (
                <button key={a.id} className="row" onClick={() => setEditing(a)}>
                  <span className="row-main">
                    <span className="row-title" style={{ display: 'block' }}>{a.name}</span>
                    <span className="row-sub" style={{ display: 'block' }}>
                      {[a.institution, a.owner_label].filter(Boolean).join(' · ') || a.type}
                      {a.maturity_date ? ` · vence ${shortDate(a.maturity_date)}` : ''}
                    </span>
                  </span>
                  <span className="row-end">
                    {clp(a.asset_kind === 'card' ? Math.max(0, -a.balance) : a.balance)}
                    <small>{a.anchor_date ? `Al ${shortDate(a.anchor_date)}` : 'Sin confirmar'}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {editing && <BalanceSheet account={editing} onClose={() => setEditing(null)} />}
      {adding && <NewAccountSheet data={data} onClose={() => setAdding(false)} />}
    </div>
  );
}

export default function AccountsPage() {
  return <WithData>{data => <Wealth data={data} />}</WithData>;
}
