import { ImageResponse } from 'next/og';
import { BrandIcon } from './icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

// iOS recorta las esquinas solo: el fondo va completo.
export default function AppleIcon() {
  return new ImageResponse(<BrandIcon size={180} />, size);
}
