'use client';

import { useEffect, type ReactNode } from 'react';
import type { Household } from '@/lib/finance';
import { useHouseholdData } from '@/lib/store';

const ICONS: Record<string, ReactNode> = {
  home: <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  plus: <path d="M12 5v14M5 12h14" />,
  debt: <path d="M3 7h18v11H3zM3 11h18M7 15h3" />,
  wealth: <path d="M4 20V10M10 20V5M16 20v-7M21 20H3" />,
  chart: <path d="M4 19h16M7 16v-5M12 16V7M17 16v-3" />,
  upload: <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M4 19h16" />,
  settings: <path d="M4 7h10M18 7h2M4 17h2M10 17h10M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />,
  logout: <path d="M15 5h4v14h-4M10 8l-4 4 4 4M6 12h10" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  alert: <path d="M12 4 2.8 20h18.4L12 4ZM12 10v4.5M12 17.5h.01" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};

export function Icon({ name, size = 22 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2 className="h3">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Meter({ value, max, warnAt = 0.85 }: { value: number; max: number; warnAt?: number }) {
  const ratio = max > 0 ? value / max : 0;
  const tone = ratio >= 1 ? 'over' : ratio >= warnAt ? 'warn' : '';
  return (
    <div className={`meter ${tone}`} role="progressbar" aria-valuenow={Math.round(Math.min(ratio, 1) * 100)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
    </div>
  );
}

/** Muestra la página solo cuando los datos del hogar están listos. */
export function WithData({ children }: { children: (data: Household, refresh: () => Promise<void>) => ReactNode }) {
  const { data, loading, error, refresh } = useHouseholdData();
  if (loading) {
    return (
      <div className="skeleton" aria-label="Cargando">
        <div style={{ height: 170 }} />
        <div style={{ height: 90 }} />
        <div style={{ height: 240 }} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <div className="notice danger"><Icon name="alert" size={18} /><div>{error ?? 'Inicia sesión para ver tus datos.'}</div></div>
        <button className="btn-secondary" onClick={() => void refresh()}>Reintentar</button>
      </div>
    );
  }
  return <>{children(data, refresh)}</>;
}
