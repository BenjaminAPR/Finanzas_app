'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { Icon, WithData } from '@/components/ui';
import { clp, shortDate } from '@/lib/format';
import { normalize, type Household } from '@/lib/finance';
import { buildImport, type ImportRow } from '@/lib/import/classify';
import { commitImport } from '@/lib/import/commit';
import { parseStatement, type ParsedStatement } from '@/lib/import/parse';
import { refreshData } from '@/lib/store';

type LoadedFile = { name: string; statement: ParsedStatement | null; error?: string };

function Importer({ data }: { data: Household }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [categoryOverride, setCategoryOverride] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statements = useMemo(() => files.flatMap(f => (f.statement ? [f.statement] : [])), [files]);
  const rows = useMemo(
    () => buildImport(statements, data.accounts, data.budgets, data.rules, data.settings.own_names, data.transactions, mapping),
    [statements, data, mapping],
  );
  const unmatched = useMemo(() => {
    const refs = new Map<string, ParsedStatement>();
    for (const s of statements) {
      if (!mapping[s.accountRef] && !data.accounts.some(a => a.statement_ref === s.accountRef)) refs.set(s.accountRef, s);
    }
    return [...refs.values()];
  }, [statements, mapping, data.accounts]);

  const isOn = (r: ImportRow) => included[r.key] ?? r.decision === 'new';
  const fresh = rows.filter(r => r.decision === 'new');
  const review = rows.filter(r => r.decision === 'review');
  const skipped = rows.filter(r => r.decision === 'existing' || r.decision === 'internal' || r.decision === 'plan');
  const selected = [...fresh, ...review].filter(isOn);

  async function addFiles(list: File[]) {
    setReading(true);
    setResult(null);
    setError(null);
    const { extractLines } = await import('@/lib/import/pdf');
    const loaded: LoadedFile[] = [];
    for (const file of list) {
      try {
        const statement = parseStatement(await extractLines(file));
        loaded.push({ name: file.name, statement, error: statement ? undefined : 'Formato no reconocido' });
      } catch {
        loaded.push({ name: file.name, statement: null, error: 'No se pudo leer el PDF' });
      }
    }
    setFiles(current => [...current, ...loaded]);
    setReading(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) void addFiles(Array.from(e.dataTransfer.files));
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const finalRows = selected.map(r => ({ ...r, budgetId: categoryOverride[r.key] ?? r.budgetId }));
      const learned = new Map<string, string>();
      for (const r of selected) {
        const budgetId = categoryOverride[r.key];
        if (budgetId && r.merchant.length >= 4) learned.set(normalize(r.merchant), budgetId);
      }
      const count = await commitImport(
        finalRows, rows, statements, data, mapping,
        [...learned.entries()].map(([pattern, budgetId]) => ({ pattern, budgetId })),
      );
      await refreshData();
      setFiles([]);
      setMapping({});
      setIncluded({});
      setCategoryOverride({});
      setResult(`Listo: ${count} movimientos nuevos y saldos actualizados.`);
    } catch (err) {
      console.error(err);
      setError('No se pudo completar la importación. Puedes reintentar sin riesgo de duplicar.');
    } finally {
      setSaving(false);
    }
  }

  const renderRow = (r: ImportRow) => (
    <div className="row" key={r.key}>
      <input type="checkbox" checked={isOn(r)} aria-label={`Incluir ${r.description}`} onChange={e => setIncluded(c => ({ ...c, [r.key]: e.target.checked }))} style={{ width: 20, height: 20, flex: 'none' }} />
      <div className="row-main">
        <div className="row-title">{r.description}</div>
        <div className="row-sub">{shortDate(r.date)} · {r.reason}{r.spender === 'adicional' ? ' · Adicional' : ''}</div>
      </div>
      {r.amount < 0 && (
        <select className="input-field" aria-label={`Categoría de ${r.description}`} style={{ width: 128, minHeight: 36, padding: '0.2rem 0.4rem', fontSize: '0.8rem', flex: 'none' }} value={categoryOverride[r.key] ?? r.budgetId ?? ''} onChange={e => setCategoryOverride(c => ({ ...c, [r.key]: e.target.value }))}>
          <option value="">Sin categoría</option>
          {data.budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      <div className={`row-end ${r.amount > 0 ? 'pos' : ''}`}>{r.amount > 0 ? '+' : ''}{clp(r.amount)}</div>
    </div>
  );

  return (
    <div className="page">
      <h1 className="h1">Importar cartolas</h1>

      <div
        className={`dropzone ${over ? 'over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
        onDragOver={e => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <Icon name="upload" size={28} />
        <strong>{reading ? 'Leyendo…' : 'Elige o arrastra sus PDF'}</strong>
        <span className="text-muted">Banco de Chile, Falabella, CMR y Cencosud. Se leen en este dispositivo.</span>
        <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={e => {
          // Se copia antes de limpiar: FileList queda vacío al reiniciar el input.
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (chosen.length) void addFiles(chosen);
        }} />
      </div>

      {result && <div className="notice ok" role="status"><Icon name="check" size={18} />{result}</div>}
      {error && <div className="notice danger" role="alert">{error}</div>}

      {files.length > 0 && (
        <section className="card">
          <h2 className="h3" style={{ marginBottom: '0.3rem' }}>Documentos</h2>
          <div className="list">
            {files.map((f, i) => (
              <div className="row" key={`${f.name}-${i}`}>
                <div className="row-main">
                  <div className="row-title">{f.statement ? `${f.statement.institution} · ${f.statement.label}` : f.name}</div>
                  <div className="row-sub">{f.statement ? `${f.statement.format} · ${f.statement.rows.length} movimientos` : f.error}</div>
                </div>
                {f.statement
                  ? <span className={`badge ${f.statement.reconciled ? 'ok' : 'warn'}`}>{f.statement.reconciled ? 'Cuadra' : 'Revisar'}</span>
                  : <span className="badge danger">Error</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {unmatched.length > 0 && (
        <section className="card form-stack">
          <h2 className="h3">¿A qué cuenta corresponden?</h2>
          {unmatched.map(s => (
            <div className="input-group" key={s.accountRef}>
              <label className="input-label" htmlFor={`map-${s.accountRef}`}>{s.institution} · {s.label} terminada en {s.accountRef.slice(-4)}</label>
              <select id={`map-${s.accountRef}`} className="input-field" value="" onChange={e => setMapping(m => ({ ...m, [s.accountRef]: e.target.value }))}>
                <option value="">Elegir cuenta</option>
                {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          ))}
          <Link className="card-link" href="/accounts">Crear una cuenta nueva</Link>
        </section>
      )}

      {review.length > 0 && (
        <section className="card">
          <h2 className="h3">Por revisar ({review.length})</h2>
          <p className="text-muted">Quedan fuera salvo que los marques.</p>
          <div className="list">{review.map(renderRow)}</div>
        </section>
      )}

      {fresh.length > 0 && (
        <section className="card">
          <h2 className="h3" style={{ marginBottom: '0.3rem' }}>Nuevos ({fresh.length})</h2>
          <div className="list">{fresh.map(renderRow)}</div>
        </section>
      )}

      {skipped.length > 0 && (
        <details className="card">
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>No se agregarán ({skipped.length})</summary>
          <div className="list" style={{ marginTop: '0.4rem' }}>
            {skipped.map(r => (
              <div className="row" key={r.key}>
                <div className="row-main"><div className="row-title">{r.description}</div><div className="row-sub">{shortDate(r.date)} · {r.reason}</div></div>
                <div className="row-end">{clp(r.amount)}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      {statements.length > 0 && (
        <button className="btn-primary btn-block" disabled={saving || unmatched.length > 0} onClick={() => void confirm()}>
          {saving ? 'Importando…' : `Importar ${selected.length} movimientos`}
        </button>
      )}
    </div>
  );
}

export default function ImportPage() {
  return <WithData>{data => <Importer data={data} />}</WithData>;
}
