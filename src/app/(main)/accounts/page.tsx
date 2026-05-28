'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './accounts.module.css';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Account Modal
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('Cuenta Corriente');

  // Budget Modal
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
      const { data, error } = await supabase
        .from('accounts')
        .select(`*, budgets(*)`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAccounts(data || []);
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
                  {/* Balance goes here once calculated */}
                  Cuenta
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {account.budgets.map((b: any) => (
                      <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', padding: '0.5rem', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontWeight: 500 }}>{b.name}</span>
                        <span>{formatCurrency(b.amount)} asignado</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Cuenta */}
      {isAccountModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={`card ${styles.modal}`}>
            <h3 className="h3">Crear Nueva Cuenta</h3>
            <form onSubmit={handleCreateAccount} className={styles.form}>
              <div className="input-group">
                <label className="input-label">Nombre de la cuenta</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej. Cuenta Corriente Banco Estado"
                  value={newAccountName}
                  onChange={e => setNewAccountName(e.target.value)}
                  required 
                />
              </div>
              <div className="input-group">
                <label className="input-label">Tipo</label>
                <select 
                  className="input-field"
                  value={newAccountType}
                  onChange={e => setNewAccountType(e.target.value)}
                >
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

      {/* Modal de Presupuesto */}
      {isBudgetModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={`card ${styles.modal}`}>
            <h3 className="h3">Asignar Presupuesto</h3>
            <p className="text-secondary" style={{fontSize: '0.875rem', marginTop: '-1rem'}}>
              Crea un "sobre virtual" dentro de esta cuenta para separar tu dinero.
            </p>
            <form onSubmit={handleCreateBudget} className={styles.form}>
              <div className="input-group">
                <label className="input-label">Nombre del presupuesto</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="Ej. Supermercado, Luz, Arriendo..."
                  value={newBudgetName}
                  onChange={e => setNewBudgetName(e.target.value)}
                  required 
                />
              </div>
              <div className="input-group">
                <label className="input-label">Monto a asignar mensual</label>
                <input 
                  type="number" 
                  className="input-field" 
                  placeholder="0"
                  value={newBudgetAmount}
                  onChange={e => setNewBudgetAmount(e.target.value)}
                  required 
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn-secondary" onClick={() => { setIsBudgetModalOpen(false); setNewBudgetName(''); setNewBudgetAmount(''); }}>Cancelar</button>
                <button type="submit" className="btn-primary">Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
