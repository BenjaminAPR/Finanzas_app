import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// iOS recorta las esquinas solo: el fondo va completo.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, display: 'flex', background: '#22574A' }}>
        <svg width={180} height={180} viewBox="0 0 40 40">
          <path d="M9 19.5 20 10.5l11 9" fill="none" stroke="#FFFCF6" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20" cy="25" r="6.2" fill="#E2A33B" />
          <path d="M20 22.2v5.6" stroke="#22574A" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
