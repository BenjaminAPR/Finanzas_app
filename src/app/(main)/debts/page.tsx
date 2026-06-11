'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './debts.module.css';

export default function DebtsPage() {
  const [debts, setDebts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [installmentsCount, setInstallmentsCount] = useState('1');

  // Pay Installment Modal
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<any>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payAmount, setPayAmount] = useState('');

  // Edit Installment Modal
  const [isEditInstModalOpen, setIsEditInstModalOpen] = useState(false);
  const [selectedEditInst, setSelectedEditInst] = useState<any>(null);
  const [editInstAmount, setEditInstAmount] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [debtsRes, accountsRes] = await Promise.all([
        supabase.from('debts').select(`*, installments(*)`).order('created_at', { ascending: false }),
        supabase.from('accounts').select('*')
      ]);

      if (debtsRes.data) setDebts(debtsRes.data);
      if (accountsRes.data) {
        setAccounts(accountsRes.data);
        if (accountsRes.data.length > 0) setPayAccountId(accountsRes.data[0].id);
      }
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

      const installmentAmount = debtAmount / count;
      const installmentsPayload = Array.from({ length: count }).map((_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() + i);
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
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error creando deuda');
    }
  }

  async function handlePayInstallment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedInstallment || !payAccountId) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const debt = debts.find(d => d.id === selectedInstallment.debt_id);
      const actualAmount = parseFloat(payAmount);
      const originalAmount = selectedInstallment.amount;
      const difference = actualAmount - originalAmount;

      // 1. Crear transacción de egreso por el monto real pagado
      const { data: tx, error: txError } = await supabase.from('transactions').insert({
        type: 'expense',
        amount: actualAmount,
        description: `Pago Cuota ${selectedInstallment.installment_number} - ${debt?.name}`,
        date: new Date().toISOString().split('T')[0],
        account_id: payAccountId,
        user_id: user.id
      }).select().single();

      if (txError) throw txError;

      // 2. Marcar cuota como pagada y actualizar su monto real
      const { error: instError } = await supabase.from('installments')
        .update({ 
          status: 'paid', 
          paid_date: new Date().toISOString().split('T')[0], 
          transaction_id: tx.id,
          amount: actualAmount 
        })
        .eq('id', selectedInstallment.id);

      if (instError) throw instError;

      // 3. Si hay diferencia, ajustarla en la última cuota pendiente de la misma deuda
      if (difference !== 0 && debt?.installments) {
        const pendingInsts = debt.installments.filter((i: any) => i.status === 'pending' && i.id !== selectedInstallment.id);
        if (pendingInsts.length > 0) {
          // Obtener la cuota con el número más alto
          const lastInst = pendingInsts.reduce((prev: any, curr: any) => (prev.installment_number > curr.installment_number) ? prev : curr);
          const newLastAmount = Math.max(lastInst.amount - difference, 0); // Evitar cuotas negativas
          
          const { error: adjError } = await supabase.from('installments')
            .update({ amount: newLastAmount })
            .eq('id', lastInst.id);
            
          if (adjError) throw adjError;
        }
      }

      setIsPayModalOpen(false);
      setSelectedInstallment(null);
      setPayAmount('');
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error al pagar la cuota');
    }
  }

  async function handleEditInstallment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEditInst) return;

    try {
      const newAmount = parseFloat(editInstAmount);
      const { error } = await supabase.from('installments')
        .update({ amount: newAmount })
        .eq('id', selectedEditInst.id);

      if (error) throw error;

      setIsEditInstModalOpen(false);
      setSelectedEditInst(null);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error al editar la cuota');
    }
  }

  async function handleDeleteDebt(debtId: string) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta deuda y todas sus cuotas?')) return;
    try {
      // Intentamos eliminar primero las cuotas (por si acaso no hay borrado en cascada)
      await supabase.from('installments').delete().eq('debt_id', debtId);
      const { error } = await supabase.from('debts').delete().eq('id', debtId);
      
      if (error) throw error;
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar la deuda');
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
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div className={styles.total}>{formatCurrency(debt.total_amount)}</div>
                    <button 
                      onClick={() => handleDeleteDebt(debt.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.25rem', padding: '0.25rem' }}
                      title="Eliminar deuda"
                    >
                      🗑️
                    </button>
                  </div>
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
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button 
                              className={styles.payBtn}
                              onClick={() => {
                                setSelectedInstallment(inst);
                                setPayAmount(inst.amount.toString());
                                setIsPayModalOpen(true);
                              }}
                            >Pagar</button>
                            <button 
                              onClick={() => {
                                setSelectedEditInst(inst);
                                setEditInstAmount(inst.amount.toString());
                                setIsEditInstModalOpen(true);
                              }}
                              style={{ background: 'none', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.25rem 0.5rem', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem' }}
                            >Editar</button>
                          </div>
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

      {isPayModalOpen && selectedInstallment && (
        <div className={styles.modalOverlay}>
          <div className={`card ${styles.modal}`}>
            <h3 className="h3">Pagar Cuota {selectedInstallment.installment_number}</h3>
            <p className="text-secondary" style={{fontSize: '0.875rem', marginTop: '-1rem', marginBottom: '1rem'}}>
              Monto original: {formatCurrency(selectedInstallment.amount)}. Si pagas más o menos de este monto, la diferencia se descontará de la última cuota pendiente de la deuda.
            </p>
            <form onSubmit={handlePayInstallment} className={styles.form}>
              <div className="input-group">
                <label className="input-label">Monto real a pagar</label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={payAmount} 
                  onChange={e => setPayAmount(e.target.value)} 
                  required 
                />
              </div>
              <div className="input-group">
                <label className="input-label">¿Desde qué cuenta quieres pagar?</label>
                <select className="input-field" value={payAccountId} onChange={e => setPayAccountId(e.target.value)} required>
                  <option value="">Selecciona cuenta</option>
                  {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                </select>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn-secondary" onClick={() => setIsPayModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Confirmar Pago</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditInstModalOpen && selectedEditInst && (
        <div className={styles.modalOverlay}>
          <div className={`card ${styles.modal}`}>
            <h3 className="h3">Editar Cuota {selectedEditInst.installment_number}</h3>
            <form onSubmit={handleEditInstallment} className={styles.form}>
              <div className="input-group">
                <label className="input-label">Nuevo monto planificado</label>
                <input 
                  type="number" 
                  className="input-field" 
                  value={editInstAmount} 
                  onChange={e => setEditInstAmount(e.target.value)} 
                  required 
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className="btn-secondary" onClick={() => setIsEditInstModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
