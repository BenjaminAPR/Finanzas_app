import { parseDate } from './dates.ts';

export function clp(value: number): string {
  const rounded = Math.round(value);
  const text = Math.abs(rounded).toLocaleString('es-CL');
  return rounded < 0 ? `-$${text}` : `$${text}`;
}

export const shortDate = (iso: string) =>
  parseDate(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '');

export const longDate = (iso: string) =>
  parseDate(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });

export const monthYear = (iso: string) =>
  parseDate(iso).toLocaleDateString('es-CL', { month: 'short', year: 'numeric' }).replace('.', '');

export function dueLabel(days: number): string {
  if (days < -1) return `Venció hace ${-days} días`;
  if (days === -1) return 'Venció ayer';
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  return `En ${days} días`;
}

export function monthsLabel(months: number): string {
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} ${years === 1 ? 'año' : 'años'}`;
  return rest ? `${y} y ${rest} ${rest === 1 ? 'mes' : 'meses'}` : y;
}
