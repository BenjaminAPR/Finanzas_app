'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './accounts.module.css';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('Cuenta Corriente');

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('accounts')
        .select('*');
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
      setIsModalOpen(false);
      setNewAccountName('');
      loadAccounts();
    } catch (err) {
      console.error(err);
      alert('Error creando cuenta');
    }
  }

  if (loading) return <div className={styles.loading}>Cargando cuentas...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">Cuentas y Presupuestos</h1>
          <p className="text-secondary">Administra tus cuentas bancarias y divide tu dinero en presupuestos.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
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
                  $0 {/* Total balance de cuenta por calcular */}
                </div>
              </div>
              <div className={styles.budgetsSection}>
                <div className={styles.budgetsHeader}>
                  <h4>Presupuestos en esta cuenta</h4>
                  <button className={styles.textBtn}>+ Añadir Presupuesto</button>
                </div>
                <p className="text-secondary" style={{fontSize: '0.875rem'}}>
                  Aún no has separado fondos en esta cuenta.
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
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
