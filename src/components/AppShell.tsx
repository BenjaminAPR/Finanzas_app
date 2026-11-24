'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { clearData, useHouseholdData } from '@/lib/store';
import { Icon } from './ui';
import { TransactionSheet } from './TransactionSheet';

const PRIMARY = [
  { label: 'Inicio', path: '/dashboard', icon: 'home' },
  { label: 'Movimientos', path: '/transactions', icon: 'list' },
  { label: 'Deudas', path: '/debts', icon: 'debt' },
  { label: 'Patrimonio', path: '/accounts', icon: 'wealth' },
];
const SECONDARY = [
  { label: 'Análisis', path: '/reports', icon: 'chart' },
  { label: 'Importar cartolas', path: '/import', icon: 'upload' },
  { label: 'Ajustes', path: '/settings', icon: 'settings' },
];

const QuickAddContext = createContext<() => void>(() => {});
export const useQuickAdd = () => useContext(QuickAddContext);

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useHouseholdData();
  const [adding, setAdding] = useState(false);
  const openAdd = useCallback(() => setAdding(true), []);
  const closeAdd = useCallback(() => setAdding(false), []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') clearData();
    });
    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    clearData();
    router.push('/login');
  };

  const isActive = (path: string) => pathname === path || pathname.startsWith(`${path}/`);
  const navLink = (item: { label: string; path: string; icon: string }) => (
    <Link key={item.path} href={item.path} className={`side-link ${isActive(item.path) ? 'active' : ''}`} aria-current={isActive(item.path) ? 'page' : undefined}>
      <Icon name={item.icon} size={20} />{item.label}
    </Link>
  );

  return (
    <QuickAddContext.Provider value={openAdd}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">Finanzas</div>
          <button className="btn-primary side-add" onClick={openAdd}><Icon name="plus" size={18} />Agregar gasto</button>
          {PRIMARY.map(navLink)}
          <div className="side-bottom">
            {SECONDARY.map(navLink)}
            <button className="side-link" onClick={() => void logout()}><Icon name="logout" size={20} />Cerrar sesión</button>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <span className="brand">Finanzas</span>
            <div className="topbar-actions">
              <Link href="/reports" className="icon-btn" aria-label="Análisis"><Icon name="chart" /></Link>
              <Link href="/import" className="icon-btn" aria-label="Importar cartolas"><Icon name="upload" /></Link>
              <Link href="/settings" className="icon-btn" aria-label="Ajustes"><Icon name="settings" /></Link>
            </div>
          </div>
          {children}
        </main>

        <nav className="bottom-nav" aria-label="Principal">
          {PRIMARY.slice(0, 2).map(item => (
            <Link key={item.path} href={item.path} className={`nav-item ${isActive(item.path) ? 'active' : ''}`}><Icon name={item.icon} />{item.label}</Link>
          ))}
          <button className="nav-add" onClick={openAdd} aria-label="Agregar gasto"><Icon name="plus" size={26} /></button>
          {PRIMARY.slice(2).map(item => (
            <Link key={item.path} href={item.path} className={`nav-item ${isActive(item.path) ? 'active' : ''}`}><Icon name={item.icon} />{item.label}</Link>
          ))}
        </nav>
      </div>
      {adding && data && <TransactionSheet data={data} onClose={closeAdd} />}
    </QuickAddContext.Provider>
  );
}
