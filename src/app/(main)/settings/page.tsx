'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const [exporting, setExporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert('Debes iniciar sesión');

      // Fetch all data
      const { data: accounts } = await supabase.from('accounts').select('*').eq('user_id', user.id);
      
      // Since budgets and transactions might not have direct user_id in this old schema, we fetch all where account matches or we just fetch them relying on RLS.
      // Assuming RLS secures it properly for the logged in user
      const { data: budgets } = await supabase.from('budgets').select('*');
      const { data: transactions } = await supabase.from('transactions').select('*');
      const { data: debts } = await supabase.from('debts').select('*');

      const downloadCSV = (data: any[], filename: string) => {
        if (!data || data.length === 0) return;
        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(obj => 
          Object.values(obj).map(v => {
            if (v === null || v === undefined) return '""';
            const str = String(v).replace(/"/g, '""');
            return `"${str}"`;
          }).join(',')
        );
        const csvContent = [headers, ...rows].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();
      };

      downloadCSV(accounts || [], 'cuentas');
      downloadCSV(budgets || [], 'presupuestos');
      downloadCSV(transactions || [], 'movimientos');
      downloadCSV(debts || [], 'deudas');

      alert('Exportación completada. Revisa tus descargas.');
    } catch (error: any) {
      alert('Error exportando datos: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  const handleFactoryReset = async () => {
    if (!confirmReset) return;
    setResetting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Because of constraints, order of deletion matters (or cascade deletes should handle it if setup). 
      // We'll delete transactions first, then budgets/debts, then accounts.
      
      // Actually we can rely on accounts delete cascading to budgets/transactions if setup, 
      // but to be safe we'll delete directly. Since transactions don't have user_id, 
      // we must find account_ids first.
      const { data: accounts } = await supabase.from('accounts').select('id').eq('user_id', user.id);
      const accountIds = accounts?.map(a => a.id) || [];

      if (accountIds.length > 0) {
        await supabase.from('transactions').delete().in('account_id', accountIds);
        await supabase.from('budgets').delete().in('account_id', accountIds);
        await supabase.from('accounts').delete().eq('user_id', user.id);
      }
      
      // Delete debts which might be directly linked to user_id
      await supabase.from('debts').delete().eq('user_id', user.id);
      
      // Sometimes budgets are direct to user_id
      await supabase.from('budgets').delete().eq('user_id', user.id);
      await supabase.from('transactions').delete().eq('user_id', user.id);

      alert('Tus datos han sido borrados por completo. Has empezado desde 0.');
      window.location.href = '/dashboard';
    } catch (error: any) {
      alert('Error reiniciando la cuenta: ' + error.message);
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 className="h2 text-gradient">Configuración</h1>
        <p className="text-secondary">Administra tus datos y preferencias de cuenta.</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <span style={{ fontSize: '2rem' }}>📊</span>
            <div>
              <h3 className="h3" style={{ marginBottom: '0.5rem' }}>Exportar Datos (Google Sheets)</h3>
              <p className="text-secondary" style={{ marginBottom: '1.5rem' }}>
                Descarga todas tus cuentas, presupuestos, movimientos y deudas en archivos CSV. 
                Estos archivos pueden ser importados directamente a Excel o Google Sheets.
              </p>
              <button 
                className="btn-primary" 
                onClick={handleExportCSV} 
                disabled={exporting}
              >
                {exporting ? 'Exportando...' : 'Descargar CSVs'}
              </button>
            </div>
          </div>
        </div>

        <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <span style={{ fontSize: '2rem' }}>⚠️</span>
            <div style={{ width: '100%' }}>
              <h3 className="h3" style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>Zona de Peligro: Empezar desde 0</h3>
              <p className="text-secondary" style={{ marginBottom: '1.5rem' }}>
                Esto eliminará <strong>permanentemente</strong> toda tu información financiera (cuentas, presupuestos, deudas y movimientos). Tu cuenta de usuario seguirá existiendo, pero estará vacía. 
                <br/><br/>
                ¡Asegúrate de exportar tus datos primero!
              </p>
              
              {!confirmReset ? (
                <button 
                  className="btn-danger" 
                  onClick={() => setConfirmReset(true)}
                >
                  Borrar Todos mis Datos
                </button>
              ) : (
                <div style={{ background: 'var(--danger-bg)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <p style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: '1rem' }}>
                    ¿Estás absolutamente seguro? Esta acción no se puede deshacer.
                  </p>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                      className="btn-secondary" 
                      onClick={() => setConfirmReset(false)}
                      disabled={resetting}
                    >
                      Cancelar
                    </button>
                    <button 
                      className="btn-danger" 
                      onClick={handleFactoryReset}
                      disabled={resetting}
                    >
                      {resetting ? 'Borrando...' : 'Sí, borrar definitivamente'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
