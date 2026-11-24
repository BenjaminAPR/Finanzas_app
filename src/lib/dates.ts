// Las fechas contables son 'YYYY-MM-DD' y se tratan siempre en hora local.
// new Date('2026-11-01') se interpreta como UTC y en Chile se mostraría el día anterior.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseDate(value: string): Date {
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return parseDate(value).toLocaleDateString('es-CL', options);
}

/** Suma meses sin desbordar: 31 de enero + 1 mes = último día de febrero. */
export function addMonths(iso: string, months: number): string {
  const base = parseDate(iso);
  const day = base.getDate();
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return toISODate(target);
}
