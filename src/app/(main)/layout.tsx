'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import styles from './layout.module.css';

export default function MainLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Cuentas y Presupuestos', path: '/accounts', icon: '💳' },
    { label: 'Movimientos', path: '/transactions', icon: '💸' },
    { label: 'Deudas', path: '/debts', icon: '📉' },
  ];

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span className="h3 text-gradient">Finanzas</span>
        </div>
        
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={`${styles.navItem} ${pathname.startsWith(item.path) ? styles.active : ''}`}
            >
              <span className={styles.icon}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.footer}>
          <button onClick={handleLogout} className={styles.logoutBtn}>
            <span>🚪</span> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  );
}
