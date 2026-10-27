/**
 * Siembra, SOLO en desarrollo, la agencia de un prospecto a partir de su catálogo en JSON.
 *
 *   Local:
 *     CATALOGO_JSON=<ruta fuera del repositorio> pnpm --filter @viajapro/database seed:agencia-json
 *   Base remota de DESARROLLO (p. ej. Neon con solo datos sintéticos), opt-in en la orden:
 *     SEMILLA_AGENCIA_PERMITIR_REMOTO=si CATALOGO_JSON=<ruta> \
 *       pnpm --filter @viajapro/database seed:agencia-json
 *
 * Reutilizable para cualquier agencia que traiga un catálogo con la forma que describe
 * `semilla-agencia-mapeo.ts`. Crea (o reutiliza) el tenant, sus roles, su embudo, su política de
 * precio, un usuario dueño y el catálogo. Es idempotente: clave de paquete = tenant + código.
 *
 * **El archivo NO entra al repositorio.** Es de un tercero y no tenemos permiso para publicarlo:
 * el script se NIEGA a leer uno que esté dentro del repositorio, y nunca imprime su ruta ni sus
 * valores. Tampoco imprime cadenas de conexión ni rutas de `.env`: solo contadores.
 *
 * **Roles (R2).** Todo lo de negocio (roles, usuario, embudo, política, catálogo) se escribe con
 * `viajapro_app` bajo RLS, con el tenant fijado en cada transacción —el script comprueba que la
 * conexión ES ese rol y no un superusuario—. Lo único que usa `DATABASE_URL` (propietario) es lo
 * que hoy no puede hacer ningún rol de aplicación y es «camino de plataforma» según la migración
 * 20261007120100: crear la fila de `tenants` y la fila global de `identidades`. Es el mismo
 * camino que ya usa `seed.ts`; no se inventa otro.
 *
 * **Sin contraseña.** La identidad del dueño nace sin credencial: `identidad:sembrar-dev` pone la
 * de desarrollo a las identidades `@agenciademo.test`.
 */

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { POLITICA_POR_DEFECTO } from '@viajapro/domain';
import {
  decidirSiSePuedeSembrarLaAgencia,
  DOMINIO_DE_LA_SEMILLA,
  esAnfitrionLocal,
  estaDentroDelRepositorio,
  SLUG_DE_LA_AGENCIA_DEMO,
  type EstadoDelCatalogo,
} from './guardia-de-semilla-agencia.js';
import {
  CatalogoJsonInvalidoError,
  mapearCatalogo,
  type CatalogoMapeado,
} from './semilla-agencia-mapeo.js';
import { sembrarAgenciaDesdeCatalogo } from './semilla-agencia-nucleo.js';

const RAIZ_DEL_REPOSITORIO = fileURLToPath(new URL('../../../', import.meta.url));
const ROL_DE_LA_APLICACION = 'viajapro_app';

interface LecturaDelCatalogo {
  readonly estado: EstadoDelCatalogo;
  readonly datos?: unknown;
  readonly catalogo?: CatalogoMapeado;
}

/** Lee y valida el archivo. Nunca devuelve ni imprime la ruta ni los valores. */
function leerCatalogo(ruta: string | undefined): LecturaDelCatalogo {
  if (!ruta) return { estado: { estado: 'ausente' } };
  if (!existsSync(ruta) || !statSync(ruta).isFile()) return { estado: { estado: 'no_existe' } };
  // `realpath` en ambos lados: un enlace simbólico desde fuera hacia dentro del repositorio no
  // debe burlar la guardia.
  if (estaDentroDelRepositorio(realpathSync(ruta), realpathSync(RAIZ_DEL_REPOSITORIO))) {
    return { estado: { estado: 'dentro_del_repositorio' } };
  }
  let datos: unknown;
  try {
    datos = JSON.parse(readFileSync(ruta, 'utf8'));
  } catch {
    return { estado: { estado: 'json_invalido', detalle: 'no es JSON' } };
  }
  try {
    const catalogo = mapearCatalogo(datos, POLITICA_POR_DEFECTO);
    return { estado: { estado: 'ok' }, datos, catalogo };
  } catch (error) {
    if (error instanceof CatalogoJsonInvalidoError) {
      return { estado: { estado: 'json_invalido', detalle: error.message } };
    }
    throw error;
  }
}

async function principal(): Promise<void> {
  const lectura = leerCatalogo(process.env['CATALOGO_JSON']);
  const urlPlataforma = process.env['DATABASE_URL'];
  if (!urlPlataforma) throw new Error('Falta DATABASE_URL.');
  const anfitrion = new URL(urlPlataforma).hostname;

  const slug = lectura.catalogo?.agencia.slug ?? '';
  const correoDelDueno =
    process.env['SEMILLA_AGENCIA_CORREO_DUENO'] ?? `dueno-${slug}${DOMINIO_DE_LA_SEMILLA}`;
  const entrada = {
    appEnv: process.env['APP_ENV'],
    anfitrion,
    permitirRemoto: process.env['SEMILLA_AGENCIA_PERMITIR_REMOTO'],
    catalogo: lectura.estado,
    correoDelDueno,
  };

  // Primera pasada sin tocar la base: APP_ENV, el archivo, el correo y el opt-in remoto.
  let decision = decidirSiSePuedeSembrarLaAgencia({
    ...entrada,
    agenciasAjenas: 0,
    identidadesAjenas: 0,
  });
  if (!decision.permitido) throw new Error(decision.motivo);
  if (!lectura.datos || !lectura.catalogo) throw new Error('Catálogo no disponible.');

  const urlApp = process.env['DATABASE_APP_URL'];
  if (!urlApp) throw new Error('Falta DATABASE_APP_URL (rol viajapro_app). Sin respaldo.');

  const plataforma = new PrismaClient({ datasources: { db: { url: urlPlataforma } } });
  const app = new PrismaClient({ datasources: { db: { url: urlApp } } });
  try {
    // Segunda pasada, solo en remoto: contar lo ajeno.
    if (!esAnfitrionLocal(anfitrion)) {
      const [agenciasAjenas, identidadesAjenas] = await Promise.all([
        plataforma.tenant.count({ where: { slug: { notIn: [SLUG_DE_LA_AGENCIA_DEMO, slug] } } }),
        plataforma.identidad.count({
          where: { NOT: { correo: { endsWith: DOMINIO_DE_LA_SEMILLA } } },
        }),
      ]);
      decision = decidirSiSePuedeSembrarLaAgencia({
        ...entrada,
        agenciasAjenas,
        identidadesAjenas,
      });
      if (!decision.permitido) throw new Error(decision.motivo);
      console.warn(
        `AVISO: se está sembrando una agencia de DESARROLLO en una base REMOTA (anfitrión: ${anfitrion}). ` +
          'La base solo contiene agencias e identidades de la semilla.',
      );
    }

    // R2: el rol de negocio tiene que SER viajapro_app y no poder saltarse RLS.
    const [rol] = await app.$queryRaw<
      Array<{ usuario: string; superusuario: boolean; saltaRls: boolean }>
    >`
      SELECT current_user::text AS usuario,
             COALESCE((SELECT rolsuper     FROM pg_roles WHERE rolname = current_user), false) AS "superusuario",
             COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS "saltaRls"
    `;
    if (!rol || rol.usuario !== ROL_DE_LA_APLICACION || rol.superusuario || rol.saltaRls) {
      throw new Error(
        `DATABASE_APP_URL debe conectar como ${ROL_DE_LA_APLICACION}, sin superusuario ni BYPASSRLS (R2).`,
      );
    }

    const resumen = await sembrarAgenciaDesdeCatalogo({
      plataforma,
      app,
      datos: lectura.datos,
      correoDelDueno,
    });
    console.log(
      `Agencia "${resumen.slug}" lista: paquetes ${resumen.paquetes}, vigencias ${resumen.vigencias}, ` +
        `tarifas ${resumen.tarifas}, opciones de salida ${resumen.opcionesDeSalida}, sin precio ${resumen.sinPrecio}.`,
    );
  } finally {
    await Promise.all([plataforma.$disconnect(), app.$disconnect()]);
  }
}

principal().catch((error: unknown) => {
  // Solo el mensaje: nunca el objeto de error completo (Prisma puede incluir la URL).
  console.error(error instanceof Error ? error.message : 'Falló la siembra.');
  process.exit(1);
});
