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
};
