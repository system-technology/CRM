/**
 * Cómo se construye la instancia de Better Auth dentro de Nest.
 *
 * Una sola instancia por proceso, con el cliente de Prisma del pool de identidad. Las variables
 * de entorno se leen aquí, una vez, y sin valores por omisión para los secretos.
 */
import type { Provider } from '@nestjs/common';
import { type AuthDeViajaPro, crearAuth, leerSecretoDeAutenticacion } from './crear-auth.js';
import { PrismaIdentidadService } from './prisma-identidad.service.js';

export const AUTH = Symbol('AUTH_DE_BETTER_AUTH');

/** Los orígenes desde los que un navegador puede llamar con cookie. */
export function origenesDeConfianza(entorno: Record<string, string | undefined>): string[] {
  return [entorno['WEB_PUBLIC_URL'] ?? 'http://localhost:3000'];
}

export const proveedorDeAuth: Provider = {
  provide: AUTH,
  // `@inyeccion-manual`: es una fábrica; su `inject` declara los tokens.
  useFactory: (prisma: PrismaIdentidadService): AuthDeViajaPro =>
    crearAuth({
      prisma,
      secreto: leerSecretoDeAutenticacion(process.env),
      baseUrl:
        process.env['API_PUBLIC_URL'] ?? `http://localhost:${process.env['API_PORT'] ?? '3333'}`,
      origenesDeConfianza: origenesDeConfianza(process.env),
    }),
  inject: [PrismaIdentidadService],
};
