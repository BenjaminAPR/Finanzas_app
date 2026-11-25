'use client';

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { clp, shortDate } from '@/lib/format';
import type { CashPoint } from '@/lib/insights';

const H = 210;
const PAD = { top: 16, right: 12, bottom: 26, left: 52 };

function niceTicks(min: number, max: number, count = 3) {
  const span = Math.max(1, max - min);
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const unit = [1, 2, 2.5, 5, 10].map(m => m * step).find(s => span / s <= count + 1) ?? step * 10;
  const ticks: number[] = [];
  for (let v = Math.floor(min / unit) * unit; ; v += unit) {
    ticks.push(v);
    if (v >= max) break;
  }
  return ticks;
}

// Ancla el globo al borde cuando el punto está cerca de un extremo, para que no se corte.
const tipStyle = (pct: number, top?: string) => ({
  left: `${pct}%`,
  top,
  transform: pct < 25 ? 'translateX(-12%)' : pct > 75 ? 'translateX(-88%)' : 'translateX(-50%)',
});

const short = (v: number) => {
  const abs = Math.abs(v);
  const text = abs >= 1_000_000 ? `${(abs / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M` : `${Math.round(abs / 1000)}k`;
  return `${v < 0 ? '-' : ''}$${text}`;
};

/** Saldo proyectado día a día: una sola serie, con marcadores en los días con movimientos. */
export function CashflowChart({ points, low }: { points: CashPoint[]; low: CashPoint }) {
  const gradient = useId();
  const [active, setActive] = useState<number | null>(null);
  const [W, setW] = useState(640);
  const box = useRef<HTMLDivElement>(null);
  // El dibujo usa el ancho real en píxeles para que el texto no se achique en el celular.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  if (points.length < 2) return null;

  const values = points.map(p => p.balance);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks.at(-1)!;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.top - PAD.bottom);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join('');
  const area = `${line}L${x(points.length - 1).toFixed(1)},${y(yMin)}L${x(0)},${y(yMin)}Z`;
  const lowIndex = points.indexOf(low);
  const labelDays = [0, Math.floor((points.length - 1) / 2), points.length - 1];

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1));
    setActive(Math.max(0, Math.min(points.length - 1, i)));
  };

  const shown = active === null ? null : points[active];
  return (
    <div className="chart" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Saldo proyectado: hoy ${clp(points[0].balance)}, mínimo ${clp(low.balance)} el ${shortDate(low.date)}, al cierre ${clp(points.at(-1)!.balance)}`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent-color)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-zero' : 'chart-grid'} />
            <text x={PAD.left - 8} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">{short(t)}</text>
          </g>
        ))}
        {labelDays.map(i => (
          <text key={i} x={x(i)} y={H - 6} className="chart-axis" textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
            {i === 0 ? 'Hoy' : shortDate(points[i].date)}
          </text>
        ))}
        <path d={area} fill={`url(#${gradient})`} />
        <path d={line} className="chart-line" />
        {points.map((p, i) => p.events.length ? (
          <circle key={p.date} cx={x(i)} cy={y(p.balance)} r={4.5} className={p.events.some(e => e.amount > 0) ? 'chart-dot in' : 'chart-dot'} />
        ) : null)}
        {lowIndex > 0 && (
          <text x={x(lowIndex)} y={y(low.balance) + 18} className="chart-label" textAnchor={lowIndex > points.length * 0.8 ? 'end' : 'middle'}>
            Mínimo {short(low.balance)}
          </text>
        )}
        {shown && (
          <g>
            <line x1={x(active!)} x2={x(active!)} y1={PAD.top} y2={H - PAD.bottom} className="chart-cross" />
            <circle cx={x(active!)} cy={y(shown.balance)} r={5} className="chart-dot active" />
          </g>
        )}
      </svg>
      {shown && (
        <div className="chart-tip" style={tipStyle((x(active!) / W) * 100)}>
          <strong>{shortDate(shown.date)} · {clp(shown.balance)}</strong>
          {shown.events.map((e, i) => (
            <span key={i}>{e.title}: {e.amount > 0 ? '+' : '-'}{clp(Math.abs(e.amount))}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barras verticales por mes. El mes destacado usa el acento; el resto, el color principal. */
export function MonthBars({ data, highlight = 0 }: { data: { label: string; value: number; title: string }[]; highlight?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="chart">
      <div className="bars" role="img" aria-label={data.map(d => d.title).join('; ')}>
        {data.map((d, i) => (
          <button
            type="button"
            key={d.label + i}
            className={`bar ${i === highlight ? 'now' : ''} ${active === i ? 'active' : ''}`}
            onPointerEnter={() => setActive(i)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            aria-label={d.title}
          >
            <i style={{ height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="bars-labels">
        {data.map((d, i) => <span key={d.label + i}>{i % 3 === 0 ? d.label : ''}</span>)}
      </div>
      {active !== null && (
        <div className="chart-tip" style={tipStyle(((active + 0.5) / data.length) * 100, '0.2rem')}>
          <strong>{data[active].title}</strong>
        </div>
      )}
    </div>
  );
}
