/**
 * T-244 de punta a punta: aplicación ensamblada, HTTP real y PostgreSQL con RLS. Dos agencias.
 *
 * La vigilancia de plazos (ADR-0024 §3.6) deja UN aviso por reserva y plazo en el outbox. Lo que
 * afirma, con un `ahora` FIJO que se pasa al caso de uso (el reloj real no interviene):
 *
 *   · un time limit dentro de las próximas 24 h → un aviso `booking.time_limit_proximo` con solo
 *     ids y el instante del plazo, la marca escrita y la reserva sigue `CONFIRMADA`;
 *   · una segunda pasada no avisa de nuevo (idempotente);
 *   · cambiar el plazo borra las marcas (dominio) y la vigilancia vuelve a avisar;
 *   · un plazo fuera del umbral no avisa; uno vencido avisa `…_vencido` UNA vez y sin cambiar el
 *     estado; el pago total de una reserva `ABONADA_AL_PROVEEDOR` avisa por su cuenta;
 *   · AISLAMIENTO: la pasada de la agencia A no marca ni alerta la reserva de B, aunque B tenga un
 *     plazo en el mismo umbral; CONTROL POSITIVO: la pasada de B sí lo hace;
 *   · dos pasadas CONCURRENTES sobre la misma agencia escriben un solo aviso (la marca se gana con
 *     `WHERE aviso_… IS NULL`).
 *
 * El planificador está apagado en las e2e (`PLAZOS_VIGILANCIA=inerte` en `vitest.config.ts`): no
 * marcaría reservas de fixtures ajenos. **Fixtures propios**, agencias `fixture-aislamiento-` purgadas
 * al terminar. Las lecturas directas van con el ROL de la API (`SET LOCAL ROLE viajapro_app`).
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import {
  type CotizacionGuardada,
  ListaDeArchivos,
  type ResumenDeArchivo,
  TIPOS_DE_AVISO_DE_PLAZO,
} from '@viajapro/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import {
  PuertoDeAgenciasVigilables,
  RepositorioDeAvisosDePlazo,
} from './application/puertos-de-vigilancia.js';
import { VigilarPlazosUseCase } from './application/vigilar-plazos.use-case.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
/** La salida del archivo; todos los plazos de la prueba caen antes. */
const FECHA = '2027-03-15';
/** El «ahora» de la vigilancia, fijo y anterior a la salida. */
const AHORA = new Date('2027-03-10T12:00:00.000Z');
const enHoras = (h: number): Date => new Date(AHORA.getTime() + h * 3_600_000);

interface Agencia {
  tenant: string;
  usuario: string;
  identidad: string;
  contacto: string;
  paquete: string;
}

interface FilaDeAviso {
  id: string;
  tipo_evento: string;
  agregado_id: string;
  version_evento: number;
  payload: Record<string, unknown>;
}

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let repo: RepositorioDeAvisosDePlazo;
const agencias = {} as Record<'A' | 'B', Agencia>;

/** Lee como la agencia `tenant`, con el rol de la API y su contexto. */
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

const avisosDe = (tenant: string, reservaId: string) =>
  comoAgencia<FilaDeAviso>(
    tenant,
    `SELECT id::text AS id, tipo_evento, agregado_id::text AS agregado_id, version_evento, payload
       FROM outbox
      WHERE tenant_id = $1 AND agregado_id = $2 AND tipo_evento = ANY($3::text[])
      ORDER BY id`,
    [tenant, reservaId, [...TIPOS_DE_AVISO_DE_PLAZO]],
  );

const reservaEnBase = (tenant: string, reservaId: string) =>
  comoAgencia<{
    estado: string;
    aviso_time_limit_proximo_en: Date | null;
    aviso_time_limit_vencido_en: Date | null;
    aviso_pago_total_proximo_en: Date | null;
    aviso_pago_total_vencido_en: Date | null;
  }>(
    tenant,
    `SELECT estado::text AS estado, aviso_time_limit_proximo_en, aviso_time_limit_vencido_en,
            aviso_pago_total_proximo_en, aviso_pago_total_vencido_en
       FROM bookings WHERE tenant_id = $1 AND id = $2`,
    [tenant, reservaId],
  );

async function http(
  quien: Agencia,
  metodo: 'GET' | 'POST' | 'PUT',
  ruta: string,
  cuerpo?: unknown,
): Promise<{ estado: number; json: unknown }> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-dev-tenant-id': quien.tenant,
      'x-dev-usuario-id': quien.usuario,
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return { estado: r.status, json: await r.json() };
}

async function crearAgencia(tenant: string, letra: string): Promise<Agencia> {
  await admin.tenant.create({
    data: { id: tenant, slug: `fixture-aislamiento-plaz-${tenant.slice(-12)}`, nombre: letra },
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
      correo: `fixture-aislamiento-plaz-${letra}-${randomBytes(3).toString('hex')}@fixture-identidad.test`,
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
      nombre: `Paquete ${letra} plazos`,
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

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Guarda, envía y acepta una cotización por la API y espera a que el despachador abra su archivo. */
async function archivoNuevo(quien: Agencia): Promise<ResumenDeArchivo> {
  const alta = await http(quien, 'POST', '/api/v1/cotizaciones', {
    contactoId: quien.contacto,
    titulo: 'Cotización de plazos',
    version: { paqueteId: quien.paquete, fecha: FECHA, adultos: 2 },
  });
  expect(alta.estado).toBe(201);
  const cotizacionId = (alta.json as CotizacionGuardada).id;
  for (const estado of ['ENVIADA', 'ACEPTADA']) {
    expect(
      (await http(quien, 'POST', `/api/v1/cotizaciones/${cotizacionId}/estado`, { estado })).estado,
    ).toBe(201);
  }
  for (let i = 0; i < 150; i++) {
    const { json } = await http(quien, 'GET', '/api/v1/archivos?estado=TODOS');
    const hallado = ListaDeArchivos.parse(json).datos.find((a) => a.cotizacionId === cotizacionId);
    if (hallado) return hallado;
    await esperar(100);
  }
  throw new Error(`El archivo de la cotización ${cotizacionId} no se abrió a tiempo`);
}

/** Lleva la reserva del archivo a CONFIRMADA con ese time limit, por la API. Devuelve su id. */
async function reservaConfirmada(
  quien: Agencia,
  archivo: ResumenDeArchivo,
  timeLimit: Date,
): Promise<string> {
  const reservaId = archivo.reservas[0]?.id ?? '';
  expect(reservaId).not.toBe('');
  const ruta = `/api/v1/archivos/${archivo.id}/reservas/${reservaId}`;
  expect((await http(quien, 'PUT', ruta, { estado: 'SOLICITADA' })).estado).toBe(200);
  const r = await http(quien, 'PUT', ruta, {
    estado: 'CONFIRMADA',
    timeLimit: timeLimit.toISOString(),
  });
  expect(r.estado).toBe(200);
  return reservaId;
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
  repo = app.get(RepositorioDeAvisosDePlazo, { strict: false });
}, 90_000);

afterAll(async () => {
  await app?.close();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(new URL(ruta, import.meta.url).href)) as {
        borrarTenants: Limpiador;
      };
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

describe('vigilancia de los plazos del mayorista (T-244)', () => {
  let deA: ResumenDeArchivo;
  let deB: ResumenDeArchivo;
  let reservaA = '';
  let reservaB = '';
  const rutaA = () => `/api/v1/archivos/${deA.id}/reservas/${reservaA}`;

  beforeAll(async () => {
    deA = await archivoNuevo(agencias.A);
    deB = await archivoNuevo(agencias.B);
    // Los dos con el MISMO plazo, dentro del umbral: lo único que separa a B es la agencia.
    reservaA = await reservaConfirmada(agencias.A, deA, enHoras(10));
    reservaB = await reservaConfirmada(agencias.B, deB, enHoras(10));
  }, 90_000);

  it('el planificador de las e2e está apagado: nada se avisó antes de la primera pasada', async () => {
    expect(await avisosDe(TENANT_A, reservaA)).toEqual([]);
    expect(await avisosDe(TENANT_B, reservaB)).toEqual([]);
  });

  it('las agencias a vigilar incluyen las de la prueba (la lista es solo de ids)', async () => {
    const ids = await app.get(PuertoDeAgenciasVigilables, { strict: false }).agenciasActivas();
    expect(ids).toContain(TENANT_A);
    expect(ids).toContain(TENANT_B);
  });

  it('plazo dentro del umbral: UNA alerta con solo ids y el plazo; el estado no cambia', async () => {
    expect(await repo.avisarAgencia(TENANT_A, AHORA)).toBe(1);

    const avisos = await avisosDe(TENANT_A, reservaA);
    expect(avisos).toHaveLength(1);
    const [aviso] = avisos;
    expect(aviso).toMatchObject({
      tipo_evento: 'booking.time_limit_proximo',
      agregado_id: reservaA,
      version_evento: 1,
      payload: {
        v: 1,
        reservaId: reservaA,
        archivoId: deA.id,
        plazo: 'TIME_LIMIT',
        venceEn: enHoras(10).toISOString(),
      },
    });
    expect(Object.keys(aviso?.payload ?? {}).sort()).toEqual([
      'archivoId',
      'plazo',
      'reservaId',
      'v',
      'venceEn',
    ]);

    const [fila] = await reservaEnBase(TENANT_A, reservaA);
    expect(fila?.estado).toBe('CONFIRMADA');
    expect(fila?.aviso_time_limit_proximo_en?.toISOString()).toBe(AHORA.toISOString());
    expect(fila?.aviso_time_limit_vencido_en).toBeNull();
  });

  it('AISLAMIENTO: la pasada de A no marcó ni alertó la reserva de B', async () => {
    expect(await avisosDe(TENANT_B, reservaB)).toEqual([]);
    // Y ninguna de las dos reservas aparece en el outbox de la otra agencia.
    expect(await avisosDe(TENANT_A, reservaB)).toEqual([]);
    const [fila] = await reservaEnBase(TENANT_B, reservaB);
    expect(fila).toMatchObject({
      estado: 'CONFIRMADA',
      aviso_time_limit_proximo_en: null,
      aviso_time_limit_vencido_en: null,
    });
  });

  it('CONTROL POSITIVO: la pasada de B sí avisa su reserva, y solo la suya', async () => {
    expect(await repo.avisarAgencia(TENANT_B, AHORA)).toBe(1);
    const avisos = await avisosDe(TENANT_B, reservaB);
    expect(avisos.map((a) => a.tipo_evento)).toEqual(['booking.time_limit_proximo']);
    // Y A no ganó nada por la pasada de B.
    expect(await avisosDe(TENANT_A, reservaA)).toHaveLength(1);
    expect(await avisosDe(TENANT_B, reservaA)).toEqual([]);
  });

  it('segunda pasada: ninguna alerta nueva', async () => {
    expect(await repo.avisarAgencia(TENANT_A, AHORA)).toBe(0);
    expect(await repo.avisarAgencia(TENANT_B, AHORA)).toBe(0);
    expect(await avisosDe(TENANT_A, reservaA)).toHaveLength(1);
    expect(await avisosDe(TENANT_B, reservaB)).toHaveLength(1);
  });

  it('editar la nota de una reserva ya avisada no borra su marca (no se repite el aviso)', async () => {
    const r = await http(agencias.A, 'PUT', rutaA(), {
      estado: 'CONFIRMADA',
      nota: 'Llamar al mayorista',
    });
    expect(r.estado).toBe(200);
    const [fila] = await reservaEnBase(TENANT_A, reservaA);
    expect(fila?.aviso_time_limit_proximo_en?.toISOString()).toBe(AHORA.toISOString());
    expect(await repo.avisarAgencia(TENANT_A, AHORA)).toBe(0);
    expect(await avisosDe(TENANT_A, reservaA)).toHaveLength(1);
  });

  it('cambiar el plazo borra las marcas y vuelve a avisar (y B no se entera)', async () => {
    const r = await http(agencias.A, 'PUT', rutaA(), {
      estado: 'CONFIRMADA',
      timeLimit: enHoras(14).toISOString(),
    });
    expect(r.estado).toBe(200);
    const [limpia] = await reservaEnBase(TENANT_A, reservaA);
    expect(limpia?.aviso_time_limit_proximo_en).toBeNull();

    expect(await repo.avisarAgencia(TENANT_A, AHORA)).toBe(1);
    const avisos = await avisosDe(TENANT_A, reservaA);
    expect(avisos).toHaveLength(2);
    expect(avisos[1]?.payload['venceEn']).toBe(enHoras(14).toISOString());
    expect(await avisosDe(TENANT_B, reservaB)).toHaveLength(1);
  });

  it('un plazo fuera del umbral (72 h) no avisa', async () => {
    const r = await http(agencias.A, 'PUT', rutaA(), {
      estado: 'CONFIRMADA',
      timeLimit: enHoras(72).toISOString(),
    });
    expect(r.estado).toBe(200);
    expect(await repo.avisarAgencia(TENANT_A, AHORA)).toBe(0);
    expect(await avisosDe(TENANT_A, reservaA)).toHaveLength(2);
  });

  it('plazo vencido: avisa «vencido» una vez, sin cambiar el estado de la reserva', async () => {
    const r = await http(agencias.A, 'PUT', rutaA(), {
      estado: 'CONFIRMADA',
      timeLimit: enHoras(-2).toISOString(),
    });
    expect(r.estado).toBe(200);

    expect(await repo.avisarAgencia(TENANT_A, AHORA)).toBe(1);
    expect(await repo.avisarAgencia(TENANT_A, AHORA)).toBe(0);

    const avisos = await avisosDe(TENANT_A, reservaA);
    expect(avisos.map((a) => a.tipo_evento)).toEqual([
      'booking.time_limit_proximo',
      'booking.time_limit_proximo',
      'booking.time_limit_vencido',
    ]);
    const [fila] = await reservaEnBase(TENANT_A, reservaA);
    // Sigue CONFIRMADA: caerla es cosa del asesor.
    expect(fila?.estado).toBe('CONFIRMADA');
    expect(fila?.aviso_time_limit_vencido_en).not.toBeNull();
  });

  it('ABONADA_AL_PROVEEDOR: avisa del pago total, no repite el time limit', async () => {
    const r = await http(agencias.A, 'PUT', rutaA(), {
      estado: 'ABONADA_AL_PROVEEDOR',
      pagoTotalVenceEn: enHoras(20).toISOString(),
    });
    expect(r.estado).toBe(200);

    expect(await repo.avisarAgencia(TENANT_A, AHORA)).toBe(1);
    expect(await repo.avisarAgencia(TENANT_A, AHORA)).toBe(0);

    const avisos = await avisosDe(TENANT_A, reservaA);
    expect(avisos).toHaveLength(4);
    expect(avisos[3]).toMatchObject({
      tipo_evento: 'booking.pago_total_proximo',
      payload: { plazo: 'PAGO_TOTAL', venceEn: enHoras(20).toISOString() },
    });
    expect((await reservaEnBase(TENANT_A, reservaA))[0]?.estado).toBe('ABONADA_AL_PROVEEDOR');
  });

  it('dos pasadas concurrentes sobre la misma agencia escriben un solo aviso', async () => {
    // Un plazo nuevo en B (que ya tenía su aviso) para que haya UN aviso por ganar.
    const rutaB = `/api/v1/archivos/${deB.id}/reservas/${reservaB}`;
    const r = await http(agencias.B, 'PUT', rutaB, {
      estado: 'CONFIRMADA',
      timeLimit: enHoras(8).toISOString(),
    });
    expect(r.estado).toBe(200);

    const resultados = await Promise.all([
      repo.avisarAgencia(TENANT_B, AHORA),
      repo.avisarAgencia(TENANT_B, AHORA),
    ]);
    expect(resultados.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await avisosDe(TENANT_B, reservaB)).toHaveLength(2);
  });

  it('el caso de uso con una agencia inexistente (sin reservas bajo RLS) no avisa nada y no falla', async () => {
    const sembradas = new VigilarPlazosUseCase(
      {
        agenciasActivas: () => Promise.resolve(['01932000-0000-7000-8000-000000000bad', TENANT_B]),
      },
      repo,
    );
    // La primera agencia no existe: bajo su RLS no hay nada que avisar; B ya avisó todo.
    const r = await sembradas.ejecutar(AHORA);
    expect(r.agencias).toBe(2);
    expect(r.agenciasConFallo).toBe(0);
    expect(r.avisos).toBe(0);
  });
});
