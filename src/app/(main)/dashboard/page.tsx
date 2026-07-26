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
  const [monthIncome, setMonthIncome] = useState(0);
  const [monthExpense, setMonthExpense] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [budgetGoals, setBudgetGoals] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Fetch profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (profileData) setProfile(profileData);

        // Fetch accounts, transactions, budgets
        const { data: accountsData } = await supabase.from('accounts').select('*');
        const { data: transactionsData } = await supabase.from('transactions').select('*');
        const { data: budgetsData } = await supabase.from('budgets').select('*');

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const sortedTx = transactionsData 
          ? [...transactionsData].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) 
          : [];

        // Ignore old "Cierre de Mes" / "Rollover" legacy data for simplicity
        const validTx = sortedTx.filter(tx => tx.description !== '🔄 Cierre de Mes' && tx.description !== '🔄 Rollover');

        let globalBalance = 0;
        let processedAccounts = accountsData?.map(acc => ({...acc, balance: 0})) || [];
        
        let mIncome = 0;
        let mExpense = 0;
        let budgetExpenses: Record<string, number> = {};

        validTx.forEach(tx => {
          const txDate = new Date(tx.date || tx.created_at);
          const isCurrentMonth = txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear;

          // Global Balance Calculation (all time)
          if (tx.type === 'income') globalBalance += tx.amount;
          if (tx.type === 'expense') globalBalance -= tx.amount;

          // Account Balances (all time)
          const originAcc = processedAccounts.find(a => a.id === tx.account_id);
          const destAcc = processedAccounts.find(a => a.id === tx.destination_account_id);

          if (tx.type === 'income' && originAcc) originAcc.balance += tx.amount; 
          if (tx.type === 'expense' && originAcc) originAcc.balance -= tx.amount;
          if (tx.type === 'transfer') {
            if (originAcc) originAcc.balance -= tx.amount;
            if (destAcc) destAcc.balance += tx.amount;
          }

          // Analytics (current month only)
          if (isCurrentMonth) {
            if (tx.type === 'income' && tx.description !== '[AHORRO] Saldo Inicial') mIncome += tx.amount;
            if (tx.type === 'expense') {
              mExpense += tx.amount;
              if (tx.budget_id) {
                budgetExpenses[tx.budget_id] = (budgetExpenses[tx.budget_id] || 0) + tx.amount;
              }
            }
          }
        });

        // Map budgets for current month
        const bGoals = budgetsData?.map(b => {
          return {
            ...b,
            amount: b.amount, // strict monthly limit
            spent: budgetExpenses[b.id] || 0
          };
        }) || [];

        setBudgetGoals(bGoals);
        setRecentTransactions(validTx.slice(0, 5));
        setAccounts(processedAccounts);
        setTotalBalance(globalBalance);
        setMonthIncome(mIncome);
        setMonthExpense(mExpense);
      }
    } catch (error) {
      console.error('Error loading data', error);
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-CL')}`;

  if (loading) return <div className={styles.loading}>Cargando panel...</div>;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">Hola, {profile?.full_name || 'Usuario'} 👋</h1>
          <p className="text-secondary">Aquí está el resumen financiero del mes actual.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={() => router.push('/transactions')}>
            <span>+</span> Nuevo Movimiento
          </button>
        </div>
      </header>

      <div className={styles.dashboardLayout}>
        <div className={styles.col1}>
          <div className={`card ${styles.balanceCard}`}>
            <div className={styles.balanceCardMain}>
              <h3 className="h3">Balance Total</h3>
              <div className={styles.amount}>
                {formatCurrency(totalBalance)}
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.trend} style={{ color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)' }}>
                  Dinero en todas tus cuentas
                </span>
              </div>
            </div>
            <div className={styles.balanceCardSub}>
              <div>
                <h3 className="h3" style={{ fontSize: '0.8rem', color: 'var(--success)' }}>Ingresos del Mes</h3>
                <div className={styles.amount} style={{ fontSize: '1.5rem', color: 'var(--success)' }}>
                  +{formatCurrency(monthIncome)}
                </div>
              </div>
              <div style={{ marginTop: '1rem' }}>
                <h3 className="h3" style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>Gastos del Mes</h3>
                <div className={styles.amount} style={{ fontSize: '1.5rem', color: 'var(--danger)' }}>
                  -{formatCurrency(monthExpense)}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="h3">Transacciones Recientes</h3>
            {recentTransactions.length === 0 ? (
              <p className="text-secondary" style={{ marginTop: '1rem', fontSize: '0.875rem' }}>No hay transacciones recientes.</p>
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

        <div className={styles.col2}>
          <div className="card">
            <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Tus Cuentas</h3>
            <ul className={styles.accountList}>
              {accounts.length === 0 ? (
                <p className="text-secondary" style={{ fontSize: '0.875rem' }}>No has creado cuentas.</p>
              ) : accounts.map(acc => (
                <li key={acc.id} className={styles.accountItem}>
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
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h3 className="h3">Presupuestos del Mes</h3>
            <div className={styles.budgetGoalsList}>
              {budgetGoals.length === 0 ? (
                <p className="text-secondary" style={{ fontSize: '0.875rem' }}>No has creado presupuestos.</p>
              ) : budgetGoals.map(bg => {
                const percentage = Math.min(100, Math.round((bg.spent / bg.amount) * 100)) || 0;
                return (
                  <div key={bg.id} className={styles.budgetGoal}>
                    <div className={styles.budgetGoalHeader}>
                      <span>{bg.name}</span>
                      <span style={{ color: percentage >= 100 ? 'var(--danger)' : 'var(--text-primary)' }}>{percentage}%</span>
                    </div>
                    <div className={styles.budgetBarBg}>
                      <div className={styles.budgetBarFill} style={{ width: `${percentage}%`, background: percentage >= 100 ? 'var(--danger)' : percentage > 80 ? 'var(--warning)' : 'var(--accent-color)' }}></div>
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
        </div>
      </div>
    </div>
  );
}
