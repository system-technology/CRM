/**
 * T-131 de punta a punta: aplicación ensamblada, HTTP real y PostgreSQL con RLS. Dos agencias.
 *
 * Lo que afirma:
 *   · crear y mover A → B → perdida → A deja CUATRO filas en orden (ALTA y tres CAMBIO), con la
 *     etapa de origen de cada una, las banderas de la etapa de ESE momento, el motivo de la
 *     pérdida, el asesor asignado y quién movió;
 *   · `cerrada_en` se fija al perder (con el instante exacto de la fila del historial) y se vacía
 *     al reabrir, y el historial conserva el motivo de la pérdida anterior;
 *   · la agencia B no lee el historial de A, ni por id ni por tenant, y no puede mover la
 *     oportunidad de A (404, y ninguna fila nueva);
 *   · un movimiento rechazado (pérdida sin motivo) no deja fila.
 *
 * **Fixtures propios.** El historial es de solo añadir y solo la purga lo borra, así que la prueba
 * crea dos agencias `fixture-aislamiento-` y las purga al terminar con `borrarTenants`. Las
 * peticiones van con el atajo de desarrollo (`x-dev-tenant-id` + `x-dev-usuario-id`), que da un
 * usuario real de la agencia; los roles de los usuarios llevan `crm.escribir`, que es el permiso
 * que exige la ruta, para que la prueba no dependa de que el atajo conceda todo.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import type { Oportunidad } from '@viajapro/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const DOMINIO = '@fixture-identidad.test';

interface Agencia {
  tenant: string;
  usuario: string;
  identidad: string;
  contacto: string;
  etapas: { lead: string; cotizada: string; ganada: string; perdida: string };
}

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
const agencias = {} as Record<'A' | 'B', Agencia>;

interface FilaHistorial {
  origen: string;
  etapa_desde_id: string | null;
  etapa_hasta_id: string;
  es_ganada: boolean;
  es_perdida: boolean;
  motivo_perdida: string | null;
  asesor_id: string | null;
  usuario_id: string | null;
  ocurrido_en: Date;
}

/** Lee como la agencia `tenant`: con su contexto, como la API. */
async function comoAgencia<T>(tenant: string, sql: string, params: unknown[]): Promise<T[]> {
  await adminPg.query('BEGIN');
  try {
    await adminPg.query("SELECT set_config('app.current_tenant', $1, true)", [tenant]);
    const { rows } = await adminPg.query(sql, params);
    await adminPg.query('COMMIT');
    return rows as T[];
  } catch (error) {
    await adminPg.query('ROLLBACK');
    throw error;
  }
}

const historialDe = (tenant: string, oportunidadId: string) =>
  comoAgencia<FilaHistorial>(
    tenant,
    `SELECT origen::text AS origen, etapa_desde_id, etapa_hasta_id, es_ganada, es_perdida,
            motivo_perdida::text AS motivo_perdida, asesor_id, usuario_id, ocurrido_en
       FROM oportunidad_cambios_etapa
      WHERE tenant_id = $1 AND oportunidad_id = $2
      ORDER BY ocurrido_en, id`,
    [tenant, oportunidadId],
  );

const cerradaEn = async (tenant: string, oportunidadId: string): Promise<Date | null> => {
  const [fila] = await comoAgencia<{ cerrada_en: Date | null }>(
    tenant,
    'SELECT cerrada_en FROM oportunidades WHERE tenant_id = $1 AND id = $2',
    [tenant, oportunidadId],
  );
  if (!fila) throw new Error(`La oportunidad ${oportunidadId} no existe en ${tenant}`);
  return fila.cerrada_en;
};

async function pedir(
  quien: Agencia,
  metodo: 'POST' | 'PATCH',
  ruta: string,
  cuerpo: unknown,
): Promise<{ estado: number; json: unknown }> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
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
    data: { id: tenant, slug: `fixture-aislamiento-hist-${tenant.slice(-12)}`, nombre: letra },
  });
  const rol = await admin.rol.create({
    data: { tenantId: tenant, nombre: 'Asesor', clave: 'ASESOR', permisos: ['crm.escribir'] },
  });
  const identidad = await admin.identidad.create({
    data: {
      correo: `fixture-aislamiento-hist-${letra}-${randomBytes(3).toString('hex')}${DOMINIO}`,
      nombre: `Asesora ${letra}`,
    },
  });
  const usuario = await admin.usuario.create({
    data: {
      tenantId: tenant,
      identidadId: identidad.id,
      rolId: rol.id,
      correo: identidad.correo,
      nombre: `Asesora ${letra}`,
    },
  });
  const contacto = await admin.contacto.create({
    data: { tenantId: tenant, telefonoE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}` },
  });
  const etapa = (nombre: string, orden: number, extra: object = {}) =>
    admin.etapaPipeline.create({
      data: { tenantId: tenant, nombre: `${nombre} ${letra}`, orden, ...extra },
      select: { id: true },
    });
  return {
    tenant,
    usuario: usuario.id,
    identidad: identidad.id,
    contacto: contacto.id,
    etapas: {
      lead: (await etapa('Nueva', 1, { clave: 'NUEVO_LEAD' })).id,
      cotizada: (await etapa('Cotizada', 2)).id,
      ganada: (await etapa('Ganada', 3, { esGanada: true, probabilidad: 100 })).id,
      perdida: (await etapa('Perdida', 4, { esPerdida: true })).id,
    },
  };
}

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

describe('historial de etapas de la oportunidad (T-131)', () => {
  let oportunidadA = '';
  let oportunidadB = '';

  it('A → B → perdida → A: cuatro filas en orden, cerrada_en al perder y vacía al reabrir', async () => {
    const A = agencias.A;
    const alta = await pedir(A, 'POST', '/api/v1/crm/oportunidades', {
      contactoId: A.contacto,
      titulo: 'San Andrés en diciembre',
    });
    expect(alta.estado).toBe(201);
    oportunidadA = (alta.json as Oportunidad).id;
    expect((alta.json as Oportunidad).etapa.id).toBe(A.etapas.lead);
    expect(await cerradaEn(A.tenant, oportunidadA)).toBeNull();

    const mover = (etapaId: string, motivoPerdida: string | null = null) =>
      pedir(A, 'PATCH', `/api/v1/crm/oportunidades/${oportunidadA}/etapa`, {
        etapaId,
        motivoPerdida,
        notaPerdida: null,
      });

    expect((await mover(A.etapas.cotizada)).estado).toBe(200);

    // Un movimiento rechazado por la regla de pérdida no deja fila.
    expect((await mover(A.etapas.perdida)).estado).toBe(409);
    expect(await historialDe(A.tenant, oportunidadA)).toHaveLength(2);

    expect((await mover(A.etapas.perdida, 'PRECIO')).estado).toBe(200);
    const trasPerder = await historialDe(A.tenant, oportunidadA);
    const cierre = await cerradaEn(A.tenant, oportunidadA);
    // El instante de cierre ES el de la fila del historial: no dos relojes.
    expect(cierre).toEqual(trasPerder[2]?.ocurrido_en);

    expect((await mover(A.etapas.lead)).estado).toBe(200);
    expect(await cerradaEn(A.tenant, oportunidadA)).toBeNull();

    const filas = await historialDe(A.tenant, oportunidadA);
    const comun = { asesor_id: A.usuario, usuario_id: A.usuario };
    expect(filas.map(({ ocurrido_en: _o, ...resto }) => resto)).toEqual([
      {
        origen: 'ALTA',
        etapa_desde_id: null,
        etapa_hasta_id: A.etapas.lead,
        es_ganada: false,
        es_perdida: false,
        motivo_perdida: null,
        ...comun,
      },
      {
        origen: 'CAMBIO',
        etapa_desde_id: A.etapas.lead,
        etapa_hasta_id: A.etapas.cotizada,
        es_ganada: false,
        es_perdida: false,
        motivo_perdida: null,
        ...comun,
      },
      {
        origen: 'CAMBIO',
        etapa_desde_id: A.etapas.cotizada,
        etapa_hasta_id: A.etapas.perdida,
        es_ganada: false,
        es_perdida: true,
        // Reabrir no borra por qué se perdió la primera vez.
        motivo_perdida: 'PRECIO',
        ...comun,
      },
      {
        origen: 'CAMBIO',
        etapa_desde_id: A.etapas.perdida,
        etapa_hasta_id: A.etapas.lead,
        es_ganada: false,
        es_perdida: false,
        motivo_perdida: null,
        ...comun,
      },
    ]);
    // Instantes no decrecientes (en el orden de lectura, que es el de la línea de vida).
    const instantes = filas.map((f) => f.ocurrido_en.getTime());
    expect([...instantes].sort((x, y) => x - y)).toEqual(instantes);
  });

  it('ganar fija cerrada_en con las banderas de la etapa ganada', async () => {
    const A = agencias.A;
    const r = await pedir(A, 'PATCH', `/api/v1/crm/oportunidades/${oportunidadA}/etapa`, {
      etapaId: A.etapas.ganada,
      motivoPerdida: null,
      notaPerdida: null,
    });
    expect(r.estado).toBe(200);
    const filas = await historialDe(A.tenant, oportunidadA);
    const ultima = filas.at(-1);
    expect(ultima).toMatchObject({ origen: 'CAMBIO', es_ganada: true, es_perdida: false });
    expect(await cerradaEn(A.tenant, oportunidadA)).toEqual(ultima?.ocurrido_en);
  });

  it('la agencia B no lee el historial de A, ni lo escribe moviendo su oportunidad', async () => {
    const A = agencias.A;
    const B = agencias.B;

    // B tiene lo suyo: sin esto, «B ve cero» sería verde también con la tabla vacía.
    const altaB = await pedir(B, 'POST', '/api/v1/crm/oportunidades', {
      contactoId: B.contacto,
      titulo: 'Cartagena en enero',
    });
    expect(altaB.estado).toBe(201);
    oportunidadB = (altaB.json as Oportunidad).id;
    expect(await historialDe(B.tenant, oportunidadB)).toHaveLength(1);

    // Lectura cruzada: con el contexto de B, cero filas de A por oportunidad y por tenant.
    expect(await historialDe(B.tenant, oportunidadA)).toEqual([]);
    const porTenant = await comoAgencia(
      B.tenant,
      'SELECT id FROM oportunidad_cambios_etapa WHERE tenant_id = $1',
      [A.tenant],
    );
    expect(porTenant).toEqual([]);

    // Mover la oportunidad de A desde B: no existe para B, y A no gana ninguna fila.
    const antes = (await historialDe(A.tenant, oportunidadA)).length;
    const cruzado = await pedir(B, 'PATCH', `/api/v1/crm/oportunidades/${oportunidadA}/etapa`, {
      etapaId: B.etapas.cotizada,
      motivoPerdida: null,
      notaPerdida: null,
    });
    expect(cruzado.estado).toBe(404);
    expect(await historialDe(A.tenant, oportunidadA)).toHaveLength(antes);

    // Y la etapa de A no sirve para mover la de B.
    const etapaAjena = await pedir(B, 'PATCH', `/api/v1/crm/oportunidades/${oportunidadB}/etapa`, {
      etapaId: A.etapas.cotizada,
      motivoPerdida: null,
      notaPerdida: null,
    });
    expect([400, 404]).toContain(etapaAjena.estado);
    expect(await historialDe(B.tenant, oportunidadB)).toHaveLength(1);
  });
});
