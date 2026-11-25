import { normalize, type Account, type CategoryRule, type Household } from '../finance.ts';
import type { ParsedRow, ParsedStatement } from './parse.ts';

export type RowDecision = 'new' | 'review' | 'existing' | 'internal' | 'plan';

export type ImportRow = ParsedRow & {
  key: string;
  accountId: string | null;
  decision: RowDecision;
  reason: string;
  budgetName: string | null;
  budgetId: string | null;
  merchant: string;
  recurringId?: string;
  installmentId?: string;
};

export type ImportContext = Pick<
  Household,
  'accounts' | 'budgets' | 'rules' | 'settings' | 'transactions' | 'recurring' | 'debts' | 'installments' | 'statements'
>;

// Palabras generales de comercios. Los nombres de personas viven en la base, nunca en el código.
const MERCHANT_CATEGORIES: [RegExp, string][] = [
  [/jumbo|lider|unimarc|sta isabel|santa isabel|tottus|acuenta|cenco|mass|oxxo|ok market|verdu|almacen|maicao|salcobrand maicao/, 'Supermercado'],
  [/red movilidad|metro(?!gas)|mtr |uber|cabify|didi|lime|efe|copec|shell|peaje|bip/, 'Transporte'],
  [/mc donalds|mcdonalds|arcos dorados|kfc|kentucky|sbarro|pedidosya|rappi|dunkin|krispy|starbucks|sbx|cafe|cafeteria|restaurant|restau|sushi|tanta|antica|gelateria|heladeria|golosohelad|foodtruck|carro del|dulzur|amawa/, 'Comida fuera'],
  [/farmacia|salcobrand|cruz verde|ahumada|megasalud|clinica|dental|doctor/, 'Salud'],
  [/spotify|netflix|apple com|google|youtube|disney|hbo|prime video|anthropic/, 'Suscripciones'],
  [/entel|movistar|wom|claro|aguas|enel|metrogas|gasco|lipigas|vtr|mundo/, 'Casa'],
  [/cineplanet|cinemark|cinehoyts/, 'Citas'],
  [/h m|hym|zara|falabella|paris|ripley|shein|bbw|perfum|barberia|decohogar|easy|sodimac|homecenter|americanino/, 'Compras'],
];

const INVESTMENT_OR_DEPOSIT = /dep a plazo|deposito a plazo|cobro de deposito|captaciones|racional|vector cl/;
const CARD_PAYMENT = /pago tarjeta/;
const CASH = /giro cajero/;
const SALARY = /de sueldos|remuneracion/;
const OWN_ACCOUNT_TRANSFER = /^traspaso (a|de) cuenta/;
const PERSON_TRANSFER = /^(traspaso (a|de)|transf(\.| ) ?(de|para))/;
const BILL_COLLECTION = /recaudacion y pagos|servipag/;

/** Identifica el origen aunque el archivo no traiga número de cuenta (por ejemplo, algunos Excel). */
export const statementKey = (s: ParsedStatement) => s.accountRef || `inst:${s.institution}`;

export function resolveAccount(s: ParsedStatement, accounts: Account[], mapping: Record<string, string>): string | null {
  const key = statementKey(s);
  if (mapping[key]) return mapping[key];
  if (s.accountRef) return accounts.find(a => a.statement_ref === s.accountRef)?.id ?? null;
  const candidates = accounts.filter(a =>
    !a.archived && a.institution === s.institution &&
    (s.accountKind === 'card' ? a.asset_kind === 'card' : a.asset_kind !== 'card' && a.asset_kind !== 'investment'),
  );
  if (candidates.length === 1) return candidates[0].id;
  const withStatements = candidates.filter(a => a.statement_ref);
  return withStatements.length === 1 ? withStatements[0].id : null;
}

function merchantOf(description: string): string {
  return normalize(description)
    .replace(/^pago /, '')
    .replace(/^compra /, '')
    .replace(/^(merpago|redgloba|payscan|ks compra|dl) /, '')
    .slice(0, 40)
    .trim();
}

function classifyText(
  row: ParsedRow,
  ownNames: string[],
  rules: CategoryRule[],
  cardPaymentAmounts: Set<number>,
): Pick<ImportRow, 'decision' | 'reason' | 'budgetName' | 'merchant'> & { ruleBudgetId: string | null } {
  const text = normalize(row.description);
  const merchant = merchantOf(row.description);
  const base = { budgetName: null, merchant, ruleBudgetId: null };

  if (row.kind === 'card_payment') return { ...base, decision: 'internal', reason: 'Pago de tarjeta' };
  if (row.kind === 'installment') return { ...base, decision: 'plan', reason: 'Cuota de una deuda' };

  const rule = rules.find(r => text.includes(r.pattern));
  if (rule?.treat_as === 'internal') return { ...base, decision: 'internal', reason: 'Regla guardada' };
  if (rule?.treat_as === 'ignore') return { ...base, decision: 'internal', reason: 'Ignorado por regla' };
  if (rule) return { ...base, decision: 'new', reason: 'Regla guardada', ruleBudgetId: rule.budget_id };

  if (INVESTMENT_OR_DEPOSIT.test(text)) return { ...base, decision: 'internal', reason: 'Ahorro o inversión' };
  if (CARD_PAYMENT.test(text)) return { ...base, decision: 'internal', reason: 'Pago de tarjeta' };
  if (BILL_COLLECTION.test(text) && cardPaymentAmounts.has(Math.abs(row.amount))) {
    return { ...base, decision: 'internal', reason: 'Pago de tarjeta' };
  }
  if (OWN_ACCOUNT_TRANSFER.test(text)) return { ...base, decision: 'internal', reason: 'Entre sus cuentas' };
  if (PERSON_TRANSFER.test(text) && ownNames.some(n => n && text.includes(normalize(n)))) {
    return { ...base, decision: 'internal', reason: 'Entre ustedes' };
  }
  if (SALARY.test(text)) return { ...base, decision: 'new', reason: 'Sueldo' };
  if (CASH.test(text)) return { ...base, decision: 'review', reason: '¿Para qué fue este giro?' };
  if (row.amount > 0 && row.kind === 'movement' && PERSON_TRANSFER.test(text)) {
    return { ...base, decision: 'review', reason: 'Transferencia recibida' };
  }
  if (PERSON_TRANSFER.test(text) || BILL_COLLECTION.test(text)) {
    return { ...base, decision: 'review', reason: '¿A qué corresponde?' };
  }

  const match = MERCHANT_CATEGORIES.find(([pattern]) => pattern.test(text));
  return { ...base, decision: 'new', reason: match ? 'Categoría sugerida' : 'Sin categoría', budgetName: match?.[1] ?? null };
}

const dayDistance = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
// Lo anotado a mano suele quedar unos días corrido; entre archivos del banco la fecha varía menos.
const MANUAL_WINDOW_DAYS = 7;
const IMPORTED_WINDOW_DAYS = 3;
const tokens = (...values: (string | null | undefined)[]) =>
  values.filter(Boolean).map(v => normalize(v!)).filter(t => t.length >= 4);
const near = (value: number, expected: number, tolerance: number) =>
  expected > 0 && Math.abs(value - expected) <= expected * tolerance;

export function buildImport(
  statements: ParsedStatement[],
  data: ImportContext,
  mapping: Record<string, string> = {},
): ImportRow[] {
  const existing = data.transactions;
  const cardPaymentAmounts = new Set(
    statements.flatMap(s => s.rows.filter(r => r.kind === 'card_payment').map(r => Math.abs(r.amount))),
  );

  // Dos documentos pueden traer el mismo movimiento: se conserva una sola copia.
  const unique = new Map<string, { row: ParsedRow; statement: ParsedStatement }>();
  for (const statement of statements) {
    const seen = new Map<string, number>();
    for (const row of statement.rows) {
      const base = `${statementKey(statement)}|${row.date}|${row.amount}|${normalize(row.description)}`;
      const occurrence = (seen.get(base) ?? 0) + 1;
      seen.set(base, occurrence);
      const key = `${base}|${occurrence}`;
      if (!unique.has(key)) unique.set(key, { row, statement });
    }
  }

  const hashes = new Set(existing.map(t => t.import_hash).filter(Boolean));
  const consumed = new Set<string>();
  const debtById = new Map(data.debts.map(d => [d.id, d]));
  const pendingInstallments = data.installments
    .filter(i => i.status === 'pending' && !debtById.get(i.debt_id)?.account_id)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const linkedInstallments = new Set<string>();

  const result: ImportRow[] = [];
  for (const [key, { row, statement }] of unique) {
    const accountId = resolveAccount(statement, data.accounts, mapping);
    const classified = classifyText(row, data.settings.own_names, data.rules, cardPaymentAmounts);
    const { ruleBudgetId, ...decision } = classified;
    const budgetId = ruleBudgetId ?? data.budgets.find(b => normalize(b.name) === normalize(decision.budgetName ?? ''))?.id ?? null;
    const item: ImportRow = { ...row, key, accountId, ...decision, budgetId };
    const text = normalize(row.description);
    const open = item.decision === 'new' || item.decision === 'review';

    if (hashes.has(key)) {
      item.decision = 'existing';
      item.reason = 'Ya importado';
    } else if (open && row.amount < 0) {
      const amount = -row.amount;
      const statementPaid = data.statements.find(s =>
        !s.paid_at && Number(s.billed_amount) - Number(s.paid_amount) === amount &&
        row.date > s.period_end && (row.date <= s.due_date || dayDistance(row.date, s.due_date) <= 10),
      );
      const installment = pendingInstallments.find(i => {
        const debt = debtById.get(i.debt_id)!;
        return !linkedInstallments.has(i.id) && near(amount, Number(i.amount), 0.01) &&
          tokens(debt.match_text, debt.creditor, debt.name).some(t => text.includes(t));
      });
      const recurring = data.recurring.find(r =>
        r.active && r.kind === 'expense' && near(amount, Number(r.amount), 0.2) &&
        tokens(r.match_text, r.name).some(t => text.includes(t)),
      );
      if (statementPaid) {
        item.decision = 'internal';
        item.reason = 'Pago de tarjeta';
      } else if (installment) {
        const debt = debtById.get(installment.debt_id)!;
        linkedInstallments.add(installment.id);
        item.decision = 'new';
        item.reason = `Cuota ${installment.installment_number} de ${debt.name}`;
        item.installmentId = installment.id;
      } else if (recurring) {
        item.decision = 'new';
        item.reason = recurring.name;
        item.recurringId = recurring.id;
        item.budgetId = recurring.budget_id ?? item.budgetId;
      }
    }

    if ((item.decision === 'new' || item.decision === 'review') && accountId) {
      const type = row.amount > 0 ? 'income' : 'expense';
      const candidates = existing
        .filter(t =>
          !consumed.has(t.id) &&
          Number(t.amount) === Math.abs(row.amount) &&
          (t.type === type || t.type === 'transfer') &&
          (t.account_id === accountId || t.destination_account_id === accountId) &&
          dayDistance((t.date || t.created_at).slice(0, 10), row.date) <=
            (t.import_hash ? IMPORTED_WINDOW_DAYS : MANUAL_WINDOW_DAYS),
        )
        .sort((a, b) =>
          dayDistance((a.date || a.created_at).slice(0, 10), row.date) -
          dayDistance((b.date || b.created_at).slice(0, 10), row.date),
        );
      if (candidates[0]) {
        consumed.add(candidates[0].id);
        item.decision = 'existing';
        item.reason = `Ya registrado como "${candidates[0].description}"`;
        if (item.installmentId) linkedInstallments.delete(item.installmentId);
        delete item.installmentId;
        delete item.recurringId;
      }
    }
    result.push(item);
  }

  // Una compra anulada y su devolución se cancelan: no son gasto ni ingreso.
  for (const refund of result) {
    if (refund.amount <= 0 || refund.decision !== 'new' || refund.kind !== 'movement') continue;
    const purchase = result.find(r =>
      r.decision === 'new' && r.accountId === refund.accountId && r.merchant === refund.merchant &&
      r.amount === -refund.amount && r.date <= refund.date,
    );
    if (!purchase) continue;
    refund.decision = 'internal';
    refund.reason = 'Compra anulada';
    purchase.decision = 'internal';
    purchase.reason = 'Compra anulada';
  }

  return result.sort((a, b) => b.date.localeCompare(a.date));
}
