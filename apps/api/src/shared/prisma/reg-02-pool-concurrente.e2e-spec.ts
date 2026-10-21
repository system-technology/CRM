/**
 * AUD-015 (P0), prueba REG-02 — el pool reutiliza conexiones a la fuerza y el tenant no se filtra.
 *
 * El riesgo que ya mató a otros SaaS multi-tenant: `app.current_tenant` sobrevive en la conexión
 * y la siguiente petición que la toma del pool, de OTRA agencia, hereda el contexto. Es
 * intermitente y no se reproduce con una petición a la vez. Aquí se fuerza: la cadena de la API
 * lleva `connection_limit=2`, y se disparan 50 peticiones simultáneas de dos agencias, de modo
 * que 50 transacciones comparten dos conexiones y cada conexión sirve a las dos agencias.
 *
 * Contra el `AppModule` REAL (middleware de tenant, controlador, caso de uso, `PrismaService`,
 * RLS de verdad), no contra un doble. Lo que afirma:
 *
 *   · ninguna respuesta contiene datos de la otra agencia (ni el nombre, ni el identificador de
 *     la agencia vecina), y cada una contiene los de la suya (un vacío no cuenta como aislado);
 *   · el pool tiene de verdad dos conexiones: los `pg_backend_pid()` observados son a lo sumo 2;
 *   · cada transacción de plataforma —sin tenant— que cae en una conexión recién usada por una
 *     agencia ve `current_setting('app.current_tenant', true)` VACÍO, y también una consulta
 *     suelta, fuera de transacción, después del tumulto.
 *
 * El primer contacto de las dos agencias tiene el MISMO teléfono a propósito: es el caso de
 * borde del dominio («dos tenants con el mismo número de cliente») y el que más fácil se
 * confunde si algo se cuela.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../filtros/dominio-excepcion.filter.js';
import { PrismaService } from './prisma.service.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const MARCA = randomBytes(4).toString('hex');
const PETICIONES = 50;
const TELEFONO_COMPARTIDO = '+573009990000';

let app: INestApplication;
let base: string;
let prisma: PrismaService;
let admin: PrismaClient;
let adminPg: Client;
const urlOriginal = process.env['DATABASE_APP_URL'];

const nombreDe = (letra: 'A' | 'B', n: number): string => `REG02-${MARCA}-${letra}-${n}`;

/** `connection_limit=2`, y un `pool_timeout` holgado: 50 consultas cortas hacen cola, no fallan. */
function conPoolDeDos(url: string): string {
  const u = new URL(url);
  u.searchParams.set('connection_limit', '2');
  u.searchParams.set('pool_timeout', '60');
  return u.toString();
}

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  for (const [id, letra] of [
    [TENANT_A, 'A'],
    [TENANT_B, 'B'],
  ] as const) {
    await admin.tenant.create({
      data: {
        id,
        slug: `fixture-aislamiento-reg02-${id.slice(-12)}`,
        nombre: `Agencia REG-02 ${letra}`,
      },
    });
    for (let n = 1; n <= 3; n++) {
      await admin.contacto.create({
        data: {
          tenantId: id,
          telefonoE164: n === 1 ? TELEFONO_COMPARTIDO : `+57300${letra === 'A' ? 1 : 2}00000${n}`,
          nombre: nombreDe(letra, n),
        },
      });
    }
  }

  if (!urlOriginal) throw new Error('Falta DATABASE_APP_URL.');
  process.env['DATABASE_APP_URL'] = conPoolDeDos(urlOriginal);

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();
  prisma = app.get(PrismaService);
}, 90_000);

afterAll(async () => {
  await app?.close();
  if (urlOriginal === undefined) delete process.env['DATABASE_APP_URL'];
  else process.env['DATABASE_APP_URL'] = urlOriginal;
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B]);
      await adminPg.query('COMMIT');
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

const vacio = (v: string | null | undefined): boolean => v === null || v === undefined || v === '';

interface Respuesta {
  estado: number;
  texto: string;
  propio: 'A' | 'B';
  ajeno: 'A' | 'B';
}

describe('REG-02 — 50 peticiones concurrentes de dos agencias con connection_limit=2', () => {
  it('ninguna respuesta contiene datos de la otra agencia, y el tenant vuelve a vacío', async () => {
    const pids = new Set<number>();
    const fugasEnTransaccion: Array<string | null> = [];
    const fugasSueltas: Array<string | null> = [];

    // Sondas de plataforma (sin tenant) mezcladas con las peticiones HTTP: toman conexiones del
    // MISMO pool que las agencias acaban de soltar.
    const sondaEnTransaccion = (): Promise<void> =>
      prisma.sinTenantPorqueEsPlataforma('prueba REG-02: sonda sin tenant', async (tx) => {
        const [f] = await tx.$queryRaw<Array<{ t: string | null; pid: number }>>`
          SELECT current_setting('app.current_tenant', true) AS t, pg_backend_pid() AS pid`;
        pids.add(Number(f?.pid));
        if (!vacio(f?.t)) fugasEnTransaccion.push(f?.t ?? null);
      });

    const peticion = async (tenant: string, propio: 'A' | 'B'): Promise<Respuesta> => {
      const r = await fetch(new URL('/api/v1/crm/contactos', base), {
        headers: { 'x-dev-tenant-id': tenant },
      });
      return {
        estado: r.status,
        texto: await r.text(),
        propio,
        ajeno: propio === 'A' ? 'B' : 'A',
      };
    };

    const http: Array<Promise<Respuesta>> = [];
    const sondas: Array<Promise<void>> = [];
    for (let i = 0; i < PETICIONES; i++) {
      http.push(i % 2 === 0 ? peticion(TENANT_A, 'A') : peticion(TENANT_B, 'B'));
      if (i % 2 === 1) sondas.push(sondaEnTransaccion());
    }
    const [respuestas] = await Promise.all([Promise.all(http), Promise.all(sondas)]);
    expect(respuestas).toHaveLength(PETICIONES);

    for (const r of respuestas) {
      expect(r.estado, r.texto).toBe(200);
      // Lo suyo está, entero: una respuesta vacía no demuestra aislamiento.
      for (let n = 1; n <= 3; n++) expect(r.texto).toContain(nombreDe(r.propio, n));
      // Y nada de lo ajeno: ni sus contactos ni el identificador de su agencia.
      expect(r.texto).not.toContain(`REG02-${MARCA}-${r.ajeno}-`);
      expect(r.texto).not.toContain(r.ajeno === 'A' ? TENANT_A : TENANT_B);
    }

    // Tras cada transacción, el contexto murió con ella.
    expect(fugasEnTransaccion, 'una sonda sin tenant heredó app.current_tenant').toEqual([]);

    // Y fuera de toda transacción, tras el tumulto, también vacío, en cada conexión del pool.
    await Promise.all(
      Array.from({ length: PETICIONES }, async () => {
        const [f] = await prisma.$queryRaw<Array<{ t: string | null; pid: number }>>`
          SELECT current_setting('app.current_tenant', true) AS t, pg_backend_pid() AS pid`;
        pids.add(Number(f?.pid));
        if (!vacio(f?.t)) fugasSueltas.push(f?.t ?? null);
      }),
    );
    expect(fugasSueltas, 'una consulta suelta heredó app.current_tenant').toEqual([]);

    // El pool era de verdad de dos conexiones: con más, la prueba no forzaría reutilización.
    expect(pids.size).toBeGreaterThan(0);
    expect(pids.size).toBeLessThanOrEqual(2);
  }, 120_000);
});
