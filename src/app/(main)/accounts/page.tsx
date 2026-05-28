'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './accounts.module.css';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('Cuenta Corriente');

  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [newBudgetName, setNewBudgetName] = useState('');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      setLoading(true);
      // Fetch accounts and budgets
      const { data: accData, error } = await supabase
        .from('accounts')
        .select(`*, budgets(*)`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch transactions to calculate balances
      const { data: txData } = await supabase.from('transactions').select('*');

      let processedAccounts = accData?.map(acc => {
        let balance = 0;
        if (txData) {
          txData.forEach(tx => {
            if (tx.type === 'income' && tx.account_id === acc.id) balance += tx.amount;
            if (tx.type === 'expense' && tx.account_id === acc.id) balance -= tx.amount;
            if (tx.type === 'transfer') {
              if (tx.account_id === acc.id) balance -= tx.amount;
              if (tx.destination_account_id === acc.id) balance += tx.amount;
            }
          });
        }
        
        // Calculate used budget amounts
        let budgets = acc.budgets || [];
        budgets = budgets.map((b: any) => {
          let spent = 0;
          if (txData) {
            txData.forEach(tx => {
              if (tx.type === 'expense' && tx.budget_id === b.id) spent += tx.amount;
            });
          }
          return { ...b, spent };
        });

        return { ...acc, balance, budgets };
      }) || [];

      setAccounts(processedAccounts);
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

  async function handleCreateBudget(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAccountId) return;

    try {
      const { error } = await supabase.from('budgets').insert({
        account_id: selectedAccountId,
        name: newBudgetName,
        amount: parseFloat(newBudgetAmount)
      });

      if (error) throw error;
      
      setIsBudgetModalOpen(false);
      setNewBudgetName('');
      setNewBudgetAmount('');
      loadAccounts();
    } catch (err) {
      console.error(err);
      alert('Error creando presupuesto');
    }
  }

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-CL')}`;

  if (loading) return <div className={styles.loading}>Cargando cuentas...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">Cuentas y Presupuestos</h1>
          <p className="text-secondary">Administra tus cuentas bancarias y divide tu dinero en presupuestos.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsAccountModalOpen(true)}>
          <span>+</span> Nueva Cuenta
        </button>
      </header>

      <div className={styles.grid}>
        {accounts.length === 0 ? (
          <div className={styles.emptyState}>
            No tienes cuentas creadas. Haz clic en "Nueva Cuenta" para comenzar.
          </div>
        ) : (
          accounts.map(account => (
            <div key={account.id} className={`card ${styles.accountCard}`}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className="h3">{account.name}</h3>
                  <span className={styles.badge}>{account.type}</span>
                </div>
                <div className={styles.balance}>
                  {formatCurrency(account.balance)}
                </div>
              </div>
              <div className={styles.budgetsSection}>
                <div className={styles.budgetsHeader}>
                  <h4>Presupuestos ({account.budgets?.length || 0})</h4>
                  <button 
                    className={styles.textBtn} 
                    onClick={() => {
                      setSelectedAccountId(account.id);
                      setIsBudgetModalOpen(true);
                    }}
                  >
                    + Añadir
                  </button>
                </div>
                
                {(!account.budgets || account.budgets.length === 0) ? (
                  <p className="text-secondary" style={{fontSize: '0.875rem'}}>
                    Aún no has separado fondos en esta cuenta.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {account.budgets.map((b: any) => {
                      const progress = Math.min((b.spent / b.amount) * 100, 100);
                      const isOverBudget = b.spent > b.amount;
                      
                      return (
                        <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                            <span style={{ fontWeight: 600 }}>{b.name}</span>
                            <span>{formatCurrency(b.spent)} / {formatCurrency(b.amount)}</span>
                          </div>
                          <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${progress}%`, background: isOverBudget ? 'var(--danger)' : 'var(--accent-color)' }}></div>
                          </div>
                          {isOverBudget && <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>¡Presupuesto excedido!</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {isAccountModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={`card ${styles.modal}`}>
            <h3 className="h3">Crear Nueva Cuenta</h3>
            <form onSubmit={handleCreateAccount} className={styles.form}>
              <div className="input-group">
                <label className="input-label">Nombre de la cuenta</label>
                <input type="text" className="input-field" placeholder="Ej. Cuenta Corriente Banco Estado" value={newAccountName} onChange={e => setNewAccountName(e.target.value)} required />
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
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isBudgetModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={`card ${styles.modal}`}>
            <h3 className="h3">Asignar Presupuesto</h3>
            <p className="text-secondary" style={{fontSize: '0.875rem', marginTop: '-1rem'}}>Crea un "sobre virtual" dentro de esta cuenta.</p>
            <form onSubmit={handleCreateBudget} className={styles.form}>
              <div className="input-group">
                <label className="input-label">Nombre del presupuesto</label>
                <input type="text" className="input-field" placeholder="Ej. Supermercado, Luz, Arriendo..." value={newBudgetName} onChange={e => setNewBudgetName(e.target.value)} required />
              </div>
              <div className="input-group">
                <label className="input-label">Monto a asignar mensual</label>
                <input type="number" className="input-field" placeholder="0" value={newBudgetAmount} onChange={e => setNewBudgetAmount(e.target.value)} required />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn-secondary" onClick={() => setIsBudgetModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
