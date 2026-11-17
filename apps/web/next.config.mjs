import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Los paquetes del monorepo se compilan con la app en vez de consumirse ya construidos:
  // evita tener que reconstruirlos a mano en cada cambio durante el desarrollo.
  transpilePackages: ['@viajapro/contracts', '@viajapro/domain'],
  // Reescritura hacia la API backend (ADR-0011 §2 / ADR-0013):
  // Asegura que las peticiones del navegador a /api/v1/* sean de primer origen (same-origin),
  // permitiendo que las cookies HttpOnly funcionen en Safari iOS sin problemas de terceros.
  async rewrites() {
    const destinoApi =
      process.env['API_INTERNAL_URL'] ||
      process.env['NEXT_PUBLIC_API_URL'] ||
      'http://localhost:3333';
    return [
      // Socket.IO de la bandeja con la variable vacia (opcion C, sin dominio propio): el cliente hace
      // long-polling al mismo origen y SIN barra final (`addTrailingSlash: false`, ver
      // inbox-socket.ts) porque Next quitaria la barra con un 308. engine.io solo atiende la ruta
      // CON barra, asi que esta regla la repone en el destino. Debe ir antes de la general.
      // Es RUTA_SOCKET_BANDEJA de @viajapro/contracts (un .mjs no importa TS; lo vigila la spec).
      {
        source: '/api/v1/tiempo-real',
        destination: `${destinoApi}/api/v1/tiempo-real/`,
      },
      {
        source: '/api/v1/:path*',
        destination: `${destinoApi}/api/v1/:path*`,
      },
    ];
  },
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
    // La Content-Security-Policy la emite src/middleware.ts (lleva nonce por peticion, T-069).
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // HSTS: el navegador ignora la cabecera sobre http (desarrollo local); en https fuerza TLS.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Permissions-Policy minima: la app no usa camara, microfono ni geolocalizacion.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
