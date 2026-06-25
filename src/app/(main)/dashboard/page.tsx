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
  const [accounts, setAccounts] = useState<any[]>([]);
  
  // Savings State
  const [savingsAccount, setSavingsAccount] = useState<any>(null);
  const [savingsModalOpen, setSavingsModalOpen] = useState(false);
  const [savingsTab, setSavingsTab] = useState<'transfer' | 'initial'>('transfer');
  const [savingsAmount, setSavingsAmount] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  
  // Analytics State
  const [pieData, setPieData] = useState<any[]>([]);
  const [barData, setBarData] = useState<any[]>([]);
  const [projectedExpenses, setProjectedExpenses] = useState(0);

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

        if (transactionsData) {
          transactionsData.forEach(tx => {
            const isCurrentCycle = new Date(tx.created_at) > cycleStartDate && tx.description !== '🔄 Cierre de Mes';
            const isInitialSavings = tx.description === '[AHORRO] Saldo Inicial';

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

            // Analytics del ciclo actual
            if (isCurrentCycle) {
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

        setBarData([
          { name: 'Este Mes', Ingresos: monthIncome, Gastos: monthExpense }
        ]);

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
        
        const savingsAcc = processedAccounts.find(a => a.type === 'Cuenta de Ahorro');
        setSavingsAccount(savingsAcc || null);
        
        setTotalBalance(globalBalance);
      }
    } catch (error) {
      console.error('Error loading data', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseMonth() {
    if (!window.confirm('¿Estás seguro de que quieres cerrar el mes? Esto reiniciará tus presupuestos y gráficos a $0 para comenzar un nuevo ciclo. Tus saldos bancarios y tu historial quedarán intactos.')) return;
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

      <div className={styles.grid}>
        <div className={`card ${styles.mainCard}`}>
          <h3 className="h3">Balance Total</h3>
          <div className={styles.amount}>
            {formatCurrency(totalBalance)}
          </div>
          <div className={styles.cardFooter}>
            <span className={styles.trend}>↑ Actualizado hoy</span>
          </div>
        </div>

        <div className={`card ${styles.savingsCard}`}>
          <div className={styles.cardHeader}>
            <h3 className="h3">Wallet de Ahorros</h3>
          </div>
          {!savingsAccount ? (
             <div style={{ marginTop: '1rem' }}>
               <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>Cuenta única para separar y guardar tu dinero a futuro.</p>
               <button className="btn-secondary" onClick={handleCreateSavingsWallet} style={{ width: '100%', padding: '0.5rem' }}>Activar Wallet</button>
             </div>
          ) : (
             <>
               <div className={styles.amount}>
                 {formatCurrency(savingsAccount.balance)}
               </div>
               <button className="btn-secondary" onClick={() => setSavingsModalOpen(true)} style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}>+ Ingresar Ahorro</button>
             </>
          )}
        </div>

        <div className={`card ${styles.projectionCard}`}>
          <div className={styles.cardHeader}>
            <h3 className="h3">Proyección Próximo Mes</h3>
          </div>
          <div className={styles.amount}>
            {formatCurrency(projectedExpenses)}
          </div>
          <p className="text-secondary" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
            Suma de tus presupuestos fijos y cuotas de deuda pendientes.
          </p>
        </div>

        <div className={`card ${styles.chartCard}`}>
          <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Gastos por Presupuesto (Este mes)</h3>
          <div style={{ height: 300 }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    fill="#8884d8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value: any) => formatCurrency(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.emptyState}>No hay gastos en presupuestos este mes.</div>
            )}
          </div>
        </div>

        <div className={`card ${styles.chartCard}`}>
          <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Flujo de Caja (Este mes)</h3>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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

        <div className={`card ${styles.accountsCard}`}>
          <h3 className="h3" style={{ marginBottom: '1.5rem' }}>Tus Cuentas</h3>
          {accounts.length === 0 ? (
            <p className="text-secondary">No hay cuentas creadas aún.</p>
          ) : (
            <ul className={styles.accountList}>
              {accounts.map(acc => (
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
          )}
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
