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

          // Cargar cuentas
          const { data: accountsData } = await supabase
            .from('accounts')
            .select('*');
          
          if (accountsData) setAccounts(accountsData);
          
          // Por ahora mockearemos el total balance hasta armar las queries reales
          setTotalBalance(0);
        }
      } catch (error) {
        console.error('Error loading data', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return <div className={styles.loading}>Cargando panel...</div>;
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">Hola, {profile?.full_name || 'Usuario'} 👋</h1>
          <p className="text-secondary">Aquí está el resumen financiero de tu hogar.</p>
        </div>
        <button className="btn-primary">
          <span>+</span> Registrar Movimiento
        </button>
      </header>

      <div className={styles.grid}>
        {/* Balance Total Card */}
        <div className={`card ${styles.mainCard}`}>
          <h3 className="h3">Balance Total</h3>
          <div className={styles.amount}>
            ${totalBalance.toLocaleString('es-CL')}
          </div>
          <div className={styles.cardFooter}>
            <span className={styles.trend}>↑ Actualizado hoy</span>
          </div>
        </div>

        {/* Diezmo Card */}
        <div className={`card ${styles.titheCard}`}>
          <div className={styles.titheHeader}>
            <h3 className="h3">Fondo de Diezmo</h3>
            <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
              Agregar
            </button>
          </div>
          <div className={styles.amount}>
            ${tithe.toLocaleString('es-CL')}
          </div>
          <p className="text-secondary" style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
            Dinero apartado manualmente este mes.
          </p>
        </div>

        {/* Cuentas */}
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
                    $0 {/* TODO: Calcular balance */}
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
