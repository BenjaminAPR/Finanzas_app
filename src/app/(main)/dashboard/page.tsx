'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './dashboard.module.css';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';

const COLORS = ['#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#27272a', '#3f3f46'];

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);
  const [liquidity, setLiquidity] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);
  
  // Savings State
  const [savingsAccount, setSavingsAccount] = useState<any>(null);
  const [savingsModalOpen, setSavingsModalOpen] = useState(false);
  const [savingsTab, setSavingsTab] = useState<'transfer' | 'initial'>('transfer');
  const [savingsAmount, setSavingsAmount] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  
  // Analytics State
  const [pieData, setPieData] = useState<any[]>([]);
  const [projectedExpenses, setProjectedExpenses] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [budgetGoals, setBudgetGoals] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Obtener perfil
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (profileData) setProfile(profileData);

        // Cargar cuentas, transacciones, presupuestos y cuotas pendientes
        const { data: accountsData } = await supabase.from('accounts').select('*');
        const { data: transactionsData } = await supabase.from('transactions').select('*');
        const { data: budgetsData } = await supabase.from('budgets').select('*');
        const { data: installmentsData } = await supabase.from('installments').select('*').eq('status', 'pending');

        const now = new Date();
        const sortedTx = transactionsData ? [...transactionsData].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : [];
        const lastReset = sortedTx.find(tx => tx.description === '🔄 Cierre de Mes');
        const cycleStartDate = lastReset ? new Date(lastReset.created_at) : new Date(0);

        let globalBalance = 0;
        let processedAccounts = accountsData?.map(acc => ({...acc, balance: 0})) || [];
        
        let monthIncome = 0;
        let monthExpense = 0;
        let budgetExpenses: Record<string, number> = {};
        let budgetRollovers: Record<string, number> = {};

        if (transactionsData) {
          transactionsData.forEach(tx => {
            const isRollover = tx.description === '🔄 Rollover';
            const isCurrentCycle = new Date(tx.created_at) > cycleStartDate && tx.description !== '🔄 Cierre de Mes';
            const isInitialSavings = tx.description === '[AHORRO] Saldo Inicial';

            if (isRollover && isCurrentCycle && tx.budget_id) {
              budgetRollovers[tx.budget_id] = (budgetRollovers[tx.budget_id] || 0) + tx.amount;
            }

            if (!isRollover) {
              // Calcular balance global
              if (tx.type === 'income') globalBalance += tx.amount;
              if (tx.type === 'expense') globalBalance -= tx.amount;

              // Calcular balances por cuenta
              const originAcc = processedAccounts.find(a => a.id === tx.account_id);
              const destAcc = processedAccounts.find(a => a.id === tx.destination_account_id);

              if (tx.type === 'income' && originAcc) originAcc.balance += tx.amount; 
              if (tx.type === 'expense' && originAcc) originAcc.balance -= tx.amount;
              if (tx.type === 'transfer') {
                if (originAcc) originAcc.balance -= tx.amount;
                if (destAcc) destAcc.balance += tx.amount;
              }
            }

            // Analytics del ciclo actual
            if (isCurrentCycle && !isRollover) {
              if (tx.type === 'income' && !isInitialSavings) monthIncome += tx.amount;
              if (tx.type === 'expense') {
                monthExpense += tx.amount;
                if (tx.budget_id) {
                  budgetExpenses[tx.budget_id] = (budgetExpenses[tx.budget_id] || 0) + tx.amount;
                }
              }
            }
          });
        }

        // Construir datos para gráficos
        const newPieData = budgetsData?.filter(b => budgetExpenses[b.id] > 0).map(b => ({
          name: b.name,
          value: budgetExpenses[b.id]
        })) || [];
        setPieData(newPieData);

        const bGoals = budgetsData?.map(b => {
          const rollover = budgetRollovers[b.id] || 0;
          return {
            ...b,
            baseAmount: b.amount, // Guardamos el base original si queremos mostrarlo
            amount: b.amount + rollover, // Limit efectivo
            spent: budgetExpenses[b.id] || 0
          };
        }) || [];
        setBudgetGoals(bGoals);

        const recentTx = sortedTx.filter(tx => tx.description !== '🔄 Cierre de Mes' && tx.description !== '🔄 Rollover').slice(0, 5);
        setRecentTransactions(recentTx);

        // Proyección: Presupuestos fijos + próxima cuota de cada deuda
        let projection = 0;
        if (budgetsData) {
          projection += budgetsData.reduce((acc, b) => acc + (b.amount || 0), 0);
        }
        if (installmentsData) {
          // Agrupar por deuda y buscar la cuota con el número menor (la próxima)
          const nextInstallments: Record<string, number> = {};
          installmentsData.forEach(inst => {
            if (!nextInstallments[inst.debt_id] || inst.installment_number < nextInstallments[inst.debt_id]) {
              nextInstallments[inst.debt_id] = inst.amount; // Guardar monto de la cuota más próxima
            }
          });
          projection += Object.values(nextInstallments).reduce((acc: number, val: number) => acc + val, 0);
        }
        setProjectedExpenses(projection);

        setAccounts(processedAccounts);
        
        const savingsAccounts = processedAccounts.filter(a => a.type === 'Cuenta de Ahorro');
        const totalSavingsAmount = savingsAccounts.reduce((acc, a) => acc + a.balance, 0);
        
        setSavingsAccount(savingsAccounts[0] || null);
        setTotalSavings(totalSavingsAmount);
        setTotalBalance(globalBalance); // Patrimonio Total
        setLiquidity(globalBalance - totalSavingsAmount); // Liquidez
      }
    } catch (error) {
      console.error('Error loading data', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseMonth() {
    if (!window.confirm('¿Estás seguro de que quieres cerrar el mes? El dinero sobrante de tus presupuestos se acumulará como "Rollover" para el próximo ciclo.')) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Calculate leftovers
      const leftovers: { budget_id: string, amount: number }[] = [];
      budgetGoals.forEach(b => {
        const leftover = b.amount - b.spent; // amount aquí ya es base + rollover previo
        if (leftover > 0 && b.baseAmount > 0) { // ignoramos los variables (baseAmount === 0)
          leftovers.push({ budget_id: b.id, amount: leftover });
        }
      });

      const { error } = await supabase.from('transactions').insert({
        type: 'expense',
        amount: 0,
        description: '🔄 Cierre de Mes',
        date: new Date().toISOString().split('T')[0],
        user_id: user.id
      });
      if (error) throw error;
      
      if (leftovers.length > 0) {
        // Pausa breve para asegurar que el Cierre quede antes en created_at
        await new Promise(r => setTimeout(r, 1000));
        
        const rolloverTxs = leftovers.map(l => ({
          type: 'expense',
          amount: l.amount,
          description: '🔄 Rollover',
          date: new Date().toISOString().split('T')[0],
          budget_id: l.budget_id,
          user_id: user.id
        }));
        
        await supabase.from('transactions').insert(rolloverTxs);
      }
      
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error al cerrar el mes');
    }
  }

  async function handleCreateSavingsWallet() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('accounts').insert({
        name: 'Wallet de Ahorros',
        type: 'Cuenta de Ahorro',
        user_id: user.id
      });
      if (error) throw error;
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error creando wallet de ahorros');
    }
  }

  async function handleSaveSavings(e: React.FormEvent) {
    e.preventDefault();
    if (!savingsAccount || !savingsAmount) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const amountNum = parseFloat(savingsAmount);

      if (savingsTab === 'transfer') {
        if (!sourceAccountId) {
          alert('Por favor selecciona una cuenta de origen');
          return;
        }
        const { error } = await supabase.from('transactions').insert({
          type: 'transfer',
          amount: amountNum,
          description: 'Transferencia a Ahorros',
          date: new Date().toISOString().split('T')[0],
          account_id: sourceAccountId,
          destination_account_id: savingsAccount.id,
          user_id: user.id
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('transactions').insert({
          type: 'income',
          amount: amountNum,
          description: '[AHORRO] Saldo Inicial',
          date: new Date().toISOString().split('T')[0],
          account_id: savingsAccount.id,
          user_id: user.id
        });
        if (error) throw error;
      }
      
      setSavingsAmount('');
      setSavingsModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error agregando ahorro');
    }
  }

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-CL')}`;

  if (loading) return <div className={styles.loading}>Cargando panel...</div>;

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">Hola, {profile?.full_name || 'Usuario'} 👋</h1>
          <p className="text-secondary">Aquí está el resumen financiero de tu hogar.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button 
            onClick={handleCloseMonth}
            style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '0.75rem', padding: '0.75rem 1rem', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500 }}
          >
            🔄 Cerrar Mes
          </button>
          <button className="btn-primary" onClick={() => router.push('/transactions')}>
            <span>+</span> Movimiento
          </button>
        </div>
      </header>

      <div className={styles.dashboardLayout}>
        {/* COLUMNA 1 */}
        <div className={styles.col1}>
          <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
            <div>
              <h3 className="h3" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Liquidez Disponible (Sin Ahorros)</h3>
              <div className={styles.amount} style={{ fontSize: '3rem', marginTop: '0.25rem' }}>
                {formatCurrency(liquidity)}
              </div>
              <div className={styles.cardFooter} style={{ marginTop: '0.5rem' }}>
                <span className={styles.trend} style={{ color: 'var(--success)' }}>Dinero listo para gastar</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', borderLeft: '1px solid var(--border-color)', paddingLeft: '2rem' }}>
              <h3 className="h3" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Patrimonio Total</h3>
              <div className={styles.amount} style={{ fontSize: '1.5rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {formatCurrency(totalBalance)}
              </div>
              <div className={styles.cardFooter} style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <span className={styles.trend}>Incluye tus ahorros</span>
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
                        <span className={styles.txDate}>{new Date(tx.date).toLocaleDateString('es-CL')}</span>
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

        {/* COLUMNA 2 */}
        <div className={styles.col2}>
          <div className="card">
            <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Tus Cuentas</h3>
            <ul className={styles.accountList}>
              {accounts.filter(a => a.type !== 'Cuenta de Ahorro').length === 0 ? (
                <p className="text-secondary" style={{ fontSize: '0.875rem' }}>No hay cuentas regulares.</p>
              ) : accounts.filter(a => a.type !== 'Cuenta de Ahorro').map(acc => (
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

            <h4 className="h4" style={{ marginTop: '2rem', marginBottom: '1rem' }}>Wallet de Ahorros</h4>
            {!savingsAccount ? (
              <div>
                <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>Cuenta única para separar y guardar tu dinero a futuro.</p>
                <button className="btn-secondary" onClick={handleCreateSavingsWallet} style={{ width: '100%', padding: '0.5rem' }}>Activar Wallet</button>
              </div>
            ) : (
              <div className={styles.accountItem} style={{ border: '1px solid var(--accent-color)', background: 'var(--bg-primary)' }}>
                <div className={styles.accountInfo}>
                  <span className={styles.accountIcon} style={{ background: 'rgba(0, 113, 227, 0.1)', color: 'var(--accent-color)' }}>🐷</span>
                  <div>
                    <div className={styles.accountName}>Ahorros</div>
                    <div className={styles.accountBalance} style={{ fontSize: '1rem' }}>{formatCurrency(savingsAccount.balance)}</div>
                  </div>
                </div>
                <button className="btn-primary" onClick={() => setSavingsModalOpen(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>Transferir</button>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="h3">Metas de Presupuesto</h3>
            <div className={styles.budgetGoalsList}>
              {budgetGoals.length === 0 ? (
                <p className="text-secondary" style={{ fontSize: '0.875rem' }}>No has creado presupuestos.</p>
              ) : budgetGoals.map(bg => {
                const percentage = Math.min(100, Math.round((bg.spent / bg.amount) * 100)) || 0;
                return (
                  <div key={bg.id} className={styles.budgetGoal}>
                    <div className={styles.budgetGoalHeader}>
                      <span>
                        {bg.name}
                        {bg.amount > bg.baseAmount && <span style={{ marginLeft: '0.5rem', color: 'var(--success)', fontSize: '0.7rem' }}>+ {formatCurrency(bg.amount - bg.baseAmount)} Roll</span>}
                      </span>
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

      {savingsModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className="h2" style={{ marginBottom: '1.5rem' }}>Ingresar Ahorro</h2>
            
            <div className={styles.modalTabs} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <button 
                className={savingsTab === 'transfer' ? 'btn-primary' : 'btn-secondary'} 
                onClick={() => setSavingsTab('transfer')}
                style={{ flex: 1, padding: '0.5rem' }}
              >
                Transferir
              </button>
              <button 
                className={savingsTab === 'initial' ? 'btn-primary' : 'btn-secondary'} 
                onClick={() => setSavingsTab('initial')}
                style={{ flex: 1, padding: '0.5rem' }}
              >
                Ajuste Directo
              </button>
            </div>

            <form onSubmit={handleSaveSavings}>
              {savingsTab === 'transfer' && (
                <div className={styles.formGroup} style={{ marginBottom: '1rem' }}>
                  <label className="input-label">Desde Cuenta</label>
                  <select 
                    className="input-field" 
                    value={sourceAccountId} 
                    onChange={(e) => setSourceAccountId(e.target.value)}
                    required
                  >
                    <option value="">Selecciona cuenta origen</option>
                    {accounts.filter(a => a.id !== savingsAccount?.id).map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                    ))}
                  </select>
                </div>
              )}

              {savingsTab === 'initial' && (
                <div style={{ marginBottom: '1rem' }}>
                  <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
                    Esto registrará el dinero que ya tenías sin afectar tus reportes de ingresos mensuales.
                  </p>
                </div>
              )}

              <div className={styles.formGroup} style={{ marginBottom: '1.5rem' }}>
                <label className="input-label">Monto</label>
                <input 
                  type="number" 
                  className="input-field" 
                  placeholder="0" 
                  value={savingsAmount} 
                  onChange={e => setSavingsAmount(e.target.value)} 
                  required 
                  min="1"
                />
              </div>

              <div className={styles.modalActions} style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setSavingsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Ahorro</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
