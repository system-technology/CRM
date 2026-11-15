/**
 * Siembra la bandeja de demostración CIFRADA en la agencia demo, SOLO en desarrollo (T-225).
 *
 *   Local:
 *     pnpm --filter @viajapro/api demo:sembrar-cifrada
 *   Base remota de DESARROLLO (p. ej. Neon con solo la agencia de la semilla), opt-in en la orden:
 *     DEMO_CIFRADA_PERMITIR_REMOTO=si pnpm --filter @viajapro/api demo:sembrar-cifrada
 *
 * Desde ADR-0015 la semilla SQL (`packages/database/prisma/seed*.ts`) no puede escribir texto de
 * mensajes, vistas previas ni notas: la clave no está en la base. Este script, del lado de la API,
 * usa el MISMO servicio de cifrado que los adaptadores (`CAMPOS_SENSIBLES_KEY`) para que la demo
 * muestre conversaciones con contenido. Ver `siembra-de-demo-cifrada.ts` para la idempotencia.
 *
 * Entorno: `CAMPOS_SENSIBLES_KEY` y `CAMPOS_SENSIBLES_KEY_VERSION` (sin respaldo) y
 * `DATABASE_APP_URL`. Corre después de `pnpm db:seed`.
 *
 * Guardias (la decisión es pura y vive en `guardia-de-demo-cifrada.ts`):
 *   1. Exige `APP_ENV=local`.
 *   2. Verifica el rol de la conexión (`viajapro_app`, sin superusuario ni BYPASSRLS; R2).
 *   3. Solo opera sobre la agencia de la semilla (slug `agencia-demo`).
 *   4. Anfitrión local: permitido. Remoto: solo con `DEMO_CIFRADA_PERMITIR_REMOTO=si` (exacto) Y
 *      cero agencias ajenas a la semilla. Esa variable se pasa en la orden; NO va en el `.env`.
 *   Nunca se imprime una cadena de conexión ni la clave: solo el hostname y conteos.
 */
import { PrismaClient } from '@prisma/client';
import {
  CifradoDeCampos,
  clavesDeCamposDesdeEntorno,
} from '../../../shared/cifrado/cifrado-de-campos.js';
import { resolverCadena, verificarIdentidad } from '../../../shared/prisma/guardia-de-rol.js';
import { esAnfitrionLocal, SLUG_DE_LA_AGENCIA_DEMO } from './guardia-de-canal-de-prueba.js';
import { decidirSiSePuedeSembrarLaDemoCifrada } from './guardia-de-demo-cifrada.js';
import { sembrarDemoCifrada, SiembraDeDemoCifradaError } from './siembra-de-demo-cifrada.js';

/** Misma comprobación que el arranque de la API: el rol que se conectó es el esperado (R2). */
async function exigirRolApp(prisma: PrismaClient): Promise<void> {
  const [rol] = await prisma.$queryRaw<
    Array<{ usuario: string; superusuario: boolean; saltaRls: boolean }>
  >`
    SELECT current_user AS usuario,
           COALESCE((SELECT rolsuper     FROM pg_roles WHERE rolname = current_user), false) AS "superusuario",
           COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS "saltaRls"
  `;
  if (!rol) throw new SiembraDeDemoCifradaError('No se pudo determinar el rol de conexión.');
  const motivo = verificarIdentidad(
    { usuario: rol.usuario, esSuperusuario: rol.superusuario, saltaRls: rol.saltaRls },
    'viajapro_app',
  );
  if (motivo) throw new SiembraDeDemoCifradaError(motivo);
}

function construirElCifrado(): CifradoDeCampos {
  try {
    return new CifradoDeCampos(clavesDeCamposDesdeEntorno(process.env));
  } catch (error) {
    // Los mensajes de la configuración nombran la variable y el largo, nunca la clave.
    throw new SiembraDeDemoCifradaError(
      error instanceof Error ? error.message : 'La configuración del cifrado no es válida.',
    );
  }
}

async function principal(): Promise<void> {
  const cadena = resolverCadena(process.env, 'DATABASE_APP_URL');
  const anfitrion = new URL(cadena).hostname;
  const prisma = new PrismaClient({ datasources: { db: { url: cadena } } });
  try {
    await exigirRolApp(prisma);

    // Solo en remoto hace falta contar: en local no hay agencias reales que proteger.
    const agenciasAjenas = esAnfitrionLocal(anfitrion)
      ? 0
      : await prisma.tenant.count({ where: { NOT: { slug: SLUG_DE_LA_AGENCIA_DEMO } } });

    const decision = decidirSiSePuedeSembrarLaDemoCifrada({
      appEnv: process.env['APP_ENV'],
      anfitrion,
      permitirRemoto: process.env['DEMO_CIFRADA_PERMITIR_REMOTO'],
      agenciasAjenas,
    });
    if (!decision.permitido) throw new SiembraDeDemoCifradaError(decision.motivo);
    if (decision.remoto) {
      console.warn(
        `AVISO: se está sembrando la demo cifrada en una base REMOTA (anfitrión: ${anfitrion}). ` +
          'La base no tiene más agencia que la de la semilla.',
      );
    }

    const r = await sembrarDemoCifrada({
      app: prisma,
      cifrado: construirElCifrado(),
      slugDeLaAgencia: SLUG_DE_LA_AGENCIA_DEMO,
    });
    console.log(
      `demo cifrada: ${r.conversaciones} conversaciones, ${r.mensajesEscritos} mensajes y ` +
        `${r.notasEscritas} notas escritos (lo ya sembrado no se repite)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((error: unknown) => {
  // Solo los errores propios llevan un mensaje seguro de imprimir. Cualquier otro puede arrastrar
  // detalles del motor: se imprime únicamente su clase.
  console.error(
    error instanceof SiembraDeDemoCifradaError
      ? error.message
      : `Falló la siembra de la demo cifrada (${error instanceof Error ? error.name : 'error desconocido'}).`,
  );
  process.exit(1);
});
