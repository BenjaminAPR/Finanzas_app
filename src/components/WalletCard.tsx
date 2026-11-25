import Link from 'next/link';
import { clp, shortDate } from '@/lib/format';
import type { AccountWithBalance } from '@/lib/finance';

const KIND_LABEL = { cash: 'Cuenta', deposit: 'Ahorro', investment: 'Inversión', card: 'Crédito' } as const;

/** Una cuenta como tarjeta física: institución, nombre, monto y un dato clave abajo. */
export function WalletCard({ account, today, large = false }: { account: AccountWithBalance; today: string; large?: boolean }) {
  const isCard = account.asset_kind === 'card';
  const owed = Math.max(0, -account.balance);
  const limit = account.credit_limit ? Number(account.credit_limit) : null;
  const ref = account.statement_ref ? `•••• ${account.statement_ref.slice(-4)}` : '';
  let foot: string;
  if (isCard) foot = limit ? `Cupo disponible ${clp(Math.max(0, limit - owed))}` : 'Deuda total';
  else if (account.maturity_date && account.maturity_date >= today) foot = `Vence ${shortDate(account.maturity_date)}`;
  else if (account.maturity_date) foot = `Venció ${shortDate(account.maturity_date)}`;
  else foot = account.anchor_date ? `Saldo al ${shortDate(account.anchor_date)}` : 'Saldo estimado';

  const body = (
    <>
      <div className="wcard-top">
        <span>{account.institution ?? KIND_LABEL[account.asset_kind]}</span>
        <span>{account.owner_label ?? ''}</span>
      </div>
      <div className="wcard-name">{account.name}</div>
      <div className="wcard-amount">{clp(isCard ? owed : account.balance)}</div>
      {isCard && limit ? (
        <div className="wcard-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, (owed / limit) * 100)}%` }} /></div>
      ) : null}
      <div className="wcard-foot"><span>{foot}</span><span>{ref}</span></div>
    </>
  );

  return large
    ? <div className={`wcard ${account.asset_kind} large`}>{body}</div>
    : <Link href={`/accounts/${account.id}`} className={`wcard ${account.asset_kind}`}>{body}</Link>;
}
