'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { formatDate as formatLocalDate, todayISO } from '@/lib/dates';
import { buildCycles } from '@/lib/finance';
import { useHouseholdData } from '@/lib/store';
import styles from './reports.module.css';

// recharts es pesado: solo se descarga al abrir Reportes
const ReportsChart = dynamic(() => import('./ReportsChart'), { ssr: false });

export default function ReportsPage() {
  const { data, loading, error } = useHouseholdData();
  const cycles = useMemo(() => buildCycles(data?.transactions ?? [], todayISO()), [data]);

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-CL')}`;

  const formatDate = (date: string) => formatLocalDate(date, { month: 'short', day: 'numeric', year: 'numeric' });

  if (loading) return <div className={styles.loading}>Cargando reportes...</div>;
  if (error && !data) return <div className={styles.loading}>{error}</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">Reportes Históricos</h1>
          <p className="text-secondary">Visualiza tu rendimiento financiero a lo largo de cada ciclo.</p>
        </div>
      </header>

      <div className={styles.grid}>
        <div className={`card ${styles.chartCard}`}>
          <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Evolución de Ciclos</h3>
          <div style={{ height: 400 }}>
            <ReportsChart cycles={cycles} />
          </div>
        </div>

        <div className="card">
          <h3 className="h3" style={{ marginBottom: '1rem' }}>Detalle de Ciclos</h3>
          <div className={styles.feedList}>
            {cycles.map((cycle) => (
              <div key={cycle.id} className={styles.feedItem}>
                <div className={styles.feedDetails}>
                  <span className={styles.feedTitle}>{cycle.name}</span>
                  <span className={styles.feedMeta}>{formatDate(cycle.startDate)} - {formatDate(cycle.endDate)}</span>
                </div>
                <div className={styles.feedAmounts}>
                  <div className={styles.amountBlock}>
                    <span className={styles.amountLabel}>Ingresos</span>
                    <span className={styles.amountPositive}>{formatCurrency(cycle.Ingresos)}</span>
                  </div>
                  <div className={styles.amountBlock}>
                    <span className={styles.amountLabel}>Gastos</span>
                    <span className={styles.amountNegative}>{formatCurrency(cycle.Gastos)}</span>
                  </div>
                  <div className={styles.amountBlock}>
                    <span className={styles.amountLabel}>Flujo Neto</span>
                    <span className={cycle.Neto > 0 ? styles.amountPositive : cycle.Neto < 0 ? styles.amountNegative : styles.amountNeutral}>
                      {formatCurrency(cycle.Neto)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
