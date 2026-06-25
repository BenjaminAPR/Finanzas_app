'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './reports.module.css';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: transactionsData } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }); // Oldest first

      if (!transactionsData) {
        setCycles([]);
        return;
      }

      const generatedCycles: any[] = [];
      let currentCycleIncome = 0;
      let currentCycleExpense = 0;
      let cycleCount = 1;
      let cycleStartDate = transactionsData.length > 0 ? new Date(transactionsData[0].created_at) : new Date();

      transactionsData.forEach((tx) => {
        if (tx.description === '🔄 Cierre de Mes') {
          // Finish the current cycle
          generatedCycles.push({
            id: `cycle-${cycleCount}`,
            name: `Ciclo ${cycleCount}`,
            startDate: cycleStartDate,
            endDate: new Date(tx.created_at),
            Ingresos: currentCycleIncome,
            Gastos: currentCycleExpense,
            Neto: currentCycleIncome - currentCycleExpense
          });
          cycleCount++;
          // Reset for next cycle
          currentCycleIncome = 0;
          currentCycleExpense = 0;
          cycleStartDate = new Date(tx.created_at);
        } else {
          // Add to current cycle
          if (tx.type === 'income' && tx.description !== '[AHORRO] Saldo Inicial') currentCycleIncome += tx.amount;
          if (tx.type === 'expense') currentCycleExpense += tx.amount;
        }
      });

      // Add the final (current) cycle
      generatedCycles.push({
        id: 'cycle-current',
        name: 'Ciclo Actual',
        startDate: cycleStartDate,
        endDate: new Date(),
        Ingresos: currentCycleIncome,
        Gastos: currentCycleExpense,
        Neto: currentCycleIncome - currentCycleExpense
      });

      setCycles(generatedCycles);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-CL')}`;

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-CL', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) return <div className={styles.loading}>Cargando reportes...</div>;

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
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cycles} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="name" stroke="var(--text-secondary)" />
                <YAxis stroke="var(--text-secondary)" tickFormatter={(value) => `$${value/1000}k`} />
                <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} cursor={{fill: 'rgba(0,0,0,0.05)'}} />
                <Legend />
                <Bar dataKey="Ingresos" fill="var(--success)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="var(--danger)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
