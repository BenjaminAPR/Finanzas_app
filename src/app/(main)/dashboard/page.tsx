'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);
  const [monthIncome, setMonthIncome] = useState(0);
  const [monthExpense, setMonthExpense] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [budgetGoals, setBudgetGoals] = useState<any[]>([]);
  const [lastCierreData, setLastCierreData] = useState<any>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (profileData) setProfile(profileData);

        const { data: accountsData } = await supabase.from('accounts').select('*');
        const { data: transactionsData } = await supabase.from('transactions').select('*');
        const { data: budgetsData } = await supabase.from('budgets').select('*');

        const sortedTx = transactionsData 
          ? [...transactionsData].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) 
          : [];

        // Find the last "Cierre de Mes" marker
        const lastReset = sortedTx.find(tx => tx.description === '🔄 Cierre de Mes');
        const cycleStartDate = lastReset ? new Date(lastReset.created_at) : new Date(0);
        setLastCierreData(lastReset || null);

        const validTx = sortedTx.filter(tx => tx.description !== '🔄 Cierre de Mes' && tx.description !== '🔄 Rollover');

        let globalBalance = 0;
        let processedAccounts = accountsData?.map(acc => ({...acc, balance: 0})) || [];
        
        let mIncome = 0;
        let mExpense = 0;
        let budgetExpenses: Record<string, number> = {};

        validTx.forEach(tx => {
          const txDate = new Date(tx.created_at);
          const isCurrentCycle = txDate > cycleStartDate;

          if (tx.type === 'income') globalBalance += tx.amount;
          if (tx.type === 'expense') globalBalance -= tx.amount;

          const originAcc = processedAccounts.find(a => a.id === tx.account_id);
          const destAcc = processedAccounts.find(a => a.id === tx.destination_account_id);

          if (tx.type === 'income' && originAcc) originAcc.balance += tx.amount; 
          if (tx.type === 'expense' && originAcc) originAcc.balance -= tx.amount;
          if (tx.type === 'transfer') {
            if (originAcc) originAcc.balance -= tx.amount;
            if (destAcc) destAcc.balance += tx.amount;
          }

          if (isCurrentCycle) {
            if (tx.type === 'income' && tx.description !== '[AHORRO] Saldo Inicial') mIncome += tx.amount;
            if (tx.type === 'expense') {
              mExpense += tx.amount;
              if (tx.budget_id) {
                budgetExpenses[tx.budget_id] = (budgetExpenses[tx.budget_id] || 0) + tx.amount;
              }
            }
          }
        });

        // Calculate total savings
        let tSavings = 0;
        processedAccounts.forEach(acc => {
          if (acc.type === 'Cuenta de Ahorro') {
            tSavings += acc.balance;
          }
        });

        const bGoals = budgetsData?.map(b => {
          return {
            ...b,
            amount: b.amount,
            spent: budgetExpenses[b.id] || 0
          };
        }) || [];

        setBudgetGoals(bGoals);
        setRecentTransactions(validTx.slice(0, 5));
        setAccounts(processedAccounts);
        setTotalBalance(globalBalance);
        setTotalSavings(tSavings);
        setMonthIncome(mIncome);
        setMonthExpense(mExpense);
      }
    } catch (error) {
      console.error('Error loading data', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseMonth() {
    if (!window.confirm('¿Estás seguro de que quieres reiniciar el ciclo actual? Los medidores de tus límites y gastos del ciclo volverán a 0, pero tus saldos de dinero quedarán intactos.')) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { error } = await supabase.from('transactions').insert({
        type: 'expense',
        amount: 0,
        description: '🔄 Cierre de Mes',
        date: new Date().toISOString().split('T')[0],
        user_id: user.id
      });
      if (error) throw error;
      
      await loadData();
      setShowReviewModal(true);
    } catch (err) {
      console.error(err);
      alert('Error al reiniciar el ciclo');
    }
  }

  async function handleUndoCloseMonth() {
    if (!lastCierreData) return;
    if (!window.confirm('¿Estás seguro de que quieres deshacer el último reinicio? Se eliminará el marcador y los gastos volverán a sumar.')) return;
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', lastCierreData.id);
      if (error) throw error;

      loadData();
    } catch (err) {
      console.error(err);
      alert('Error al deshacer el reinicio');
    }
  }

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-CL')}`;

  if (loading) return <div className={styles.loading}>Cargando resumen...</div>;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">Inicio</h1>
          <p className="text-secondary">Bienvenido de vuelta, {profile?.full_name || 'Usuario'}.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {lastCierreData && (
            <button 
              onClick={handleUndoCloseMonth}
              className="btn-secondary"
              style={{ color: 'var(--danger)', borderColor: 'var(--danger-bg)' }}
              title="Deshacer último reinicio"
            >
              Deshacer Reinicio
            </button>
          )}
          <button onClick={handleCloseMonth} className="btn-secondary">
            Reiniciar Ciclo
          </button>
          <button className="btn-primary" onClick={() => router.push('/transactions')}>
            Nueva Transacción
          </button>
        </div>
      </header>

      {/* TOP METRICS ROW */}
      <div className={styles.topMetrics}>
        <div className="card">
          <h3 className="h3" style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>Liquidez (Sin Ahorros)</h3>
          <div className={styles.metricAmount} style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(totalBalance - totalSavings)}
          </div>
        </div>
        <div className="card" style={{ borderColor: 'var(--accent-color)' }}>
          <h3 className="h3" style={{ fontSize: '1rem', color: 'var(--accent-color)' }}>Ahorros Totales</h3>
          <div className={styles.metricAmount} style={{ color: 'var(--text-primary)' }}>
            {formatCurrency(totalSavings)}
          </div>
        </div>
        <div className="card">
          <h3 className="h3" style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>Ingresos del Ciclo</h3>
          <div className={styles.metricAmount} style={{ color: 'var(--success)' }}>
            +{formatCurrency(monthIncome)}
          </div>
        </div>
        <div className="card">
          <h3 className="h3" style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>Gastos del Ciclo</h3>
          <div className={styles.metricAmount} style={{ color: 'var(--danger)' }}>
            -{formatCurrency(monthExpense)}
          </div>
        </div>
      </div>

      {/* MIDDLE ROW: ACCOUNTS */}
      <div className="card">
        <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Mis Billeteras</h3>
        <div className={styles.accountsGrid}>
          {accounts.length === 0 ? (
            <p className="text-secondary" style={{ fontSize: '0.9rem' }}>No has creado cuentas o billeteras.</p>
          ) : accounts.map(acc => (
            <div key={acc.id} className={styles.accountCard} onClick={() => router.push(`/transactions?account=${acc.id}`)}>
              <div className={styles.accountInfo}>
                <span className={styles.accountIcon}>🏦</span>
                <div>
                  <div className={styles.accountName}>{acc.name}</div>
                  <div className={styles.accountType}>{acc.type}</div>
                </div>
              </div>
              <div className={styles.accountBalance}>
                {formatCurrency(acc.balance)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BOTTOM ROW: LIMITS AND HISTORY */}
      <div className={styles.bottomLayout}>
        <div className="card">
          <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Límites de Gasto</h3>
          <div className={styles.budgetGoalsList}>
            {budgetGoals.length === 0 ? (
              <p className="text-secondary" style={{ fontSize: '0.9rem' }}>No has creado límites de gasto.</p>
            ) : budgetGoals.map(bg => {
              const percentage = Math.min(100, Math.round((bg.spent / bg.amount) * 100)) || 0;
              const isOver = percentage >= 100;
              return (
                <div key={bg.id} className={styles.budgetGoal}>
                  <div className={styles.budgetGoalHeader}>
                    <span>{bg.name}</span>
                    <span style={{ color: isOver ? 'var(--danger)' : 'var(--text-primary)' }}>{percentage}%</span>
                  </div>
                  <div className={styles.budgetBarBg}>
                    <div className={styles.budgetBarFill} style={{ width: `${percentage}%`, background: isOver ? 'var(--danger)' : percentage > 80 ? 'var(--warning)' : 'var(--accent-color)' }}></div>
                  </div>
                  <div className={styles.budgetGoalSub}>
                    <span>Restante: {formatCurrency(Math.max(0, bg.amount - bg.spent))}</span>
                    <span>{formatCurrency(bg.spent)} / {formatCurrency(bg.amount)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card">
          <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Historial Reciente</h3>
          {recentTransactions.length === 0 ? (
            <p className="text-secondary" style={{ fontSize: '0.9rem' }}>No hay transacciones recientes en este ciclo.</p>
          ) : (
            <div className={styles.recentTxList}>
              {recentTransactions.map(tx => (
                <div key={tx.id} className={styles.recentTxItem}>
                  <div className={styles.txInfo}>
                    <span className={styles.txIcon}>{tx.type === 'income' ? '↓' : tx.type === 'expense' ? '↑' : '⇄'}</span>
                    <div className={styles.txDetails}>
                      <span className={styles.txTitle}>{tx.description}</span>
                      <span className={styles.txDate}>{new Date(tx.date || tx.created_at).toLocaleDateString('es-CL')}</span>
                    </div>
                  </div>
                  <span className={styles.txAmount} style={{ color: tx.type === 'income' ? 'var(--success)' : tx.type === 'expense' ? 'var(--danger)' : 'var(--text-primary)' }}>
                    {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}{formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showReviewModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className="h2" style={{ marginBottom: '1rem' }}>¡Ciclo Reiniciado! 🎯</h2>
            <p className="text-secondary" style={{ marginBottom: '1.5rem', lineHeight: '1.5' }}>
              Has reiniciado exitosamente los contadores para este nuevo ciclo. Tus saldos bancarios siguen intactos.
              <br/><br/>
              Si tus límites de gastos cambiaron, aprovecha de ajustarlos ahora.
            </p>
            <div className={styles.modalActions}>
              <button className="btn-secondary" onClick={() => setShowReviewModal(false)}>Más tarde</button>
              <button className="btn-primary" onClick={() => router.push('/accounts')}>Ir a ajustar límites</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
