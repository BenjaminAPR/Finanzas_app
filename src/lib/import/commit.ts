'use client';

import { supabase } from '../supabase';
import { dayOf, type CardStatement, type Household } from '../finance';
import { resolveAccount, type ImportRow } from './classify';
import type { ParsedStatement } from './parse';

const titleCase = (s: string) =>
  s.toLowerCase().replace(/(^|[\s*/-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());

const pretty = (description: string) =>
  titleCase(description.replace(/^pago:\s*/i, '').replace(/^traspaso a:\s*/i, 'Transferencia a '));

export async function commitImport(
  rows: ImportRow[],
  allRows: ImportRow[],
  statements: ParsedStatement[],
  data: Household,
  mapping: Record<string, string>,
  learned: { pattern: string; budgetId: string }[],
) {
  const accountFor = (s: ParsedStatement) => resolveAccount(s, data.accounts, mapping);

  const payload = rows
    .filter(r => r.accountId)
    .map(r => ({
      type: r.amount > 0 ? 'income' : 'expense',
      amount: Math.abs(r.amount),
      description: pretty(r.description),
      date: r.date,
      account_id: r.accountId,
      budget_id: r.amount < 0 ? r.budgetId : null,
      user_id: data.userId,
      source: 'import',
      import_hash: r.key,
      spender: r.spender ?? null,
      recurring_id: r.recurringId ?? null,
    }));

  let inserted: { id: string; import_hash: string }[] = [];
  if (payload.length) {
    const { data: saved, error } = await supabase
      .from('transactions')
      .upsert(payload, { onConflict: 'import_hash', ignoreDuplicates: true })
      .select('id,import_hash');
    if (error) throw error;
    inserted = (saved ?? []) as typeof inserted;
  }

  // Un pago de cuota que aparece en la cartola marca esa cuota como pagada.
  const idByKey = new Map(inserted.map(t => [t.import_hash, t.id]));
  for (const row of rows) {
    const txId = idByKey.get(row.key);
    if (!row.installmentId || !txId) continue;
    const { error } = await supabase
      .from('installments')
      .update({ status: 'paid', paid_date: row.date, transaction_id: txId })
      .eq('id', row.installmentId)
      .eq('status', 'pending');
    if (error) throw error;
  }

  // Solo se recuerdan números de cuenta reales; las claves "inst:" se resuelven por institución.
  for (const [ref, accountId] of Object.entries(mapping)) {
    if (ref.startsWith('inst:')) continue;
    const { error } = await supabase.from('accounts').update({ statement_ref: ref }).eq('id', accountId);
    if (error) throw error;
  }

  const anchors = new Map<string, { amount: number; date: string }>();
  const setAnchor = (accountId: string, amount: number, date: string) => {
    const current = anchors.get(accountId);
    if (!current || date >= current.date) anchors.set(accountId, { amount, date });
  };

  for (const statement of statements) {
    const accountId = accountFor(statement);
    if (!accountId || !statement.reconciled) continue;
    if (statement.balance) setAnchor(accountId, statement.balance.amount, statement.balance.date);
    if (statement.card) {
      const { error } = await supabase.from('card_statements').upsert(
        {
          account_id: accountId,
          period_end: statement.card.periodEnd,
          due_date: statement.card.dueDate,
          billed_amount: statement.card.billed,
          minimum_amount: statement.card.minimum,
          prepay_amount: statement.card.prepay,
          monthly_rate: statement.card.monthlyRate,
          cae: statement.card.cae,
        },
        { onConflict: 'account_id,due_date' },
      );
      if (error) throw error;
      if (statement.card.prepay !== null) setAnchor(accountId, -statement.card.prepay, statement.card.periodEnd);
    }
  }

  const { data: statementRows, error: statementsError } = await supabase.from('card_statements').select('*');
  if (statementsError) throw statementsError;
  const currentStatements = (statementRows ?? []) as CardStatement[];

  // Si la cartola del banco muestra el pago exacto de un estado de cuenta, se marca solo.
  const autoPayments: { accountId: string; amount: number; date: string }[] = [];
  const settled = new Set<string>();
  for (const row of allRows) {
    if (row.reason !== 'Pago de tarjeta' || row.kind !== 'movement' || row.amount >= 0 || !row.accountId) continue;
    const amount = -row.amount;
    const match = currentStatements.find(s =>
      !s.paid_at && !settled.has(s.id) && row.date > s.period_end &&
      Number(s.billed_amount) - Number(s.paid_amount) === amount,
    );
    if (!match) continue;
    const { error: payError } = await supabase.rpc('pay_card_statement', {
      p_statement: match.id, p_from_account: row.accountId, p_amount: amount, p_date: row.date,
    });
    if (payError) throw payError;
    settled.add(match.id);
    autoPayments.push({ accountId: match.account_id, amount, date: row.date });
  }

  // "No facturados" es la lista completa desde el último cierre, y puede incluir compras
  // con fecha anterior al cierre. La deuda real es el prepago más todo ese listado.
  for (const statement of statements) {
    if (statement.accountKind !== 'card' || statement.card) continue;
    const purchases = statement.rows.filter(r => r.kind === 'movement' || r.kind === 'fee');
    if (!purchases.length) continue;
    const accountId = accountFor(statement);
    if (!accountId || !statement.reconciled) continue;
    const stored = currentStatements
      .filter(s => s.account_id === accountId)
      .sort((a, b) => b.due_date.localeCompare(a.due_date))[0];
    if (stored?.prepay_amount === null || stored?.prepay_amount === undefined) continue;
    const unbilled = purchases.reduce((sum, r) => sum - r.amount, 0);
    const latest = purchases.reduce((max, r) => (r.date > max ? r.date : max), '');
    // Solo se descuentan aquí los pagos que el nuevo saldo base dejará de contar.
    const inWindow = (day: string) => day > stored.period_end && day <= latest;
    const recorded = data.transactions
      .filter(t => t.type === 'transfer' && t.destination_account_id === accountId && inWindow(dayOf(t)))
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const detected = autoPayments
      .filter(p => p.accountId === accountId && inWindow(p.date))
      .reduce((sum, p) => sum + p.amount, 0);
    setAnchor(accountId, -(Number(stored.prepay_amount) - recorded - detected + unbilled), latest);
  }

  // Se fija al final para que lo recién importado no se sume dos veces.
  for (const [accountId, anchor] of anchors) {
    const account = data.accounts.find(a => a.id === accountId);
    if (account?.anchor_date && account.anchor_date > anchor.date) continue;
    const { error } = await supabase
      .from('accounts')
      .update({ anchor_balance: anchor.amount, anchor_date: anchor.date, anchor_set_at: new Date().toISOString() })
      .eq('id', accountId);
    if (error) throw error;
  }

  if (learned.length) {
    const { error } = await supabase.from('category_rules').upsert(
      learned.map(l => ({ pattern: l.pattern, budget_id: l.budgetId, treat_as: 'expense' })),
      { onConflict: 'pattern' },
    );
    if (error) throw error;
  }

  return payload.length;
}
