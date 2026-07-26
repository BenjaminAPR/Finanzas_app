'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './accounts.module.css';

export default function AccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [globalBudgets, setGlobalBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('Cuenta Corriente');

  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [newBudgetName, setNewBudgetName] = useState('');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: accData, error } = await supabase
        .from('accounts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const { data: budgetsData } = await supabase
        .from('budgets')
        .select('*, accounts!inner(user_id)')
        .eq('accounts.user_id', user.id);

      const { data: txData } = await supabase.from('transactions').select('*');

      const sortedTx = txData ? [...txData].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) : [];
      const lastReset = sortedTx.find(tx => tx.description === '🔄 Cierre de Mes');
      const cycleStartDate = lastReset ? new Date(lastReset.created_at) : new Date(0);

      // Only process active transactions, ignore legacy rollover/close markers
      const validTx = sortedTx.filter(tx => tx.description !== '🔄 Cierre de Mes' && tx.description !== '🔄 Rollover');

      let processedAccounts = accData?.map(acc => {
        let balance = 0;
        validTx.forEach(tx => {
          if (tx.type === 'income' && tx.account_id === acc.id) balance += tx.amount;
          if (tx.type === 'expense' && tx.account_id === acc.id) balance -= tx.amount;
          if (tx.type === 'transfer') {
            if (tx.account_id === acc.id) balance -= tx.amount;
            if (tx.destination_account_id === acc.id) balance += tx.amount;
          }
        });
        return { ...acc, balance };
      }) || [];
      
      let processedBudgets = budgetsData?.map(b => {
        let spent = 0;
        validTx.forEach(tx => {
          const txDate = new Date(tx.created_at);
          const isCurrentCycle = txDate > cycleStartDate;
          
          if (isCurrentCycle && tx.type === 'expense' && tx.budget_id === b.id) {
            spent += tx.amount;
          }
        });
        return { ...b, amount: b.amount, spent };
      }) || [];
      
      processedBudgets.sort((a: any, b: any) => a.name.localeCompare(b.name));

      setAccounts(processedAccounts);
      setGlobalBudgets(processedBudgets);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('accounts').insert({
        name: newAccountName,
        type: newAccountType,
        user_id: user.id
      });
      
      if (error) throw error;
      setIsAccountModalOpen(false);
      setNewAccountName('');
      loadAccounts();
    } catch (err) {
      console.error(err);
      alert('Error creando cuenta');
    }
  }

  async function handleSaveBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!newBudgetName.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const amount = parseFloat(newBudgetAmount) || 0;

      if (editingBudgetId) {
        const { error } = await supabase.from('budgets').update({
          name: newBudgetName,
          amount: amount
        }).eq('id', editingBudgetId);
        if (error) throw error;
      } else {
        const accIdToUse = accounts.length > 0 ? accounts[0].id : null;
        const { error } = await supabase.from('budgets').insert({
          account_id: accIdToUse,
          name: newBudgetName,
          amount: amount,
          user_id: user.id
        });
        if (error) throw error;
      }
      
      closeBudgetModal();
      loadAccounts();
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Error guardando presupuesto: ' + (err.message || JSON.stringify(err)));
    }
  }

  async function handleDeleteBudget(budgetId: string) {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este presupuesto? Los movimientos asociados perderán su categoría.')) return;
    try {
      const { error } = await supabase.from('budgets').delete().eq('id', budgetId);
      if (error) throw error;
      loadAccounts();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar presupuesto');
    }
  }

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function openNewBudgetModal() {
    setErrorMsg(null);
    setEditingBudgetId(null);
    setNewBudgetName('');
    setNewBudgetAmount('');
    setIsBudgetModalOpen(true);
  }

  function openEditBudgetModal(budget: any) {
    setErrorMsg(null);
    setEditingBudgetId(budget.id);
    setNewBudgetName(budget.name);
    setNewBudgetAmount(budget.amount === 0 ? '' : budget.amount.toString());
    setIsBudgetModalOpen(true);
  }

  function closeBudgetModal() {
    setIsBudgetModalOpen(false);
    setEditingBudgetId(null);
    setNewBudgetName('');
    setNewBudgetAmount('');
  }

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-CL')}`;

  if (loading) return <div className={styles.loading}>Cargando cuentas...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">Billeteras y Límites</h1>
          <p className="text-secondary">Administra tus billeteras y asigna límites de gastos para tu ciclo actual.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn-secondary" onClick={() => openNewBudgetModal()}>
            Nuevo Límite
          </button>
          <button className="btn-primary" onClick={() => setIsAccountModalOpen(true)}>
            Nueva Billetera
          </button>
        </div>
      </header>

      <div>
        <h2 className={styles.sectionTitle}>Mis Billeteras</h2>
        <div className={styles.accountsGrid}>
          {accounts.length === 0 ? (
            <div className={styles.emptyState}>
              No tienes billeteras creadas. Haz clic en "Nueva Billetera" para comenzar.
            </div>
          ) : (
            accounts.map(account => (
              <div key={account.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', cursor: 'pointer' }} onClick={() => router.push(`/transactions?account=${account.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '1.5rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                      {account.type === 'Cuenta de Ahorro' ? '🐷' : '🏦'}
                    </span>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-primary)' }}>{account.name}</h3>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{account.type}</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '0.5rem', color: 'var(--text-primary)' }}>
                  {formatCurrency(account.balance)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <h2 className={styles.sectionTitle}>Límites de Gasto</h2>
        <div className={styles.budgetsGrid}>
          {globalBudgets.length === 0 ? (
            <div className={styles.emptyState}>
              No has creado límites. Úsalos para controlar tus gastos en tu ciclo personal.
            </div>
          ) : (
            globalBudgets.map(b => {
              const isVariable = b.amount === 0;
              const progress = isVariable ? 0 : Math.min((b.spent / b.amount) * 100, 100);
              const isOverBudget = !isVariable && b.spent > b.amount;
              
              return (
                <div key={b.id} className={styles.budgetCard}>
                  <div className={styles.budgetHeader}>
                    <div>
                      <h4 style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{b.name}</h4>
                      <span className={styles.budgetAccount} style={{ background: 'transparent', border: '1px solid var(--border-light)', marginTop: '0.5rem' }}>
                        Límite del Ciclo
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => router.push(`/transactions?budget=${b.id}`)} style={{padding: '0.4rem', fontSize: '1rem', borderRadius: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-light)', cursor: 'pointer', color: 'var(--text-primary)'}} title="Ver movimientos">🔍</button>
                      <button onClick={() => openEditBudgetModal(b)} style={{padding: '0.4rem', fontSize: '1rem', borderRadius: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-color)'}} title="Editar presupuesto">✎</button>
                      <button onClick={() => handleDeleteBudget(b.id)} style={{padding: '0.4rem', fontSize: '1rem', borderRadius: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)'}} title="Eliminar presupuesto">🗑️</button>
                    </div>
                  </div>
                  
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {isVariable ? `Gastado en ciclo: ${formatCurrency(b.spent)}` : `${formatCurrency(b.spent)} / ${formatCurrency(b.amount)}`}
                      </span>
                      {!isVariable && !isOverBudget && (
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                          Quedan: {formatCurrency(b.amount - b.spent)}
                        </span>
                      )}
                      {isOverBudget && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Excedido</span>}
                    </div>
                    {!isVariable && (
                      <div className={styles.budgetProgressBg}>
                        <div className={styles.budgetProgressFill} style={{ width: `${progress}%`, background: isOverBudget ? 'var(--danger)' : progress > 80 ? 'var(--warning)' : 'var(--accent-color)' }}></div>
                      </div>
                    )}
                    {isVariable && (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Presupuesto Flexible (Sin límite máximo)</span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {isAccountModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className="h3">Crear Nueva Cuenta</h3>
            <form onSubmit={handleCreateAccount} className={styles.form}>
              <div className="input-group">
                <label className="input-label">Nombre de la cuenta</label>
                <input type="text" className="input-field" placeholder="Ej. Cuenta Vista" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} required />
              </div>
              <div className="input-group">
                <label className="input-label">Tipo</label>
                <select className="input-field" value={newAccountType} onChange={e => setNewAccountType(e.target.value)}>
                  <option>Cuenta Corriente</option>
                  <option>Cuenta Vista / RUT</option>
                  <option>Cuenta de Ahorro</option>
                  <option>Efectivo</option>
                </select>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn-secondary" onClick={() => setIsAccountModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Cuenta</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isBudgetModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className="h3">{editingBudgetId ? 'Editar Presupuesto' : 'Crear Presupuesto'}</h3>
            <p className="text-secondary" style={{fontSize: '0.9rem', marginTop: '-0.5rem', marginBottom: '1.5rem'}}>
              Define cuánto dinero máximo planeas gastar en esta categoría durante tu ciclo financiero.
            </p>
            {errorMsg && (
              <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', borderRadius: '0.75rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleSaveBudget} className={styles.form}>
              <div className="input-group">
                <label className="input-label">Nombre de la categoría</label>
                <input type="text" className="input-field" placeholder="Ej. Supermercado, Luz, Arriendo..." value={newBudgetName} onChange={e => setNewBudgetName(e.target.value)} required />
              </div>
              <div className="input-group">
                <label className="input-label">Límite del Ciclo (Opcional)</label>
                <input 
                  type="number" 
                  className="input-field" 
                  placeholder="Dejar vacío si no hay límite fijo" 
                  value={newBudgetAmount} 
                  onChange={e => setNewBudgetAmount(e.target.value)} 
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn-secondary" onClick={closeBudgetModal}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar Límite</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
