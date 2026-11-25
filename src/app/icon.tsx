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
  return new ImageResponse(<NidoIcon size={size} />, { width: size, height: size });
}

export function NidoIcon({ size }: { size: number }) {
  return (
    <div style={{ width: size, height: size, display: 'flex', background: '#22574A', borderRadius: size * 0.22 }}>
      <svg width={size} height={size} viewBox="0 0 40 40">
        <path d="M9 19.5 20 10.5l11 9" fill="none" stroke="#FFFCF6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20" cy="25" r="6.2" fill="#E2A33B" />
        <path d="M20 22.2v5.6" stroke="#22574A" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}
