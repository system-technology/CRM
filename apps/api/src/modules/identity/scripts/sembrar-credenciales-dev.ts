/**
 * Pone contraseña a las identidades de la semilla, SOLO en desarrollo.
 *
 *   Local:
 *     IDENTIDAD_DEV_PASSWORD=<12+ caracteres> pnpm --filter @viajapro/api identidad:sembrar-dev
 *   Base remota de DESARROLLO (p. ej. Neon con solo datos sintéticos), opt-in en la orden:
 *     IDENTIDAD_DEV_PERMITIR_REMOTO=si IDENTIDAD_DEV_PASSWORD=<12+ caracteres> \
 *       pnpm --filter @viajapro/api identidad:sembrar-dev
 *
 * La semilla (`packages/database/prisma/seed.ts`) crea las identidades de la agencia demo sin
 * credencial, porque el hash lo produce Better Auth y `packages/database` no depende de ella.
 * Este script lo completa con **el mismo hash que usará el inicio de sesión** (scrypt), y lo
 * escribe con el pool de identidad: el único rol que puede tocar `credenciales`.
 *
 * Guardias (la decisión es pura y vive en `guardia-de-siembra-dev.ts`). La intención: que jamás
 * exista una contraseña conocida donde hay usuarios reales.
 *   1. Exige `APP_ENV=local`.
 *   2. Sin valor por omisión: la contraseña viene de `IDENTIDAD_DEV_PASSWORD` (12+) o no se hace nada.
 *   3. Anfitrión local (`localhost`, `127.0.0.1`, `::1`): permitido.
 *   4. Anfitrión remoto: solo con `IDENTIDAD_DEV_PERMITIR_REMOTO=si` (exacto) Y cero identidades
 *      cuyo correo no termine en `@agenciademo.test`. Esa variable se pasa en la orden; NO se
 *      guarda en el `.env`.
 *   5. Solo toca identidades cuyo correo termina en `@agenciademo.test`.
 *   Nunca se imprime la cadena de conexión: solo el hostname.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { resolverCadena } from '../../../shared/prisma/guardia-de-rol.js';
import {
  decidirSiSePuedeSembrar,
  DOMINIO_DE_LA_SEMILLA,
  esAnfitrionLocal,
} from './guardia-de-siembra-dev.js';

async function principal(): Promise<void> {
  const cadena = resolverCadena(process.env, 'DATABASE_IDENTIDAD_URL');
  const anfitrion = new URL(cadena).hostname;
  const clave = process.env['IDENTIDAD_DEV_PASSWORD'] ?? '';

  const prisma = new PrismaClient({ datasources: { db: { url: cadena } } });
  try {
    // Solo en remoto hace falta contar: en local no hay usuarios reales que proteger.
    const identidadesAjenas = esAnfitrionLocal(anfitrion)
      ? 0
      : await prisma.identidad.count({
          where: { NOT: { correo: { endsWith: DOMINIO_DE_LA_SEMILLA } } },
        });
    const decision = decidirSiSePuedeSembrar({
      appEnv: process.env['APP_ENV'],
      anfitrion,
      permitirRemoto: process.env['IDENTIDAD_DEV_PERMITIR_REMOTO'],
      claveLongitud: clave.length,
      identidadesAjenas,
    });
    if (!decision.permitido) throw new Error(decision.motivo);
    if (decision.remoto) {
      console.warn(
        `AVISO: se está poniendo una contraseña de DESARROLLO en una base REMOTA (anfitrión: ${anfitrion}). ` +
          `Solo identidades ${DOMINIO_DE_LA_SEMILLA}; la base no tiene otras.`,
      );
    }

    const hash = await hashPassword(clave);
    const identidades = await prisma.identidad.findMany({
      where: { correo: { endsWith: DOMINIO_DE_LA_SEMILLA } },
      select: { id: true, correo: true },
    });
    for (const identidad of identidades) {
      await prisma.credencial.upsert({
        where: { identidadId_proveedor: { identidadId: identidad.id, proveedor: 'credential' } },
        update: { hashContrasena: hash },
        create: { identidadId: identidad.id, proveedor: 'credential', hashContrasena: hash },
      });
      // Verificada: el código por correo, al iniciar sesión con una identidad SIN verificar, le
      // borra la contraseña y las sesiones (cuenta «sin probar»). Toda identidad creada por un
      // script de plataforma debe nacer verificada.
      await prisma.identidad.update({
        where: { id: identidad.id },
        data: { correoVerificado: true },
      });
      console.log(`  contraseña puesta: ${identidad.correo}`);
    }
    if (identidades.length === 0)
      console.log('  No hay identidades de la semilla. Corre pnpm db:seed.');
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
