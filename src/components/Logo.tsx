// Marca Cuentas Claras: una tarjeta con un visto, "las cuentas en orden".
// Usa tokens para verse bien en modo claro y oscuro.

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--brand-mark-bg)" />
      <rect x="7.5" y="11.5" width="24" height="16" rx="3.5" fill="var(--brand-mark-ink)" />
      <rect x="7.5" y="15.6" width="24" height="3" fill="var(--brand-mark-bg)" opacity="0.85" />
      <circle cx="28.5" cy="27" r="6.8" fill="var(--brand-honey)" stroke="var(--brand-mark-bg)" strokeWidth="2" />
      <path d="M25.6 27.1l2 2 3.7-4" fill="none" stroke="var(--brand-mark-bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">Cuentas Claras</span>
    </span>
  );
}
