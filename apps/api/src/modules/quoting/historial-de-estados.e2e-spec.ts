/**
 * T-132 de punta a punta: aplicación ensamblada, HTTP real y PostgreSQL con RLS. Dos agencias.
 *
 * Lo que afirma:
 *   · guardar y llevar una cotización BORRADOR → ENVIADA → ACEPTADA deja TRES filas en orden, con
 *     su estado de origen, su destino, quién y cuándo, con instantes crecientes; la de ACEPTADA es
 *     el instante de la venta;
 *   · una transición que la máquina de estados no admite (ACEPTADA → ENVIADA) no deja fila;
 *   · la agencia B no lee el historial de A, ni por cotización ni por tenant, y no puede cambiar
 *     el estado de la cotización de A (404, y ninguna fila nueva).
 *
 * **Fixtures propios.** El historial y las versiones son de solo añadir y solo la purga los borra,
 * así que la prueba crea dos agencias `fixture-aislamiento-` y las purga al terminar. Las
 * peticiones van con el atajo de desarrollo con un usuario REAL de cada agencia (el historial
 * tiene foránea compuesta a `usuarios`), cuyo rol lleva `cotizacion.escribir`, el permiso que
 * exigen las rutas.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { CotizacionGuardada } from '@viajapro/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const FECHA = '2027-03-15';

interface Agencia {
  tenant: string;
  usuario: string;
  identidad: string;
  contacto: string;
  paquete: string;
}

interface FilaHistorial {
  estado_desde: string | null;
  estado_hasta: string;
  usuario_id: string | null;
  ocurrido_en: Date;
}

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
const agencias = {} as Record<'A' | 'B', Agencia>;

/**
 * Lee como la agencia `tenant`, como la API: con el ROL de la API y su contexto. `adminPg` es el
 * propietario, que en Neon/CI no queda sujeto a RLS: sin bajar de rol, una «lectura cruzada»
 * devolvería las filas de la otra agencia y la prueba no probaría nada. El `LOCAL` vuelve solo al
 * COMMIT o al ROLLBACK.
 */
async function comoAgencia<T>(tenant: string, sql: string, params: unknown[]): Promise<T[]> {
  await adminPg.query('BEGIN');
  try {
    await adminPg.query('SET LOCAL ROLE "viajapro_app"');
    await adminPg.query("SELECT set_config('app.current_tenant', $1, true)", [tenant]);
    const { rows } = await adminPg.query(sql, params);
    await adminPg.query('COMMIT');
    return rows as T[];
  } catch (error) {
    await adminPg.query('ROLLBACK');
    throw error;
  }
}

const historialDe = (tenant: string, cotizacionId: string) =>
  comoAgencia<FilaHistorial>(
    tenant,
    `SELECT estado_desde::text AS estado_desde, estado_hasta::text AS estado_hasta, usuario_id,
            ocurrido_en
       FROM cotizacion_cambios_estado
      WHERE tenant_id = $1 AND cotizacion_id = $2
      ORDER BY ocurrido_en, id`,
    [tenant, cotizacionId],
  );

async function pedir(
  quien: Agencia,
  ruta: string,
  cuerpo: unknown,
): Promise<{ estado: number; json: unknown }> {
  const r = await fetch(new URL(ruta, base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-tenant-id': quien.tenant,
      'x-dev-usuario-id': quien.usuario,
    },
    body: JSON.stringify(cuerpo),
  });
  return { estado: r.status, json: await r.json() };
}

async function crearAgencia(tenant: string, letra: string): Promise<Agencia> {
  await admin.tenant.create({
    data: { id: tenant, slug: `fixture-aislamiento-hcot-${tenant.slice(-12)}`, nombre: letra },
  });
  const rol = await admin.rol.create({
    data: {
      tenantId: tenant,
      nombre: 'Asesor',
      clave: 'ASESOR',
      permisos: ['cotizacion.escribir', 'crm.escribir'],
    },
  });
  const identidad = await admin.identidad.create({
    data: {
      correo: `fixture-aislamiento-hcot-${letra}-${randomBytes(3).toString('hex')}@fixture-identidad.test`,
      nombre: `Asesora ${letra}`,
    },
  });
  const usuario = await admin.usuario.create({
    data: {
      tenantId: tenant,
      identidadId: identidad.id,
      rolId: rol.id,
      correo: identidad.correo,
      nombre: identidad.nombre,
    },
  });
  const contacto = await admin.contacto.create({
    data: { tenantId: tenant, telefonoE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}` },
  });
  const paquete = await admin.paquete.create({
    data: {
      tenantId: tenant,
      nombre: `Paquete ${letra} historial`,
      destino: 'San Andrés',
      dias: 4,
      noches: 3,
      planAlimentacion: 'TODO_INCLUIDO',
    },
  });
  const vigencia = await admin.vigencia.create({
    data: {
      tenantId: tenant,
      paqueteId: paquete.id,
      desde: new Date('2027-03-01'),
      hasta: new Date('2027-03-31'),
    },
  });
  await admin.tarifa.create({
    data: {
      tenantId: tenant,
      vigenciaId: vigencia.id,
      nombre: 'Adulto',
      netoUnidades: 1_000_000n,
      ventaUnidades: 1_200_000n,
      monedaIso: 'COP',
    },
  });
  return {
    tenant,
    usuario: usuario.id,
    identidad: identidad.id,
    contacto: contacto.id,
    paquete: paquete.id,
  };
}

const guardar = (quien: Agencia) =>
  pedir(quien, '/api/v1/cotizaciones', {
    contactoId: quien.contacto,
    titulo: 'Cotización del historial',
    version: { paqueteId: quien.paquete, fecha: FECHA, adultos: 2 },
  });

const transitar = (quien: Agencia, cotizacionId: string, estado: string) =>
  pedir(quien, `/api/v1/cotizaciones/${cotizacionId}/estado`, { estado });

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  agencias.A = await crearAgencia(TENANT_A, 'A');
  agencias.B = await crearAgencia(TENANT_B, 'B');

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();
}, 90_000);

afterAll(async () => {
  await app?.close();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B]);
      await adminPg.query('COMMIT');
      await adminPg.query('DELETE FROM identidades WHERE id = ANY($1::uuid[])', [
        Object.values(agencias).map((a) => a.identidad),
      ]);
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('historial de estados de la cotización (T-132)', () => {
  let cotizacionA = '';

  it('BORRADOR → ENVIADA → ACEPTADA deja tres filas en orden, con instantes crecientes', async () => {
    const A = agencias.A;
    const alta = await guardar(A);
    expect(alta.estado).toBe(201);
    cotizacionA = (alta.json as CotizacionGuardada).id;

    expect((await transitar(A, cotizacionA, 'ENVIADA')).estado).toBe(201);
    expect((await transitar(A, cotizacionA, 'ACEPTADA')).estado).toBe(201);

    const filas = await historialDe(A.tenant, cotizacionA);
    expect(filas.map(({ ocurrido_en: _o, ...resto }) => resto)).toEqual([
      { estado_desde: null, estado_hasta: 'BORRADOR', usuario_id: A.usuario },
      { estado_desde: 'BORRADOR', estado_hasta: 'ENVIADA', usuario_id: A.usuario },
      { estado_desde: 'ENVIADA', estado_hasta: 'ACEPTADA', usuario_id: A.usuario },
    ]);
    const instantes = filas.map((f) => f.ocurrido_en.getTime());
    expect(instantes[0]).toBeLessThan(instantes[1] ?? 0);
    expect(instantes[1]).toBeLessThan(instantes[2] ?? 0);
  });

  it('una transición que la máquina no admite no deja fila', async () => {
    const A = agencias.A;
    const r = await transitar(A, cotizacionA, 'ENVIADA');
    expect(r.estado).toBeGreaterThanOrEqual(400);
    expect(r.estado).toBeLessThan(500);
    expect(await historialDe(A.tenant, cotizacionA)).toHaveLength(3);
  });

  it('la agencia B no lee el historial de A, ni lo escribe cambiando su estado', async () => {
    const A = agencias.A;
    const B = agencias.B;

    // B tiene lo suyo: sin esto, «B ve cero» sería verde también con la tabla vacía.
    const altaB = await guardar(B);
    expect(altaB.estado).toBe(201);
    const cotizacionB = (altaB.json as CotizacionGuardada).id;
    expect(await historialDe(B.tenant, cotizacionB)).toHaveLength(1);

    expect(await historialDe(B.tenant, cotizacionA)).toEqual([]);
    expect(
      await comoAgencia(B.tenant, 'SELECT id FROM cotizacion_cambios_estado WHERE tenant_id = $1', [
        A.tenant,
      ]),
    ).toEqual([]);

    // Cambiar el estado de la cotización de A desde B: no existe para B, y A no gana filas.
    const cruzado = await transitar(B, cotizacionA, 'RECHAZADA');
    expect(cruzado.estado).toBe(404);
    expect(await historialDe(A.tenant, cotizacionA)).toHaveLength(3);
  });
});
