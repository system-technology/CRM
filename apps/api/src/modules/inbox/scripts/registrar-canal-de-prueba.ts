/**
 * Registra el canal de WhatsApp de PRUEBA de Meta en la agencia demo, SOLO en desarrollo.
 *
 *   Local:
 *     pnpm --filter @viajapro/api canal:registrar-prueba
 *   Base remota de DESARROLLO (p. ej. Neon con solo la agencia de la semilla), opt-in en la orden:
 *     CANAL_PRUEBA_PERMITIR_REMOTO=si pnpm --filter @viajapro/api canal:registrar-prueba
 *
 * Sin esto, un mensaje entrante del número de prueba no se asocia a ninguna agencia (el
 * directorio de enrutamiento no tiene su clave) y el envío saliente no encuentra el canal. El
 * alta real la hará el Embedded Signup; este script recorre el MISMO camino (ver
 * `registro-de-canal-de-prueba.ts`) para una sola agencia y un solo número.
 *
 * Entorno: `META_PHONE_NUMBER_ID_PRUEBA`, `META_WABA_ID_PRUEBA`, `WHATSAPP_DIRECTORY_PEPPER`
 * (y `_VERSION`, 1 por omisión), `DATABASE_APP_URL` y `DATABASE_ALTAS_URL`.
 *
 * Guardias (la decisión es pura y vive en `guardia-de-canal-de-prueba.ts`):
 *   1. Exige `APP_ENV=local`.
 *   2. Solo opera sobre la agencia de la semilla (slug `agencia-demo`).
 *   3. Anfitrión local: permitido. Remoto: solo con `CANAL_PRUEBA_PERMITIR_REMOTO=si` (exacto) Y
 *      cero agencias ajenas a la semilla. Esa variable se pasa en la orden; NO va en el `.env`.
 *   4. Los dos identificadores deben existir y ser numéricos.
 *   5. Idempotente; si el número ya es de otra agencia, se niega.
 *   Nunca se imprime una cadena de conexión, un token, la pimienta ni un identificador de Meta:
 *   solo el hostname y el nombre de la agencia. No llama a la red de Meta.
 */
import { PrismaClient } from '@prisma/client';
import { resolverCadena, verificarIdentidad } from '../../../shared/prisma/guardia-de-rol.js';
import type { RolDeConexion } from '../../../shared/prisma/guardia-de-rol.js';
import {
  decidirSiSePuedeRegistrarElCanalDePrueba,
  esAnfitrionLocal,
  SLUG_DE_LA_AGENCIA_DEMO,
} from './guardia-de-canal-de-prueba.js';
import {
  registrarCanalDePrueba,
  RegistroDeCanalDePruebaError,
} from './registro-de-canal-de-prueba.js';

function clienteComo(variable: string): { prisma: PrismaClient; anfitrion: string } {
  const cadena = resolverCadena(process.env, variable);
  return {
    prisma: new PrismaClient({ datasources: { db: { url: cadena } } }),
    anfitrion: new URL(cadena).hostname,
  };
}

/** Misma comprobación que el arranque de la API: el rol que se conectó es el esperado (R2). */
async function exigirRol(prisma: PrismaClient, esperado: RolDeConexion): Promise<void> {
  const [rol] = await prisma.$queryRaw<
    Array<{ usuario: string; superusuario: boolean; saltaRls: boolean }>
  >`
    SELECT current_user AS usuario,
           COALESCE((SELECT rolsuper     FROM pg_roles WHERE rolname = current_user), false) AS "superusuario",
           COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS "saltaRls"
  `;
  if (!rol) throw new RegistroDeCanalDePruebaError('No se pudo determinar el rol de conexión.');
  const motivo = verificarIdentidad(
    { usuario: rol.usuario, esSuperusuario: rol.superusuario, saltaRls: rol.saltaRls },
    esperado,
  );
  if (motivo) throw new RegistroDeCanalDePruebaError(motivo);
}

async function principal(): Promise<void> {
  const app = clienteComo('DATABASE_APP_URL');
  const altas = clienteComo('DATABASE_ALTAS_URL');
  try {
    await exigirRol(app.prisma, 'viajapro_app');
    await exigirRol(altas.prisma, 'viajapro_altas');

    // Solo en remoto hace falta contar: en local no hay agencias reales que proteger.
    const agenciasAjenas = esAnfitrionLocal(app.anfitrion)
      ? 0
      : await app.prisma.tenant.count({ where: { NOT: { slug: SLUG_DE_LA_AGENCIA_DEMO } } });

    const decision = decidirSiSePuedeRegistrarElCanalDePrueba({
      appEnv: process.env['APP_ENV'],
      anfitrion: app.anfitrion,
      permitirRemoto: process.env['CANAL_PRUEBA_PERMITIR_REMOTO'],
      phoneNumberId: process.env['META_PHONE_NUMBER_ID_PRUEBA'],
      wabaId: process.env['META_WABA_ID_PRUEBA'],
      agenciasAjenas,
    });
    if (!decision.permitido) throw new RegistroDeCanalDePruebaError(decision.motivo);
    if (decision.remoto) {
      console.warn(
        `AVISO: se está registrando un canal de PRUEBA en una base REMOTA (anfitrión: ${app.anfitrion}). ` +
          'La base no tiene más agencia que la de la semilla.',
      );
    }

    const resultado = await registrarCanalDePrueba({
      app: app.prisma,
      altas: altas.prisma,
      slugDeLaAgencia: SLUG_DE_LA_AGENCIA_DEMO,
      // La guardia ya comprobó que existen y son numéricos.
      wabaId: process.env['META_WABA_ID_PRUEBA'] ?? '',
      phoneNumberId: process.env['META_PHONE_NUMBER_ID_PRUEBA'] ?? '',
      pimienta: process.env['WHATSAPP_DIRECTORY_PEPPER'] ?? '',
      pimientaVersion: Number(process.env['WHATSAPP_DIRECTORY_PEPPER_VERSION'] ?? '1'),
    });
    console.log(`canal de prueba registrado para la agencia demo: ${resultado.tenantNombre}`);
  } finally {
    await app.prisma.$disconnect();
    await altas.prisma.$disconnect();
  }
}

principal().catch((error: unknown) => {
  // Solo los errores propios llevan un mensaje seguro de imprimir. Cualquier otro puede arrastrar
  // detalles del motor: se imprime únicamente su clase.
  console.error(
    error instanceof RegistroDeCanalDePruebaError
      ? error.message
      : `Falló el registro del canal de prueba (${error instanceof Error ? error.name : 'error desconocido'}).`,
  );
  process.exit(1);
});
