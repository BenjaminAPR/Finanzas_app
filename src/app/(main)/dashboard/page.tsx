'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './dashboard.module.css';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [totalBalance, setTotalBalance] = useState(0);
  const [tithe, setTithe] = useState(0);
  const [accounts, setAccounts] = useState<any[]>([]);

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

        // Cargar cuentas y sus balances reales
        const { data: accountsData } = await supabase.from('accounts').select('*');
        const { data: transactionsData } = await supabase.from('transactions').select('*');

        let globalBalance = 0;
        let globalTithe = 0;
        let processedAccounts = accountsData?.map(acc => ({...acc, balance: 0})) || [];

        if (transactionsData) {
          transactionsData.forEach(tx => {
            // Calcular Diezmo separado
            if (tx.is_tithe && tx.type === 'income') {
              globalTithe += tx.amount;
            } else if (tx.is_tithe && tx.type === 'expense') {
              globalTithe -= tx.amount;
            }

            // Calcular balance global (sólo ingresos y egresos, transferencias no cambian el total global)
            if (tx.type === 'income') globalBalance += tx.amount;
            if (tx.type === 'expense') globalBalance -= tx.amount;

            // Calcular balances por cuenta
            const originAcc = processedAccounts.find(a => a.id === tx.account_id);
            const destAcc = processedAccounts.find(a => a.id === tx.destination_account_id);

            if (tx.type === 'income' && originAcc) originAcc.balance += tx.amount; // En DB guardamos income apuntando a account_id como destino
            if (tx.type === 'expense' && originAcc) originAcc.balance -= tx.amount;
            
            if (tx.type === 'transfer') {
              if (originAcc) originAcc.balance -= tx.amount;
              if (destAcc) destAcc.balance += tx.amount;
            }
          });
        }

        setAccounts(processedAccounts);
        setTotalBalance(globalBalance);
        setTithe(globalTithe);
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
          <p className="text-secondary">Aquí está el resumen financiero de tu hogar.</p>
        </div>
        <button className="btn-primary" onClick={() => window.location.href = '/transactions'}>
          <span>+</span> Registrar Movimiento
        </button>
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

        <div className={`card ${styles.titheCard}`}>
          <div className={styles.titheHeader}>
            <h3 className="h3">Fondo de Diezmo</h3>
          </div>
          <div className={styles.amount}>
            {formatCurrency(tithe)}
          </div>
          <p className="text-secondary" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
            Fondo separado de ingresos.
          </p>
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
    </div>
  );
}
