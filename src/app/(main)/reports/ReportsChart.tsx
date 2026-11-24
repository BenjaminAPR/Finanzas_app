'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip } from 'recharts';
import type { Cycle } from '@/lib/finance';

export default function ReportsChart({ cycles }: { cycles: Cycle[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={cycles} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
        <XAxis dataKey="name" stroke="var(--text-secondary)" />
        <YAxis stroke="var(--text-secondary)" tickFormatter={(value) => `$${value / 1000}k`} />
        <Tooltip formatter={(value) => `$${Number(value).toLocaleString('es-CL')}`} cursor={{ fill: 'rgba(0,0,0,0.05)' }} />
        <Legend />
        <Bar dataKey="Ingresos" fill="var(--success)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Gastos" fill="var(--danger)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
