// Marca Nido: un techo que protege una moneda. Funciona en claro y oscuro porque usa tokens.

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--brand-mark-bg)" />
      <path d="M9 19.5 20 10.5l11 9" fill="none" stroke="var(--brand-mark-ink)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="25" r="6.2" fill="var(--brand-honey)" />
      <path d="M20 22.2v5.6" stroke="var(--brand-mark-bg)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">Nido</span>
    </span>
  );
}
