'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './transactions.module.css';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filters
  const [filterAccountId, setFilterAccountId] = useState('');
  const [filterBudgetId, setFilterBudgetId] = useState('');

  // Form State
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [budgetId, setBudgetId] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const accountParam = urlParams.get('account');
      const budgetParam = urlParams.get('budget');
      if (accountParam) setFilterAccountId(accountParam);
      if (budgetParam) setFilterBudgetId(budgetParam);
    }
    
    loadData();
  }, []);

  async function loadData() {
    try {
      const [transRes, accRes, budgRes, profRes] = await Promise.all([
        supabase.from('transactions').select('*').order('created_at', { ascending: false }),
        supabase.from('accounts').select('*'),
        supabase.from('budgets').select('*'),
        supabase.from('profiles').select('*')
      ]);

      if (transRes.error) {
        console.error('Error fetching transactions:', transRes.error);
      }

      if (transRes.data) {
        const enrichedTransactions = transRes.data.map(t => {
          const account = accRes.data?.find(a => a.id === t.account_id);
          const destAccount = accRes.data?.find(a => a.id === t.destination_account_id);
          const budget = budgRes.data?.find(b => b.id === t.budget_id);
          const profile = profRes.data?.find(p => p.id === t.user_id);
          
          return {
            ...t,
            accounts: account ? { name: account.name } : null,
            dest_account: destAccount ? { name: destAccount.name } : null,
            budgets: budget ? { name: budget.name } : null,
            profiles: profile ? { full_name: profile.full_name } : null
          };
        });
        setTransactions(enrichedTransactions);
      }
      
      if (accRes.data) {
        setAccounts(accRes.data);
        if (accRes.data.length > 0) setAccountId(accRes.data[0].id);
      }
      if (budgRes.data) setBudgets(budgRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload: any = {
        type,
        amount: parseFloat(amount),
        description,
        date,
        account_id: accountId || null,
        user_id: user.id
      };

      if (type === 'transfer') {
        payload.destination_account_id = destinationAccountId || null;
      }
      if (type === 'expense' && budgetId) {
        payload.budget_id = budgetId;
      }

      const { error } = await supabase.from('transactions').insert(payload);
      if (error) throw error;

      setIsModalOpen(false);
      // Reset form
      setAmount('');
      setDescription('');
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error al guardar el movimiento');
    }
  }

  async function handleDeleteTransaction(id: string) {
    if (!window.confirm('¿Estás seguro de que quieres eliminar este movimiento?')) return;
    try {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar el movimiento');
    }
  }

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-CL')}`;

  if (loading) return <div className={styles.loading}>Cargando movimientos...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">Movimientos</h1>
          <p className="text-secondary">Registra tus ingresos, egresos y transferencias.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <span>+</span> Registrar Movimiento
        </button>
      </header>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <select className="input-field" style={{ flex: '1 1 200px', padding: '0.5rem 1rem' }} value={filterAccountId} onChange={e => setFilterAccountId(e.target.value)}>
          <option value="">Todas las Cuentas</option>
          {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
        </select>
        <select className="input-field" style={{ flex: '1 1 200px', padding: '0.5rem 1rem' }} value={filterBudgetId} onChange={e => setFilterBudgetId(e.target.value)}>
          <option value="">Todos los Presupuestos</option>
          {budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {(filterAccountId || filterBudgetId) && (
          <button className="btn-secondary" style={{ flex: '1 1 100%', padding: '0.5rem 1rem' }} onClick={() => { setFilterAccountId(''); setFilterBudgetId(''); }}>
            Limpiar Filtros
          </button>
        )}
      </div>

      <div className={styles.feedList}>
        {transactions.length === 0 ? (
          <div className={styles.emptyState}>No hay movimientos registrados.</div>
        ) : (
          transactions.filter(t => {
            if (filterAccountId && t.account_id !== filterAccountId && t.destination_account_id !== filterAccountId) return false;
            if (filterBudgetId && t.budget_id !== filterBudgetId) return false;
            return true;
          }).map(t => (
            <div key={t.id} className={styles.feedItem}>
              <div className={styles.feedInfo}>
                <span className={`${styles.feedIcon} ${t.type === 'income' ? styles.iconIncome : t.type === 'expense' ? styles.iconExpense : styles.iconTransfer}`}>
                  {t.type === 'income' ? '↓' : t.type === 'expense' ? '↑' : '⇄'}
                </span>
                <div className={styles.feedDetails}>
                  <span className={styles.feedTitle}>{t.description}</span>
                  <div className={styles.feedMeta}>
                    <span>{new Date(t.date).toLocaleDateString('es-CL')}</span>
                    {t.budgets?.name && <span>• {t.budgets.name}</span>}
                    <span>• {t.type === 'transfer' ? `${t.accounts?.name} ➔ ${t.dest_account?.name}` : t.accounts?.name}</span>
                  </div>
                </div>
              </div>
              <div className={styles.feedAmount}>
                <span style={{ color: t.type === 'expense' ? 'var(--danger)' : t.type === 'income' ? 'var(--success)' : 'var(--text-primary)' }}>
                  {t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}{formatCurrency(t.amount)}
                </span>
                <button 
                  onClick={() => handleDeleteTransaction(t.id)} 
                  className={styles.deleteBtn}
                  title="Eliminar movimiento"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={`card ${styles.modal}`}>
            <h3 className="h3">Nuevo Movimiento</h3>
            <form onSubmit={handleSubmit} className={styles.form}>
              
              <div className={styles.typeSelector}>
                <button type="button" className={`${styles.typeBtn} ${type === 'expense' ? styles.activeExpense : ''}`} onClick={() => setType('expense')}>Egreso</button>
                <button type="button" className={`${styles.typeBtn} ${type === 'income' ? styles.activeIncome : ''}`} onClick={() => setType('income')}>Ingreso</button>
                <button type="button" className={`${styles.typeBtn} ${type === 'transfer' ? styles.activeTransfer : ''}`} onClick={() => setType('transfer')}>Transferencia</button>
              </div>

              <div className="input-group">
                <label className="input-label">Monto</label>
                <input type="number" className="input-field" placeholder="0" value={amount} onChange={e => setAmount(e.target.value)} required />
              </div>

              <div className="input-group">
                <label className="input-label">Descripción</label>
                <input type="text" className="input-field" placeholder="Ej. Supermercado, Sueldo..." value={description} onChange={e => setDescription(e.target.value)} required />
              </div>

              <div className="input-group">
                <label className="input-label">Fecha</label>
                <input type="date" className="input-field" value={date} onChange={e => setDate(e.target.value)} required />
              </div>

              <div className="input-group">
                <label className="input-label">{type === 'income' ? 'Cuenta de Destino' : 'Cuenta de Origen'}</label>
                <select className="input-field" value={accountId} onChange={e => setAccountId(e.target.value)} required>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
              </div>

              {type === 'transfer' && (
                <div className="input-group">
                  <label className="input-label">Cuenta de Destino</label>
                  <select className="input-field" value={destinationAccountId} onChange={e => setDestinationAccountId(e.target.value)} required>
                    <option value="">Selecciona cuenta</option>
                    {accounts.filter(a => a.id !== accountId).map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                  </select>
                </div>
              )}

              {type === 'expense' && (
                <div className="input-group">
                  <label className="input-label">Presupuesto (Opcional)</label>
                  <select className="input-field" value={budgetId} onChange={e => setBudgetId(e.target.value)}>
                    <option value="">Ninguno</option>
                    {budgets.filter(b => b.account_id === accountId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}



              <div className={styles.modalActions}>
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
