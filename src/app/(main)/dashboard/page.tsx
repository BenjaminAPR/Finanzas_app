'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon, WithData } from '@/components/ui';
import { WalletCard } from '@/components/WalletCard';
import { NewAccountSheet } from '@/components/AccountSheets';
import { PaySheet } from '@/components/PaySheet';
import { todayISO } from '@/lib/dates';
import { clp, dueLabel, monthYear } from '@/lib/format';
import type { AssetKind, Household } from '@/lib/finance';
import { buildPlan, type UpcomingPayment } from '@/lib/plan';
import { walletSummary } from '@/lib/wallet';

const GROUPS: { kind: AssetKind; title: string; total: 'cash' | 'savings' | 'investments' | 'cardDebt' }[] = [
  { kind: 'cash', title: 'Cuentas', total: 'cash' },
  { kind: 'deposit', title: 'Ahorro y DAP', total: 'savings' },
  { kind: 'investment', title: 'Inversiones', total: 'investments' },
  { kind: 'card', title: 'Tarjetas de crédito', total: 'cardDebt' },
];

function Wallet({ data }: { data: Household }) {
  const today = todayISO();
  const wallet = useMemo(() => walletSummary(data, today), [data, today]);
  const plan = useMemo(() => buildPlan(data, today), [data, today]);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<UpcomingPayment | null>(null);
  const urgent = plan.upcoming.filter(u => !u.flexible && u.daysUntil <= 3);

  return (
    <div className="page">
      <section className="card hero wallet-hero" aria-label="Resumen de la billetera">
        <div className="hero-label">Patrimonio neto</div>
        <div className="hero-value">{clp(wallet.net)}</div>
        <div className="wallet-split">
          <div><span>Tienen</span><strong>{clp(wallet.have)}</strong></div>
          <div><span>Deben</span><strong>{clp(wallet.owe)}</strong></div>
        </div>
      </section>

      {urgent.map(u => (
        <button key={u.key} className={`notice ${u.overdue ? 'danger' : ''}`} style={{ border: 0, textAlign: 'left', width: '100%' }} onClick={() => setPaying(u)}>
          <Icon name="alert" size={18} />
          <span><strong>{u.title}: {clp(u.amount)}.</strong> {dueLabel(u.daysUntil)}. Toca para registrar el pago.</span>
        </button>
      ))}

      {GROUPS.map(group => {
        const items = wallet.accounts.filter(a => a.asset_kind === group.kind);
        if (!items.length) return null;
        return (
          <section key={group.kind} aria-label={group.title}>
            <div className="wallet-head">
              <h2 className="h3">{group.title}</h2>
              <span className="num">{group.kind === 'card' ? 'Deben ' : ''}{clp(wallet[group.total])}</span>
            </div>
            <div className="wallet-grid">
              {items.map(a => <WalletCard key={a.id} account={a} today={today} />)}
            </div>
          </section>
        );
      })}

      {wallet.standalone.length > 0 && (
        <section aria-label="Créditos y deudas">
          <div className="wallet-head">
            <h2 className="h3">Créditos y deudas</h2>
            <span className="num">Deben {clp(wallet.standaloneDebt)}</span>
          </div>
          <div className="card" style={{ paddingTop: '0.3rem' }}>
            <div className="list">
              {wallet.standalone.map(item => (
                <Link key={item.debt.id} href="/debts" className="row">
                  <span className="row-main">
                    <span className="row-title" style={{ display: 'block' }}>{item.debt.name}{item.debt.creditor ? ` · ${item.debt.creditor}` : ''}</span>
                    <span className="row-sub" style={{ display: 'block' }}>
                      {item.pendingCount} cuotas de {clp(item.monthly)}{item.endDate ? ` · termina ${monthYear(item.endDate)}` : ''}
                    </span>
                  </span>
                  <span className="row-end">{clp(item.remaining)}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="wallet-actions">
        <button className="btn-secondary" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Agregar cuenta, DAP o tarjeta</button>
        <Link className="btn-secondary" href="/import"><Icon name="upload" size={16} />Actualizar con cartolas</Link>
        <Link className="btn-secondary" href="/plan"><Icon name="chart" size={16} />Libre este mes: {clp(plan.free)}</Link>
      </div>

      {adding && <NewAccountSheet data={data} onClose={() => setAdding(false)} />}
      {paying && <PaySheet data={data} payment={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

export default function WalletPage() {
  return <WithData>{data => <Wallet data={data} />}</WithData>;
}
