/**
 * Pone contraseña a las identidades de la semilla, SOLO en desarrollo local.
 *
 *   IDENTIDAD_DEV_PASSWORD=<12+ caracteres> pnpm --filter @viajapro/api identidad:sembrar-dev
 *
 * La semilla (`packages/database/prisma/seed.ts`) crea las identidades de la agencia demo sin
 * credencial, porque el hash lo produce Better Auth y `packages/database` no depende de ella.
 * Este script lo completa con **el mismo hash que usará el inicio de sesión** (scrypt), y lo
 * escribe con el pool de identidad: el único rol que puede tocar `credenciales`.
 *
 * Guardias, porque un script que pone una contraseña conocida es de los que acaban corriendo en
 * el sitio equivocado:
 *   1. Exige `APP_ENV=local`.
 *   2. Solo contra un anfitrión local (`localhost`, `127.0.0.1`): nunca contra Neon.
 *   3. Sin valor por omisión: la contraseña viene de `IDENTIDAD_DEV_PASSWORD` o no se hace nada.
 *   4. Solo toca identidades cuyo correo termina en `@agenciademo.test`.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import { resolverCadena } from '../../../shared/prisma/guardia-de-rol.js';

const DOMINIO_DE_LA_SEMILLA = '@agenciademo.test';
const ANFITRIONES_LOCALES = new Set(['localhost', '127.0.0.1', '::1']);

async function principal(): Promise<void> {
  if (process.env['APP_ENV'] !== 'local') {
    throw new Error('Negado: este script solo corre con APP_ENV=local.');
  }
  const cadena = resolverCadena(process.env, 'DATABASE_IDENTIDAD_URL');
  const anfitrion = new URL(cadena).hostname;
  if (!ANFITRIONES_LOCALES.has(anfitrion)) {
    throw new Error(
      `Negado: "${anfitrion}" no es un anfitrión local. Pone una contraseña conocida.`,
    );
  }
  const clave = process.env['IDENTIDAD_DEV_PASSWORD'];
  if (!clave || clave.length < 12) {
    throw new Error(
      'Falta IDENTIDAD_DEV_PASSWORD (12+ caracteres). Este script no inventa claves.',
    );
  }

  const prisma = new PrismaClient({ datasources: { db: { url: cadena } } });
  try {
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
