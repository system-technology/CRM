/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Los paquetes del monorepo se compilan con la app en vez de consumirse ya construidos:
  // evita tener que reconstruirlos a mano en cada cambio durante el desarrollo.
  transpilePackages: ['@viajapro/contracts', '@viajapro/domain'],
};
