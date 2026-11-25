import { redirect } from 'next/navigation';

// Las cuentas ahora viven en la billetera (Inicio).
export default function AccountsPage() {
  redirect('/dashboard');
}
