'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

const PROMISES = [
  'Cuánto pueden gastar, con la plata real que tienen.',
  'Todas las deudas en un lugar, con fecha de término.',
  'Suben la cartola del banco y se ordena sola.',
];

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push('/dashboard');
        return;
      }
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (signUpError) throw signUpError;
      if (data.session) {
        router.push('/dashboard');
        return;
      }
      setNotice('Te enviamos un correo para confirmar la cuenta. Después, pide que te agreguen al hogar.');
      setIsLogin(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(/invalid login/i.test(message) ? 'Correo o contraseña incorrectos.' : 'No pudimos completar esto. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <Logo size={38} />
        <h1 className="auth-title">Las finanzas de la casa, en orden y entre los dos.</h1>
        <ul className="auth-promises">
          {PROMISES.map(p => <li key={p}>{p}</li>)}
        </ul>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <div className="auth-mobile-logo"><Logo size={34} /></div>
          <h2 className="h2">{isLogin ? 'Hola de nuevo' : 'Crea tu cuenta'}</h2>
          <p className="text-secondary" style={{ marginTop: '0.2rem' }}>
            {isLogin ? 'Entra para ver cómo va el mes.' : 'Para sumarte al hogar.'}
          </p>

          {error && <div className="notice danger" role="alert" style={{ marginTop: '1rem' }}>{error}</div>}
          {notice && <div className="notice ok" role="status" style={{ marginTop: '1rem' }}>{notice}</div>}

          <form onSubmit={e => void handleSubmit(e)} className="form-stack" style={{ marginTop: '1.3rem' }}>
            {!isLogin && (
              <div className="input-group">
                <label className="input-label" htmlFor="fullName">Tu nombre</label>
                <input id="fullName" className="input-field" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required />
              </div>
            )}
            <div className="input-group">
              <label className="input-label" htmlFor="email">Correo</label>
              <input id="email" type="email" className="input-field" autoComplete="email" placeholder="tu@correo.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="input-group">
              <label className="input-label" htmlFor="password">Contraseña</label>
              <input id="password" type="password" className="input-field" autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={isLogin ? undefined : 8} />
            </div>
            <button type="submit" className="btn-primary btn-block" disabled={loading}>
              {loading ? 'Un momento…' : isLogin ? 'Entrar' : 'Crear cuenta'}
            </button>
          </form>

          <p className="text-muted" style={{ marginTop: '1.2rem', textAlign: 'center' }}>
            {isLogin ? '¿Primera vez aquí? ' : '¿Ya tienes cuenta? '}
            <button type="button" className="link-btn" onClick={() => { setIsLogin(!isLogin); setError(null); setNotice(null); }}>
              {isLogin ? 'Crear cuenta' : 'Entrar'}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
