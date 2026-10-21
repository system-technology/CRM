/**
 * AUD-013 (P0) — «la API o el worker conectan con el rol propietario o con BYPASSRLS».
 *
 * Las guardias existen en `PrismaService`, `PrismaWebhookService` y `PrismaIdentidadService`.
 * Esto demuestra que **cada una aborta de verdad** contra un PostgreSQL real, y no solo que
 * `verificarIdentidad` devuelve un texto (eso ya lo prueba `guardia-de-rol.spec.ts`).
 *
 * Por cada servicio, `onModuleInit()` tiene que rechazar con el motivo exacto cuando la
 * conexión usa:
 *   · otro rol de login (el copiar y pegar entre dos líneas contiguas del `.env`);
 *   · el rol esperado, pero con `rolsuper`;
 *   · el rol esperado, pero con `rolbypassrls`;
 *   · un rol de prueba superusuario y uno con BYPASSRLS (nombre distinto del esperado).
 * Y una contraprueba: con la cadena correcta arranca. Sin ella, un rojo por «contraseña
 * incorrecta» pasaría por un rojo de la guardia.
 *
 * **Cuándo corre.** Esta prueba MUTA roles del clúster (`ALTER ROLE viajapro_app SUPERUSER`
 * durante unos milisegundos) y cualquier otra prueba que corra a la vez como ese rol se saltaría
 * RLS. Por eso solo corre con `VIAJAPRO_BASE_DESECHABLE=1` Y contra un host de loopback, y el CI
 * la ejecuta en un paso aparte, solo, después de `pnpm test`. En `pnpm test` queda omitida; en el
 * paso del CI `VIAJAPRO_EXIGIR_ARRANQUE_SEGURO=1` convierte la omisión en fallo, para que no
 * pueda «pasar» sin haber corrido.
 *
 * Contra Neon no corre nunca: el propietario de Neon no es superusuario y la base es compartida.
 */
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaIdentidadService } from '../../modules/identity/infrastructure/prisma-identidad.service.js';
import { PrismaWebhookService } from './prisma-webhook.service.js';
import { PrismaService } from './prisma.service.js';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const URL_ADMIN = process.env['DATABASE_URL'] ?? '';
const desechable =
  process.env['VIAJAPRO_BASE_DESECHABLE'] === '1' &&
  URL_ADMIN !== '' &&
  LOOPBACK.has(new URL(URL_ADMIN).hostname.toLowerCase());
const exigido = process.env['VIAJAPRO_EXIGIR_ARRANQUE_SEGURO'] === '1';

interface Servicio {
  nombre: string;
  variable: string;
  rol: string;
  /** Variable de OTRO rol de login, para el caso «rol equivocado». */
  variableAjena: string;
  crear: () => { onModuleInit(): Promise<void>; $disconnect(): Promise<void> };
}

const SERVICIOS: Servicio[] = [
  {
    nombre: 'PrismaService (API)',
    variable: 'DATABASE_APP_URL',
    rol: 'viajapro_app',
    variableAjena: 'DATABASE_ALTAS_URL',
    crear: () => new PrismaService(),
  },
  {
    nombre: 'PrismaWebhookService (trabajador)',
    variable: 'DATABASE_WEBHOOK_URL',
    rol: 'viajapro_webhook',
    variableAjena: 'DATABASE_APP_URL',
    crear: () => new PrismaWebhookService(),
  },
  {
    nombre: 'PrismaIdentidadService (Better Auth)',
    variable: 'DATABASE_IDENTIDAD_URL',
    rol: 'viajapro_identidad',
    variableAjena: 'DATABASE_APP_URL',
    crear: () => new PrismaIdentidadService(),
  },
];

const ROL_PRUEBA_SUPER = 'viajapro_prueba_super';
const ROL_PRUEBA_BYPASS = 'viajapro_prueba_bypass';

if (!desechable && exigido) {
  describe('AUD-013 — arranque seguro', () => {
    it('la prueba EXIGIDA no puede omitirse: falta VIAJAPRO_BASE_DESECHABLE=1 o el host no es de loopback', () => {
      throw new Error(
        'VIAJAPRO_EXIGIR_ARRANQUE_SEGURO=1 pero la base no es desechable. Una prueba de seguridad ' +
          'que se omite en silencio es peor que una que falta.',
      );
    });
  });
}

describe.skipIf(!desechable)('AUD-013 — cada proceso aborta si su conexión no es la suya', () => {
  let admin: Client;
  let clave = '';
  const original = { ...process.env };

  /** Cadena de conexión de `usuario`, con la misma contraseña de desarrollo que los demás. */
  function urlDe(usuario: string): string {
    const u = new URL(process.env['DATABASE_APP_URL'] ?? '');
    u.username = usuario;
    return u.toString();
  }

  async function abortaCon(servicio: Servicio, url: string, motivo: RegExp): Promise<void> {
    process.env[servicio.variable] = url;
    const instancia = servicio.crear();
    try {
      await expect(instancia.onModuleInit()).rejects.toThrow(motivo);
    } finally {
      await instancia.$disconnect();
      process.env[servicio.variable] = original[servicio.variable] ?? '';
    }
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    for (const s of SERVICIOS) {
      if (!process.env[s.variable]) throw new Error(`Falta ${s.variable}.`);
    }
    clave = new URL(process.env['DATABASE_APP_URL'] ?? '').password;
    // Va dentro de DDL, que no admite parámetros: se valida antes de interpolar.
    if (!/^[A-Za-z0-9_-]{12,}$/.test(clave)) throw new Error('Contraseña de prueba inesperada.');

    admin = new Client({ connectionString: URL_ADMIN });
    await admin.connect();
    const { rows } = await admin.query(
      'SELECT rolsuper FROM pg_roles WHERE rolname = current_user',
    );
    if (!rows[0]?.rolsuper) throw new Error('DATABASE_URL debe ser un superusuario desechable.');

    for (const [rol, atributo] of [
      [ROL_PRUEBA_SUPER, 'SUPERUSER'],
      [ROL_PRUEBA_BYPASS, 'BYPASSRLS'],
    ] as const) {
      await admin.query(`DROP ROLE IF EXISTS ${rol}`);
      await admin.query(`CREATE ROLE ${rol} LOGIN ${atributo} PASSWORD '${clave}'`);
    }
  });

  afterAll(async () => {
    if (!admin) return;
    // Pase lo que pase, los roles reales quedan como estaban.
    for (const s of SERVICIOS) {
      await admin.query(`ALTER ROLE ${s.rol} NOSUPERUSER NOBYPASSRLS`);
    }
    await admin.query(`DROP ROLE IF EXISTS ${ROL_PRUEBA_SUPER}`);
    await admin.query(`DROP ROLE IF EXISTS ${ROL_PRUEBA_BYPASS}`);
    await admin.end();
  });

  for (const s of SERVICIOS) {
    describe(s.nombre, () => {
      it('contraprueba: con su rol, sin superusuario ni BYPASSRLS, arranca', async () => {
        const instancia = s.crear();
        try {
          await expect(instancia.onModuleInit()).resolves.toBeUndefined();
        } finally {
          await instancia.$disconnect();
        }
      });

      it(`aborta si se conecta con otro rol de login (no es '${s.rol}')`, async () => {
        await abortaCon(
          s,
          process.env[s.variableAjena] ?? '',
          new RegExp(`debe conectarse como '${s.rol}' y se conectó como 'viajapro_\\w+'`),
        );
      });

      it('aborta si el propio rol esperado es superusuario (rolsuper)', async () => {
        await admin.query(`ALTER ROLE ${s.rol} SUPERUSER`);
        try {
          await abortaCon(s, process.env[s.variable] ?? '', /es superusuario/);
        } finally {
          await admin.query(`ALTER ROLE ${s.rol} NOSUPERUSER`);
        }
      });

      it('aborta si el propio rol esperado tiene BYPASSRLS (rolbypassrls)', async () => {
        await admin.query(`ALTER ROLE ${s.rol} BYPASSRLS`);
        try {
          await abortaCon(s, process.env[s.variable] ?? '', /tiene BYPASSRLS/);
        } finally {
          await admin.query(`ALTER ROLE ${s.rol} NOBYPASSRLS`);
        }
      });

      it('aborta con un rol de prueba superusuario', async () => {
        await abortaCon(s, urlDe(ROL_PRUEBA_SUPER), /debe conectarse como/);
      });

      it('aborta con un rol de prueba con BYPASSRLS', async () => {
        await abortaCon(s, urlDe(ROL_PRUEBA_BYPASS), /debe conectarse como/);
      });

      it('aborta con el rol propietario (DATABASE_URL), que es superusuario', async () => {
        await abortaCon(s, URL_ADMIN, /debe conectarse como/);
      });
    });
  }

  it('los cuatro roles reales quedaron sin rolsuper ni rolbypassrls tras las mutaciones', async () => {
    const { rows } = await admin.query(
      `SELECT rolname FROM pg_roles
        WHERE rolname = ANY($1) AND (rolsuper OR rolbypassrls) ORDER BY 1`,
      [SERVICIOS.map((s) => s.rol).concat('viajapro_altas')],
    );
    expect(rows).toEqual([]);
  });
});
