import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Los paquetes del monorepo se compilan con la app en vez de consumirse ya construidos:
  // evita tener que reconstruirlos a mano en cada cambio durante el desarrollo.
  transpilePackages: ['@viajapro/contracts', '@viajapro/domain'],
  // Solo la imagen de Docker (apps/web/Dockerfile) lo activa: produce un servidor minimo con
  // las dependencias que de verdad se usan. El desarrollo y el CI normal no cambian.
  ...(process.env['NEXT_OUTPUT_STANDALONE'] === '1'
    ? {
        output: 'standalone',
        // En un monorepo hay que trazar desde la raiz o el servidor no encuentra los paquetes.
        outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
      }
    : {}),

  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';
    const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';
    const wsOrigin =
      process.env.NEXT_PUBLIC_WS_URL ??
      apiOrigin.replace('http://', 'ws://').replace('https://', 'wss://');

    const csp = [
      "default-src 'self'",
      `connect-src 'self' ${apiOrigin} ${wsOrigin}`,
      `script-src 'self'${isDev ? " 'unsafe-inline'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
