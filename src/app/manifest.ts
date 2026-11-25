import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cuentas Claras · Finanzas del hogar',
    short_name: 'Cuentas Claras',
    description: 'Las cuentas de la casa, en orden y entre los dos.',
    lang: 'es-CL',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#F6F2EA',
    theme_color: '#22574A',
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png' },
    ],
  };
}
