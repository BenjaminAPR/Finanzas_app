import { normalize, type Account, type CategoryRule, type Transaction } from '../finance.ts';
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
};

// Palabras generales de comercios. Los nombres de personas viven en la base, nunca en el código.
const MERCHANT_CATEGORIES: [RegExp, string][] = [
  [/jumbo|lider|unimarc|sta isabel|santa isabel|tottus|acuenta|cenco|mass|oxxo|ok market|verdu|almacen|maicao|salcobrand maicao/, 'Supermercado'],
  [/red movilidad|metro(?!gas)|mtr |uber|cabify|didi|lime|efe|copec|shell|peaje|bip/, 'Transporte'],
  [/mc donalds|mcdonalds|arcos dorados|kfc|kentucky|sbarro|pedidosya|rappi|dunkin|krispy|starbucks|sbx|cafe|cafeteria|restaurant|restau|sushi|tanta|antica|gelateria|heladeria|golosohelad|foodtruck|carro del|dulzur|amawa/, 'Comida fuera'],
  [/farmacia|salcobrand|cruz verde|ahumada|megasalud|clinica|dental|doctor/, 'Salud'],
  [/spotify|netflix|apple com|google|youtube|disney|hbo|prime video|anthropic/, 'Suscripciones'],
  [/entel|movistar|wom|claro|aguas|enel|metrogas|gasco|lipigas|vtr|mundo/, 'Casa'],
  [/cineplanet|cinemark|cinehoyts/, 'Citas'],
  [/h m|hym|zara|falabella|paris|ripley|shein|bbw|perfum|barberia|decohogar|easy|sodimac|homecenter/, 'Compras'],
];

const INVESTMENT_OR_DEPOSIT = /dep a plazo|deposito a plazo|cobro de deposito|racional|vector cl/;
const CARD_PAYMENT = /pago tarjeta/;
const CASH = /giro cajero/;
const SALARY = /de sueldos|remuneracion/;
const OWN_ACCOUNT_TRANSFER = /^traspaso (a|de) cuenta/;
const PERSON_TRANSFER = /^(traspaso (a|de)|transf(\.| ) ?(de|para))/;
const BILL_COLLECTION = /recaudacion y pagos/;

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
const MATCH_WINDOW_DAYS = 7;

export function buildImport(
  statements: ParsedStatement[],
  accounts: Account[],
  budgets: { id: string; name: string }[],
  rules: CategoryRule[],
  ownNames: string[],
  existing: Transaction[],
  mapping: Record<string, string> = {},
): ImportRow[] {
  const accountFor = (s: ParsedStatement) =>
    mapping[s.accountRef] ?? accounts.find(a => a.statement_ref === s.accountRef)?.id ?? null;
  const cardPaymentAmounts = new Set(
    statements.flatMap(s => s.rows.filter(r => r.kind === 'card_payment').map(r => Math.abs(r.amount))),
  );

  // Dos documentos pueden traer el mismo movimiento: se conserva una sola copia.
  const unique = new Map<string, { row: ParsedRow; statement: ParsedStatement }>();
  for (const statement of statements) {
    const seen = new Map<string, number>();
    for (const row of statement.rows) {
      const base = `${statement.accountRef}|${row.date}|${row.amount}|${normalize(row.description)}`;
      const occurrence = (seen.get(base) ?? 0) + 1;
      seen.set(base, occurrence);
      const key = `${base}|${occurrence}`;
      if (!unique.has(key)) unique.set(key, { row, statement });
    }
  }

  const hashes = new Set(existing.map(t => t.import_hash).filter(Boolean));
  const consumed = new Set<string>();

  const result: ImportRow[] = [];
  for (const [key, { row, statement }] of unique) {
    const accountId = accountFor(statement);
    const classified = classifyText(row, ownNames, rules, cardPaymentAmounts);
    const { ruleBudgetId, ...decision } = classified;
    const budgetId = ruleBudgetId ?? budgets.find(b => normalize(b.name) === normalize(decision.budgetName ?? ''))?.id ?? null;
    const item: ImportRow = { ...row, key, accountId, ...decision, budgetId };

    if (hashes.has(key)) {
      item.decision = 'existing';
      item.reason = 'Ya importado';
    } else if ((item.decision === 'new' || item.decision === 'review') && accountId) {
      const type = row.amount > 0 ? 'income' : 'expense';
      const candidates = existing
        .filter(t =>
          !consumed.has(t.id) &&
          !t.import_hash &&
          Number(t.amount) === Math.abs(row.amount) &&
          (t.type === type || t.type === 'transfer') &&
          (t.account_id === accountId || t.destination_account_id === accountId) &&
          dayDistance((t.date || t.created_at).slice(0, 10), row.date) <= MATCH_WINDOW_DAYS,
        )
        .sort((a, b) =>
          dayDistance((a.date || a.created_at).slice(0, 10), row.date) -
          dayDistance((b.date || b.created_at).slice(0, 10), row.date),
        );
      if (candidates[0]) {
        consumed.add(candidates[0].id);
        item.decision = 'existing';
        item.reason = `Ya registrado como "${candidates[0].description}"`;
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
