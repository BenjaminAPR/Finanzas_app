import { ImageResponse } from 'next/og';

export function generateImageMetadata() {
  return [
    { id: 'small', size: { width: 48, height: 48 }, contentType: 'image/png' },
    { id: '192', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: '512', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ];
}

const SIZES: Record<string, number> = { small: 48, '192': 192, '512': 512 };

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const size = SIZES[String(await id)] ?? 512;
  return new ImageResponse(<BrandIcon size={size} radius={size * 0.22} />, { width: size, height: size });
}

/** Ícono de la app: tarjeta crema con visto miel sobre verde pino. */
export function BrandIcon({ size, radius = 0 }: { size: number; radius?: number }) {
  return (
    <div style={{ width: size, height: size, display: 'flex', background: '#22574A', borderRadius: radius }}>
      <svg width={size} height={size} viewBox="0 0 40 40">
        <rect x="7.5" y="11.5" width="24" height="16" rx="3.5" fill="#FFFCF6" />
        <rect x="7.5" y="15.6" width="24" height="3" fill="#22574A" opacity="0.85" />
        <circle cx="28.5" cy="27" r="6.8" fill="#E2A33B" stroke="#22574A" strokeWidth="2" />
        <path d="M25.6 27.1l2 2 3.7-4" fill="none" stroke="#22574A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
