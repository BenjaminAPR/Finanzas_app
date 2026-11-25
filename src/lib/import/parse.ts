// Convierte el texto de cartolas chilenas en movimientos. Corre en el navegador:
// los PDF nunca se suben a un servidor. Cada línea llega con sus celdas separadas por " | ".

export type RowKind = 'movement' | 'card_payment' | 'installment' | 'fee';

export type ParsedRow = {
  date: string;
  /** Negativo = sale dinero o se carga a la tarjeta. Positivo = entra dinero o devolución. */
  amount: number;
  description: string;
  kind: RowKind;
  spender?: 'titular' | 'adicional';
  installment?: { number: number; total: number; purchaseAmount: number };
};

export type CardSummary = {
  dueDate: string;
  billed: number;
  minimum: number;
  prepay: number | null;
  periodEnd: string;
  monthlyRate: number | null;
  cae: number | null;
};

export type ParsedStatement = {
  format: string;
  institution: 'Banco de Chile' | 'Banco Falabella' | 'CMR Falabella' | 'Cencosud Scotiabank';
  accountKind: 'bank' | 'card';
  accountRef: string;
  label: string;
  balance: { amount: number; date: string } | null;
  /** true si los movimientos cuadran con el saldo o total que informa el propio documento. */
  reconciled: boolean;
  card: CardSummary | null;
  rows: ParsedRow[];
};

type Cells = string[];

const DATE_FULL = /^\d{2}\/\d{2}\/\d{4}$/;
const DATE_DASH = /^\d{2}-\d{2}-\d{4}$/;
const DATE_SHORT = /^\d{2}\/\d{2}$/;
// Pesos con separador de miles; los Excel agregan ".00" o ",00" al final.
const MONEY = /^-?\s?\$?\s?-?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{2})?$/;
const FRACTION = /^(\d{1,2})\/(\d{1,2})$/;
// Los emisores redondean cuotas: la suma de líneas puede diferir unos pesos del total facturado.
const ROUNDING_TOLERANCE = 10;
const BANK_CREDIT =/^(traspaso de|pago:\s*de sueldos|deposito|depósito|abono|devolucion|devolución|remuneracion|remuneración)/i;

const isMoney = (s: string) => MONEY.test(s.trim());
const toISO = (s: string) => `${s.slice(6, 10)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;
const cellsOf = (line: string): Cells => line.split(' | ').map(c => c.trim()).filter(Boolean);
const refOf = (s: string) => s.replace(/\D/g, '').replace(/^0+/, '');
const cleanText = (s: string) => s.replace(/\*+$/, '').replace(/\s+/g, ' ').trim();

export function parseMoney(s: string): number {
  const negative = s.includes('-');
  const value = Number(s.trim().replace(/[.,]\d{2}$/, '').replace(/\D/g, ''));
  return negative ? -value : value;
}

const percent = (s: string | undefined) => {
  if (!s) return null;
  const value = Number(s.replace('%', '').replace(',', '.').trim());
  return Number.isFinite(value) ? value : null;
};

function findCells(lines: string[], pattern: RegExp): Cells | null {
  const line = lines.find(l => pattern.test(l));
  return line ? cellsOf(line) : null;
}

function moneyAfter(lines: string[], pattern: RegExp): number | null {
  const cells = findCells(lines, pattern);
  const value = cells?.slice(1).find(isMoney);
  return value === undefined ? null : parseMoney(value);
}

/** Da signo usando el saldo de cada fila. Las filas vienen de la más nueva a la más antigua. */
function signByBalance(
  raw: { date: string; description: string; amount: number; balance: number }[],
  opening: number | null,
): { rows: ParsedRow[]; reconciled: boolean } {
  let reconciled = raw.length > 0;
  const rows = raw.map((row, i) => {
    const previous = i + 1 < raw.length ? raw[i + 1].balance : opening;
    const delta = previous === null ? null : row.balance - previous;
    let signed: number;
    if (delta === row.amount) signed = row.amount;
    else if (delta === -row.amount) signed = -row.amount;
    else {
      if (previous !== null) reconciled = false;
      signed = BANK_CREDIT.test(row.description) || /^transf\. de/i.test(row.description) ? row.amount : -row.amount;
    }
    return { date: row.date, amount: signed, description: cleanText(row.description), kind: 'movement' as const };
  });
  return { rows, reconciled };
}

/** Filas "dd/mm" de las cartolas históricas del Banco de Chile, con saldo inicial y final. */
function shortDateRows(lines: string[], yearFor: (day: string) => string) {
  let opening: number | null = null;
  let closing: number | null = null;
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!DATE_SHORT.test(cells[0] ?? '')) continue;
    const description = cells[1] ?? '';
    const numbers = cells.slice(2).filter(isMoney).map(parseMoney);
    if (/^SALDO INICIAL/i.test(description)) { opening = numbers[0] ?? null; continue; }
    if (/^SALDO FINAL/i.test(description)) { closing = numbers[0] ?? null; continue; }
    if (!numbers.length) continue;
    const date = `${yearFor(cells[0])}-${cells[0].slice(3, 5)}-${cells[0].slice(0, 2)}`;
    const amount = BANK_CREDIT.test(description) ? numbers[0] : -numbers[0];
    rows.push({ date, amount, description: cleanText(description), kind: 'movement' });
  }
  return { rows, opening, closing };
}

function parseChileHistoricSheet(lines: string[]): ParsedStatement | null {
  const number = findCells(lines, /^Cuenta: \|/);
  const emission = findCells(lines, /Fecha de Emisión/)?.find(c => DATE_FULL.test(c));
  if (!number?.[1] || !emission) return null;
  const month = Number(emission.slice(3, 5));
  const year = Number(emission.slice(6));
  const yearFor = (day: string) => String(Number(day.slice(3, 5)) <= month ? year : year - 1);
  const { rows, opening, closing } = shortDateRows(lines, yearFor);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const ref = refOf(number[1]);
  return {
    format: 'Cartola histórica',
    institution: 'Banco de Chile',
    accountKind: 'bank',
    accountRef: ref,
    label: ref.length > 9 ? 'Cuenta Corriente' : 'Cuenta Vista',
    balance: closing === null ? null : { amount: closing, date: toISO(emission) },
    reconciled: opening !== null && closing !== null && opening + total === closing,
    card: null,
    rows,
  };
}

function parseCmrRecentSheet(lines: string[]): ParsedStatement | null {
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!DATE_DASH.test(cells[0] ?? '') || !/^(Titular|Adicional)$/i.test(cells[2] ?? '')) continue;
    const amount = parseMoney(cells[3] ?? '0');
    const pending = Number(cells[4] ?? 0);
    const instalment = parseMoney(cells[5] ?? cells[3] ?? '0');
    const base = {
      date: toISO(cells[0]),
      description: cleanText(cells[1].replace(/^COMPRA\s+/i, '')),
      spender: /^titular$/i.test(cells[2]) ? 'titular' as const : 'adicional' as const,
    };
    rows.push(pending > 0
      ? { ...base, amount: -instalment, kind: 'installment', installment: { number: 0, total: pending, purchaseAmount: amount } }
      : { ...base, amount: -amount, kind: 'movement' });
  }
  if (!rows.length) return null;
  return {
    format: 'Últimos movimientos',
    institution: 'CMR Falabella',
    accountKind: 'card',
    accountRef: '',
    label: 'Tarjeta CMR',
    balance: null,
    reconciled: true,
    card: null,
    rows,
  };
}

function parseFalabellaReport(lines: string[]): ParsedStatement | null {
  const raw: { date: string; description: string; amount: number; balance: number }[] = [];
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!DATE_DASH.test(cells[0] ?? '')) continue;
    const numbers = cells.slice(2).filter(isMoney).map(parseMoney);
    if (numbers.length < 2) continue;
    raw.push({ date: toISO(cells[0]), description: cells[1], amount: numbers[0], balance: numbers[numbers.length - 1] });
  }
  if (!raw.length) return null;
  const { rows, reconciled } = signByBalance(raw, null);
  return {
    format: 'Movimientos',
    institution: 'Banco Falabella',
    accountKind: 'bank',
    accountRef: '',
    label: 'Cuenta Corriente',
    balance: { amount: raw[0].balance, date: raw[0].date },
    reconciled,
    card: null,
    rows,
  };
}

function parseChileStatement(lines: string[]): ParsedStatement | null {
  const range = findCells(lines, /^DESDE \|/);
  const number = findCells(lines, /N° DE CUENTA/);
  if (!range || !number) return null;
  const dates = range.filter(c => DATE_FULL.test(c));
  if (dates.length < 2) return null;
  const [from, to] = dates;
  const refIndex = number.findIndex(c => c.includes('N° DE CUENTA'));
  const ref = number.slice(refIndex + 1).find(c => /^\d{6,}$/.test(c));
  if (!ref) return null;

  const yearFor = (day: string) => (Number(day.slice(3, 5)) >= Number(from.slice(3, 5)) ? from.slice(6) : to.slice(6));
  const { rows, opening, closing } = shortDateRows(lines, yearFor);
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const isVista = lines.some(l => /^CUENTA VISTA/.test(l));
  return {
    format: 'Estado de cuenta',
    institution: 'Banco de Chile',
    accountKind: 'bank',
    accountRef: refOf(ref),
    label: isVista ? 'Cuenta Vista' : 'Cuenta Corriente',
    balance: closing === null ? null : { amount: closing, date: toISO(to) },
    reconciled: opening !== null && closing !== null && opening + total === closing,
    card: null,
    rows,
  };
}

function parseChileMovements(lines: string[]): ParsedStatement | null {
  const number = findCells(lines, /^Cuenta(?: N°)?: \|/);
  if (!number?.[1]) return null;
  const raw: { date: string; description: string; amount: number; balance: number }[] = [];
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!DATE_FULL.test(cells[0] ?? '')) continue;
    const numbers = cells.slice(2).filter(isMoney).map(parseMoney);
    if (numbers.length < 2) continue;
    raw.push({ date: toISO(cells[0]), description: cells[1], amount: numbers[0], balance: numbers[1] });
  }
  const { rows, reconciled } = signByBalance(raw, null);
  const headerIndex = lines.findIndex(l => l.startsWith('Saldo Disponible'));
  const accounting = headerIndex >= 0 ? cellsOf(lines[headerIndex + 1] ?? '').filter(isMoney).map(parseMoney)[1] : undefined;
  const latest = rows.reduce((max, r) => (r.date > max ? r.date : max), '');
  return {
    format: 'Movimientos',
    institution: 'Banco de Chile',
    accountKind: 'bank',
    accountRef: refOf(number[1]),
    label: refOf(number[1]).length > 9 ? 'Cuenta Corriente' : 'Cuenta Vista',
    balance: accounting === undefined || !latest ? null : { amount: accounting, date: latest },
    reconciled: reconciled && (accounting === undefined || raw[0]?.balance === accounting),
    card: null,
    rows,
  };
}

function parseFalabellaMovements(lines: string[]): ParsedStatement | null {
  const number = findCells(lines, /^Cuenta corriente \|/);
  if (!number?.[1]) return null;
  const raw: { date: string; description: string; amount: number; balance: number }[] = [];
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!DATE_FULL.test(cells[0] ?? '') || cells.length < 5) continue;
    const charge = cells[2];
    const credit = cells[3];
    const amount = charge !== '-' ? parseMoney(charge) : parseMoney(credit);
    raw.push({ date: toISO(cells[0]), description: cells[1], amount, balance: parseMoney(cells[4]) });
  }
  const { rows, reconciled } = signByBalance(raw, null);
  const accounting = moneyAfter(lines, /^Saldo Contable \|/);
  const latest = rows.reduce((max, r) => (r.date > max ? r.date : max), '');
  return {
    format: 'Movimientos',
    institution: 'Banco Falabella',
    accountKind: 'bank',
    accountRef: refOf(number[1]),
    label: 'Cuenta Corriente',
    balance: accounting === null || !latest ? null : { amount: accounting, date: latest },
    reconciled: reconciled && (accounting === null || raw[0]?.balance === accounting),
    card: null,
    rows,
  };
}

function parseFalabellaHistoric(lines: string[]): ParsedStatement | null {
  const number = findCells(lines, /^Cuenta \| /);
  if (!number?.[1]) return null;
  const headerIndex = lines.findIndex(l => l.startsWith('Saldo Inicial'));
  const opening = headerIndex >= 0 ? parseMoney(cellsOf(lines[headerIndex + 1] ?? '')[0] ?? '') : null;
  const raw: { date: string; description: string; amount: number; balance: number }[] = [];
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!DATE_FULL.test(cells[0] ?? '') || cells.length < 5) continue;
    const numbers = cells.slice(3).filter(isMoney).map(parseMoney);
    if (numbers.length < 2) continue;
    raw.push({
      date: toISO(cells[0]),
      description: cells[2],
      amount: numbers[numbers.length - 2],
      balance: numbers[numbers.length - 1],
    });
  }
  const { rows, reconciled } = signByBalance(raw, opening);
  return {
    format: 'Cartola histórica',
    institution: 'Banco Falabella',
    accountKind: 'bank',
    accountRef: refOf(number[1]),
    label: 'Cuenta Corriente',
    balance: raw.length ? { amount: raw[0].balance, date: raw[0].date } : null,
    reconciled,
    card: null,
    rows,
  };
}

function cardRow(
  date: string,
  description: string,
  owner: string | undefined,
  numbers: number[],
  fraction: RegExpMatchArray | null,
): ParsedRow {
  const spender = owner ? (owner === 'T' ? 'titular' as const : 'adicional' as const) : undefined;
  const total = fraction ? Number(fraction[2]) : 1;
  const instalment = numbers[numbers.length - 1];
  const text = cleanText(description);
  if (/pago tarjeta|monto cancelado/i.test(text)) {
    return { date, amount: Math.abs(numbers[0]), description: text, kind: 'card_payment', spender };
  }
  if (total > 1) {
    return {
      date,
      amount: -instalment,
      description: text,
      kind: 'installment',
      spender,
      installment: { number: Number(fraction![1]), total, purchaseAmount: numbers[0] },
    };
  }
  const isFee = /servicio administracion|comision|comisión|impuesto|interes|interés/i.test(text);
  return { date, amount: -instalment, description: text, kind: isFee ? 'fee' : 'movement', spender };
}

function parseCmrStatement(lines: string[]): ParsedStatement | null {
  const owner = lines.find(l => /T: Titular/.test(l));
  const last4 = owner?.match(/\*+(\d{4})/)?.[1];
  const billed = moneyAfter(lines, /^Monto Total Facturado a Pagar \|/);
  const minimum = moneyAfter(lines, /^Monto Mínimo a Pagar \|/);
  const dueCells = findCells(lines, /Pagar Hasta \| \d{2}\//);
  const due = dueCells?.find(c => DATE_FULL.test(c));
  const period = findCells(lines, /^Tasa Interés Vigente/);
  const periodEnd = period?.filter(c => DATE_FULL.test(c))[1];
  if (!last4 || billed === null || minimum === null || !due || !periodEnd) return null;

  const start = lines.findIndex(l => l.startsWith('2. PERÍODO ACTUAL'));
  const end = lines.findIndex(l => l.startsWith('III. INFORMACIÓN DE PAGO'));
  const rows: ParsedRow[] = [];
  for (const line of lines.slice(start, end)) {
    const cells = cellsOf(line);
    const dateIndex = cells.findIndex(c => DATE_FULL.test(c));
    if (dateIndex < 0 || dateIndex > 1) continue;
    const fractionCell = cells.find(c => FRACTION.test(c) && !DATE_FULL.test(c));
    if (!fractionCell) continue;
    const ownerIndex = cells.findIndex((c, i) => i > dateIndex && /^(T|A\d)$/.test(c));
    const firstNumber = ownerIndex > 0 ? ownerIndex + 1 : dateIndex + 2;
    const numbers = cells.slice(firstNumber).filter(c => isMoney(c)).map(parseMoney);
    if (!numbers.length) continue;
    rows.push(cardRow(
      toISO(cells[dateIndex]),
      cells[dateIndex + 1],
      ownerIndex > 0 ? cells[ownerIndex] : undefined,
      numbers,
      fractionCell.match(FRACTION),
    ));
  }

  const charged = rows.filter(r => r.kind !== 'card_payment').reduce((sum, r) => sum - r.amount, 0);
  const caeCells = lines.find(l => /^CAE \| /.test(l))?.split(' | ');
  const prepay = moneyAfter(lines, /^Costo Monetario Prepago/);
  return {
    format: 'Estado de cuenta',
    institution: 'CMR Falabella',
    accountKind: 'card',
    accountRef: last4,
    label: 'Tarjeta CMR',
    balance: null,
    reconciled: Math.abs(charged - billed) <= ROUNDING_TOLERANCE,
    card: {
      dueDate: toISO(due),
      billed,
      minimum,
      prepay,
      periodEnd: toISO(periodEnd),
      monthlyRate: percent(period?.[2]),
      cae: percent(caeCells?.[2]),
    },
    rows,
  };
}

function parseCmrUnbilled(lines: string[]): ParsedStatement | null {
  const card = findCells(lines, /^Número de tarjeta/);
  const last4 = card?.[1]?.match(/(\d{4})$/)?.[1];
  if (!last4) return null;
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!DATE_FULL.test(cells[0] ?? '') || !/^(Titular|Adicional)$/.test(cells[2] ?? '')) continue;
    const amount = parseMoney(cells[3]);
    rows.push({
      date: toISO(cells[0]),
      amount: -amount,
      description: cleanText(cells[1].replace(/^COMPRA\s+/i, '')),
      kind: 'movement',
      spender: cells[2] === 'Titular' ? 'titular' : 'adicional',
    });
  }
  return {
    format: 'Movimientos no facturados',
    institution: 'CMR Falabella',
    accountKind: 'card',
    accountRef: last4,
    label: 'Tarjeta CMR',
    balance: null,
    reconciled: rows.length > 0,
    card: null,
    rows,
  };
}

function parseCencosudStatement(lines: string[]): ParsedStatement | null {
  const last4 = lines.find(l => l.startsWith('TARJETA *'))?.match(/\*+(\d{4})/)?.[1];
  const billed = moneyAfter(lines, /^MONTO TOTAL FACTURADO A PAGAR \|/);
  const minimum = moneyAfter(lines, /^MONTO MÍNIMO A PAGAR \|/);
  const due = findCells(lines, /^PAGAR HASTA \|/)?.find(c => DATE_FULL.test(c));
  const period = findCells(lines, /^TASA INTERÉS VIGENTE/);
  const periodEnd = period?.filter(c => DATE_FULL.test(c))[1];
  if (!last4 || billed === null || minimum === null || !due || !periodEnd) return null;

  const start = lines.findIndex(l => l.startsWith('2. PERIODO ACTUAL'));
  const end = lines.findIndex(l => l.startsWith('III. INFORMACIÓN DE PAGO'));
  const rows: ParsedRow[] = [];
  for (const line of lines.slice(start, end)) {
    const cells = cellsOf(line);
    const dateIndex = cells.findIndex(c => DATE_FULL.test(c));
    if (dateIndex < 0 || dateIndex > 1) continue;
    const fractionIndex = cells.findIndex((c, i) => i > dateIndex && FRACTION.test(c));
    if (fractionIndex < 0) continue;
    const before = cells.slice(dateIndex + 2, fractionIndex).filter(isMoney).map(parseMoney);
    const instalment = cells.slice(fractionIndex + 1).filter(isMoney).map(parseMoney);
    if (!before.length || !instalment.length) continue;
    rows.push(cardRow(
      toISO(cells[dateIndex]),
      cells[dateIndex + 1],
      undefined,
      [before[0], instalment[0]],
      cells[fractionIndex].match(FRACTION),
    ));
  }

  const charged = rows.filter(r => r.kind !== 'card_payment').reduce((sum, r) => sum - r.amount, 0);
  const caeCells = lines.find(l => /^CAE \| /.test(l))?.split(' | ');
  return {
    format: 'Estado de cuenta',
    institution: 'Cencosud Scotiabank',
    accountKind: 'card',
    accountRef: last4,
    label: 'Tarjeta Cencosud',
    balance: null,
    reconciled: Math.abs(charged - billed) <= ROUNDING_TOLERANCE,
    card: {
      dueDate: toISO(due),
      billed,
      minimum,
      prepay: moneyAfter(lines, /^COSTO MONETARIO PREPAGO \|/),
      periodEnd: toISO(periodEnd),
      monthlyRate: percent(period?.[2]),
      cae: percent(caeCells?.[2]),
    },
    rows,
  };
}

export function parseStatement(lines: string[]): ParsedStatement | null {
  const text = lines.join('\n');
  if (/TARJETA CENCOSUD/.test(text)) return parseCencosudStatement(lines);
  if (/Tarjeta CMR/.test(text) && /no facturados/.test(text)) return parseCmrUnbilled(lines);
  if (/N° de Contrato/.test(text) && /T: Titular/.test(text)) return parseCmrStatement(lines);
  if (/^FECHA \| DESCRIPCION \| TITULAR\/ADICIONAL/m.test(text)) return parseCmrRecentSheet(lines);
  if (/Banco de Chile/.test(text) && /Detalle Cartola Histórica/.test(text)) return parseChileHistoricSheet(lines);
  if (/Cartola Histórica/.test(text)) return parseFalabellaHistoric(lines);
  if (/Cartola de Movimientos/.test(text)) return parseFalabellaMovements(lines);
  if (/^Fecha \| Descripcion \| Cargo \| Abono \| Saldo/m.test(text)) return parseFalabellaReport(lines);
  if (/Banco de Chile/.test(text) && /^Cuenta(?: N°)?: \|/m.test(text)) return parseChileMovements(lines);
  if (/N° DE CUENTA/.test(text) && /^DESDE \|/m.test(text)) return parseChileStatement(lines);
  return null;
}
