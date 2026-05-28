'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './debts.module.css';

export default function DebtsPage() {
  const [debts, setDebts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [name, setName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState('1');

  useEffect(() => {
    loadDebts();
  }, []);

  async function loadDebts() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('debts')
        .select(`*, installments(*)`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDebts(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateDebt(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const debtAmount = parseFloat(totalAmount);
      const count = parseInt(installmentsCount);

      // Crear deuda
      const { data: newDebt, error: debtError } = await supabase
        .from('debts')
        .insert({
          name,
          total_amount: debtAmount,
          user_id: user.id
        })
        .select()
        .single();
      
      if (debtError) throw debtError;

      // Crear cuotas
      const installmentAmount = debtAmount / count;
      const installmentsPayload = Array.from({ length: count }).map((_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() + i); // Una cuota por mes
        return {
          debt_id: newDebt.id,
          installment_number: i + 1,
          amount: installmentAmount,
          due_date: date.toISOString().split('T')[0],
          status: 'pending'
        };
      });

      const { error: instError } = await supabase.from('installments').insert(installmentsPayload);
      if (instError) throw instError;

      setIsModalOpen(false);
      setName('');
      setTotalAmount('');
      setInstallmentsCount('1');
      loadDebts();
    } catch (err) {
      console.error(err);
      alert('Error creando deuda');
    }
  }

  const formatCurrency = (val: number) => `$${val.toLocaleString('es-CL')}`;

  if (loading) return <div className={styles.loading}>Cargando deudas...</div>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className="h2">Deudas y Cuotas</h1>
          <p className="text-secondary">Controla los préstamos y compras en cuotas del hogar.</p>
        </div>
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
          <span>+</span> Nueva Deuda
        </button>
      </header>

      <div className={styles.grid}>
        {debts.length === 0 ? (
          <div className={styles.emptyState}>No hay deudas registradas. ¡Excelente!</div>
        ) : (
          debts.map(debt => {
            const paidAmount = debt.installments?.filter((i: any) => i.status === 'paid').reduce((acc: number, i: any) => acc + i.amount, 0) || 0;
            const progress = (paidAmount / debt.total_amount) * 100;

            return (
              <div key={debt.id} className={`card ${styles.debtCard}`}>
                <div className={styles.cardHeader}>
                  <h3 className="h3">{debt.name}</h3>
                  <div className={styles.total}>{formatCurrency(debt.total_amount)}</div>
                </div>
                
                <div className={styles.progressContainer}>
                  <div className={styles.progressLabels}>
                    <span>Pagado: {formatCurrency(paidAmount)}</span>
                    <span>Restante: {formatCurrency(debt.total_amount - paidAmount)}</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                <div className={styles.installmentsList}>
                  <h4>Cuotas ({debt.installments?.length})</h4>
                  {debt.installments?.sort((a: any, b: any) => a.installment_number - b.installment_number).map((inst: any) => (
                    <div key={inst.id} className={`${styles.installment} ${inst.status === 'paid' ? styles.paid : ''}`}>
                      <span>Cuota {inst.installment_number}</span>
                      <div className={styles.instDetails}>
                        <span>{formatCurrency(inst.amount)}</span>
                        <span className={styles.instDate}>{new Date(inst.due_date).toLocaleDateString('es-CL')}</span>
                        {inst.status === 'pending' ? (
                          <button className={styles.payBtn}>Pagar</button>
                        ) : (
                          <span className={styles.paidBadge}>✓ Pagado</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div className={styles.modalOverlay}>
          <div className={`card ${styles.modal}`}>
            <h3 className="h3">Nueva Deuda</h3>
            <form onSubmit={handleCreateDebt} className={styles.form}>
              <div className="input-group">
                <label className="input-label">Nombre / Motivo</label>
                <input type="text" className="input-field" placeholder="Ej. Crédito Automotriz" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="input-group">
                <label className="input-label">Monto Total</label>
                <input type="number" className="input-field" placeholder="0" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} required />
              </div>
              <div className="input-group">
                <label className="input-label">Número de Cuotas (Meses)</label>
                <input type="number" className="input-field" min="1" value={installmentsCount} onChange={e => setInstallmentsCount(e.target.value)} required />
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
