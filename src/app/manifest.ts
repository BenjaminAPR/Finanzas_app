import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Finanzas Hogar',
    short_name: 'Finanzas',
    description: 'Las cuentas de la casa, claras y en un solo lugar',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f5f3ee',
    theme_color: '#1d6b50',
    icons: [
      { src: '/icon.png', sizes: 'any', type: 'image/png' },
      { src: '/apple-icon.png', sizes: 'any', type: 'image/png' },
    ],
  };
}
