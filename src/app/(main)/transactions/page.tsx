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

  // Form State
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [budgetId, setBudgetId] = useState('');
  const [isTithe, setIsTithe] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [transRes, accRes, budgRes] = await Promise.all([
        supabase.from('transactions').select(`*, profiles(full_name), accounts!transactions_account_id_fkey(name), dest_account:accounts!transactions_destination_account_id_fkey(name), budgets(name)`).order('date', { ascending: false }),
        supabase.from('accounts').select('*'),
        supabase.from('budgets').select('*')
      ]);

      if (transRes.data) setTransactions(transRes.data);
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
        user_id: user.id,
        is_tithe: isTithe
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
      setIsTithe(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error al guardar el movimiento');
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

      <div className={`card ${styles.tableCard}`}>
        {transactions.length === 0 ? (
          <div className={styles.emptyState}>No hay movimientos registrados.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Tipo</th>
                <th>Cuenta</th>
                <th>Usuario</th>
                <th className={styles.alignRight}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td>{new Date(t.date).toLocaleDateString('es-CL')}</td>
                  <td>
                    <div style={{fontWeight: 500}}>{t.description}</div>
                    {t.budgets?.name && <span className={styles.badge}>{t.budgets.name}</span>}
                    {t.is_tithe && <span className={`${styles.badge} ${styles.badgeTithe}`}>Diezmo</span>}
                  </td>
                  <td>
                    <span className={`${styles.typeBadge} ${styles[t.type]}`}>
                      {t.type === 'income' ? 'Ingreso' : t.type === 'expense' ? 'Egreso' : 'Transferencia'}
                    </span>
                  </td>
                  <td>
                    {t.type === 'transfer' 
                      ? `${t.accounts?.name} ➔ ${t.dest_account?.name}`
                      : t.accounts?.name}
                  </td>
                  <td className="text-secondary">{t.profiles?.full_name || 'Usuario'}</td>
                  <td className={`${styles.alignRight} ${t.type === 'expense' ? styles.negative : styles.positive}`}>
                    {t.type === 'expense' ? '-' : '+'}{formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

              {type !== 'transfer' && (
                <div className={styles.checkboxGroup}>
                  <input type="checkbox" id="isTithe" checked={isTithe} onChange={e => setIsTithe(e.target.checked)} />
                  <label htmlFor="isTithe">Es movimiento de Diezmo</label>
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
