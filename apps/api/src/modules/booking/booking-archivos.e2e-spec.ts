/**
 * T-242 y T-248 de punta a punta: aplicación ensamblada, HTTP real y PostgreSQL con RLS. Dos agencias.
 *
 * Los archivos NO se siembran: nacen como en producción, aceptando cotizaciones por la API y
 * esperando al despachador del contenedor (T-241). Lo que afirma:
 *
 *   · AISLAMIENTO: un archivo o una reserva de la agencia B da 404 a la agencia A —y al revés— en la
 *     lectura y en CADA mutación (reserva, pasajeros, cancelación), y la fila de la otra agencia
 *     queda intacta (se comprueba leyendo con el ROL de la API y el contexto de su dueña);
 *   · una reserva no se opera desde la URL de otro archivo de la MISMA agencia (404);
 *   · el recorrido de la reserva con sus exigencias (time limit al confirmar, pago total al abonar),
 *     las transiciones inválidas (409) y el PUT idempotente;
 *   · pasajeros: reemplazo completo, un titular, y el aviso si no cuadran con la venta;
 *   · cancelación: motivo, reservas vivas canceladas con el archivo, y después nada se modifica;
 *   · la lista, con avance y semáforo, ordenada por el plazo más próximo.
 *
 * El atajo `x-dev-tenant-id` concede TODOS los permisos: aquí se prueba RLS y el recorrido; la
 * omisión del neto sin `cotizacion.ver_neto_y_margen` (T-248) la cubre `operar-archivo.use-case.spec.ts`
 * con y sin el permiso, y aquí se comprueba que CON el permiso la clave viaja.
 *
 * Los permisos `archivo.ver`/`archivo.operar` (T-249) se prueban con SESIONES REALES de tres
 * miembros de A (inicio de sesión por HTTP, como `miembros-asignables.e2e-spec.ts`): OPERACIONES
 * con los dos, un rol propio solo con `archivo.ver` y otro sin ninguno. 403 `PERMISO_DENEGADO`, y
 * el archivo intacto en la base.
 *
 * **Fixtures propios**, agencias `fixture-aislamiento-` purgadas al terminar. Las lecturas directas van
 * con el ROL de la API (`SET LOCAL ROLE viajapro_app`): el propietario no queda sujeto a RLS en CI.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import {
  type CotizacionGuardada,
  DetalleDeArchivo,
  ListaDeArchivos,
  type ResumenDeArchivo,
} from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();

// Fechas RELATIVAS A HOY (T-251): con fechas fijas, la vigencia de la tarifa y los plazos caducan el
// día que el calendario las alcanza y la prueba se pone en rojo sin que nada haya cambiado.
const DIA_MS = 86_400_000;
const hoyUtc = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
const enDias = (d: Date, n: number): Date => new Date(d.getTime() + n * DIA_MS);
const fechaIso = (d: Date): string => d.toISOString().slice(0, 10);
const SALIDA = enDias(hoyUtc, 120);
const FECHA = fechaIso(SALIDA);

interface Agencia {
  tenant: string;
  usuario: string;
  identidad: string;
  contacto: string;
  paquete: string;
}

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
const agencias = {} as Record<'A' | 'B', Agencia>;

/** Miembros de A con sesión real (T-249). */
type Miembro = 'operaciones' | 'soloVer' | 'sinArchivo' | 'conNeto';
const MIEMBROS: readonly Miembro[] = ['operaciones', 'soloVer', 'sinArchivo', 'conNeto'];
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
const PERMISOS_DE: Record<Miembro, string[]> = {
  operaciones: [
    'conversaciones.ver_todas',
    'catalogo.administrar',
    'archivo.ver',
    'archivo.operar',
  ],
  // Sin `cotizacion.ver_neto_y_margen` (T-251): el rol de OPERACIONES sembrado no lo tiene.
  soloVer: ['archivo.ver'],
  conNeto: ['archivo.ver', 'archivo.operar', 'cotizacion.ver_neto_y_margen'],
  sinArchivo: ['crm.escribir', 'cotizacion.escribir'],
};
const correos = {} as Record<Miembro, string>;
const cookies = {} as Record<Miembro, string>;
const identidadesDeMiembros: string[] = [];
const rnd = (): number => Math.floor(Math.random() * 250) + 1;

async function crearMiembro(quien: Miembro, tenant: string): Promise<void> {
  const rol = await admin.rol.create({
    data: {
      tenantId: tenant,
      nombre: `Rol ${quien}`,
      clave: quien === 'operaciones' ? 'OPERACIONES' : null,
      permisos: PERMISOS_DE[quien],
    },
  });
  correos[quien] =
    `fixture-aislamiento-arch-${quien.toLowerCase()}-${randomBytes(3).toString('hex')}@fixture-identidad.test`;
  const identidad = await admin.identidad.create({
    data: { correo: correos[quien], nombre: `Miembro ${quien}`, correoVerificado: true },
  });
  identidadesDeMiembros.push(identidad.id);
  await admin.credencial.create({
    data: {
      identidadId: identidad.id,
      proveedor: 'credential',
      hashContrasena: await hashPassword(CLAVE),
    },
  });
  await admin.usuario.create({
    data: {
      tenantId: tenant,
      identidadId: identidad.id,
      rolId: rol.id,
      correo: identidad.correo,
      nombre: identidad.nombre,
    },
  });
}

async function iniciarSesion(quien: Miembro): Promise<string> {
  const r = await fetch(new URL('/api/v1/auth/sign-in/email', base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGEN_WEB,
      'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`,
    },
    body: JSON.stringify({ correo: correos[quien], contrasena: CLAVE }),
  });
  expect(r.status).toBe(200);
  return r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

/** Como `http`, pero con la sesión real del miembro: sus permisos son los de su rol. */
async function comoMiembro(
  quien: Miembro,
  metodo: 'GET' | 'POST' | 'PUT',
  ruta: string,
  cuerpo?: unknown,
): Promise<{ estado: number; json: unknown }> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      cookie: cookies[quien],
      'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`,
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const texto = await r.text();
  return { estado: r.status, json: texto ? (JSON.parse(texto) as unknown) : {} };
}

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

const codigo = (json: unknown): string => (json as { error: { code: string } }).error.code;

async function crearAgencia(tenant: string, letra: string): Promise<Agencia> {
  await admin.tenant.create({
    data: { id: tenant, slug: `fixture-aislamiento-arch-${tenant.slice(-12)}`, nombre: letra },
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
      correo: `fixture-aislamiento-arch-${letra}-${randomBytes(3).toString('hex')}@fixture-identidad.test`,
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
      nombre: `Paquete ${letra} archivos`,
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
      desde: enDias(SALIDA, -14),
      hasta: enDias(SALIDA, 14),
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

/** Guarda, envía y acepta una cotización por la API, y espera a que el despachador abra su archivo. */
async function archivoNuevo(quien: Agencia): Promise<ResumenDeArchivo> {
  const alta = await http(quien, 'POST', '/api/v1/cotizaciones', {
    contactoId: quien.contacto,
    titulo: 'Cotización de archivos',
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

const reservaEnBase = (tenant: string, reservaId: string) =>
  comoAgencia<{ estado: string; time_limit: Date | null; localizador: string | null }>(
    tenant,
    `SELECT estado::text AS estado, time_limit, localizador FROM bookings WHERE tenant_id = $1 AND id = $2`,
    [tenant, reservaId],
  );

const archivoEnBase = (tenant: string, archivoId: string) =>
  comoAgencia<{ estado: string; pasajeros: string }>(
    tenant,
    `SELECT f.estado::text AS estado,
            (SELECT count(*) FROM pasajeros p WHERE p.tenant_id = f.tenant_id AND p.travel_file_id = f.id)::text AS pasajeros
       FROM travel_files f WHERE f.tenant_id = $1 AND f.id = $2`,
    [tenant, archivoId],
  );

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  agencias.A = await crearAgencia(TENANT_A, 'A');
  agencias.B = await crearAgencia(TENANT_B, 'B');
  for (const m of MIEMBROS) await crearMiembro(m, TENANT_A);

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();

  for (const m of MIEMBROS) {
    cookies[m] = await iniciarSesion(m);
  }
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
        [...Object.values(agencias).map((a) => a.identidad), ...identidadesDeMiembros],
      ]);
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('aislamiento entre agencias en el archivo de viaje (T-242)', () => {
  let deA: ResumenDeArchivo;
  let deB: ResumenDeArchivo;
  let reservaA = '';

  beforeAll(async () => {
    deA = await archivoNuevo(agencias.A);
    deB = await archivoNuevo(agencias.B);
    reservaA = deA.reservas[0]?.id ?? '';
    expect(reservaA).not.toBe('');
  }, 60_000);

  it('A ve su archivo; el de B no aparece en su lista ni en su detalle', async () => {
    const A = agencias.A;
    const lista = ListaDeArchivos.parse((await http(A, 'GET', '/api/v1/archivos')).json);
    expect(lista.datos.map((a) => a.id)).toContain(deA.id);
    expect(lista.datos.map((a) => a.id)).not.toContain(deB.id);

    const propio = await http(A, 'GET', `/api/v1/archivos/${deA.id}`);
    expect(propio.estado).toBe(200);
    expect(DetalleDeArchivo.parse(propio.json).numero).toBe(deA.numero);
  });

  it('lectura: A pide el archivo de B (y B el de A) y recibe 404 sin datos', async () => {
    for (const [quien, ajeno] of [
      [agencias.A, deB],
      [agencias.B, deA],
    ] as const) {
      const r = await http(quien, 'GET', `/api/v1/archivos/${ajeno.id}`);
      expect(r.estado).toBe(404);
      expect(codigo(r.json)).toBe('ARCHIVO_NO_ENCONTRADO');
      expect(JSON.stringify(r.json)).not.toContain(ajeno.paqueteNombre);
    }
  });

  it('mutación: B no opera la reserva de A (ni con el archivo de A ni con el suyo): 404 y A intacta', async () => {
    const B = agencias.B;
    const cuerpo = { estado: 'SOLICITADA', localizador: 'HACKEADO' };

    const conArchivoAjeno = await http(
      B,
      'PUT',
      `/api/v1/archivos/${deA.id}/reservas/${reservaA}`,
      cuerpo,
    );
    expect(conArchivoAjeno.estado).toBe(404);
    expect(codigo(conArchivoAjeno.json)).toBe('ARCHIVO_NO_ENCONTRADO');

    const conArchivoPropio = await http(
      B,
      'PUT',
      `/api/v1/archivos/${deB.id}/reservas/${reservaA}`,
      cuerpo,
    );
    expect(conArchivoPropio.estado).toBe(404);
    expect(codigo(conArchivoPropio.json)).toBe('RESERVA_NO_ENCONTRADA');

    const [fila] = await reservaEnBase(agencias.A.tenant, reservaA);
    expect(fila).toMatchObject({ estado: 'PENDIENTE', localizador: null });
  });

  it('mutación: B no reemplaza los pasajeros del archivo de A: 404 y A sin pasajeros', async () => {
    const r = await http(agencias.B, 'PUT', `/api/v1/archivos/${deA.id}/pasajeros`, {
      pasajeros: [{ nombre: 'Intruso', tipo: 'ADT', esTitular: true }],
    });
    expect(r.estado).toBe(404);
    expect(codigo(r.json)).toBe('ARCHIVO_NO_ENCONTRADO');
    expect((await archivoEnBase(agencias.A.tenant, deA.id))[0]?.pasajeros).toBe('0');
  });

  it('mutación: B no cancela el archivo de A: 404 y A sigue ABIERTO', async () => {
    const r = await http(agencias.B, 'POST', `/api/v1/archivos/${deA.id}/cancelacion`, {
      motivo: 'CLIENTE_DESISTIO',
    });
    expect(r.estado).toBe(404);
    expect(codigo(r.json)).toBe('ARCHIVO_NO_ENCONTRADO');
    expect((await archivoEnBase(agencias.A.tenant, deA.id))[0]?.estado).toBe('ABIERTO');
  });

  it('las mutaciones de A sobre el archivo de B también dan 404 (la regla es simétrica)', async () => {
    const A = agencias.A;
    const reservaB = deB.reservas[0]?.id ?? '';
    expect(
      (
        await http(A, 'PUT', `/api/v1/archivos/${deB.id}/reservas/${reservaB}`, {
          estado: 'SOLICITADA',
        })
      ).estado,
    ).toBe(404);
    expect(
      (await http(A, 'PUT', `/api/v1/archivos/${deB.id}/pasajeros`, { pasajeros: [] })).estado,
    ).toBe(404);
    expect(
      (
        await http(A, 'POST', `/api/v1/archivos/${deB.id}/cancelacion`, {
          motivo: 'CLIENTE_DESISTIO',
        })
      ).estado,
    ).toBe(404);
    expect((await reservaEnBase(agencias.B.tenant, reservaB))[0]?.estado).toBe('PENDIENTE');
    expect((await archivoEnBase(agencias.B.tenant, deB.id))[0]?.estado).toBe('ABIERTO');
  });

  it('una reserva no se opera desde la URL de otro archivo de la misma agencia: 404', async () => {
    const otro = await archivoNuevo(agencias.A);
    const r = await http(agencias.A, 'PUT', `/api/v1/archivos/${otro.id}/reservas/${reservaA}`, {
      estado: 'SOLICITADA',
    });
    expect(r.estado).toBe(404);
    expect(codigo(r.json)).toBe('RESERVA_NO_ENCONTRADA');
    expect((await reservaEnBase(agencias.A.tenant, reservaA))[0]?.estado).toBe('PENDIENTE');
  }, 30_000);

  it('un id que no es UUID da 400 (no llega a la base)', async () => {
    expect((await http(agencias.A, 'GET', '/api/v1/archivos/no-es-uuid')).estado).toBe(400);
  });
});

describe('operación del archivo de A (T-242) y neto con permiso (T-248)', () => {
  let archivo: ResumenDeArchivo;
  let reserva = '';
  const ruta = (): string => `/api/v1/archivos/${archivo.id}/reservas/${reserva}`;
  const TIME_LIMIT = `${fechaIso(enDias(SALIDA, -42))}T23:00:00.000Z`;
  const PAGO_TOTAL = `${fechaIso(enDias(SALIDA, -23))}T23:00:00.000Z`;

  beforeAll(async () => {
    archivo = await archivoNuevo(agencias.A);
    reserva = archivo.reservas[0]?.id ?? '';
  }, 60_000);

  it('el detalle trae la venta, las reservas PENDIENTES, el avance y, con el permiso, el neto', async () => {
    const d = DetalleDeArchivo.parse(
      (await http(agencias.A, 'GET', `/api/v1/archivos/${archivo.id}`)).json,
    );
    expect(d).toMatchObject({
      estado: 'ABIERTO',
      avance: 'POR_CONFIRMAR',
      fechaSalida: FECHA,
      semaforo: null,
      avisos: [],
    });
    expect(d.venta.unidades).toMatch(/^\d+$/);
    expect(d.reservas).toHaveLength(1);
    expect(d.reservas[0]).toMatchObject({ estado: 'PENDIENTE', moneda: 'COP' });
    // Con cotizacion.ver_neto_y_margen la clave viaja (como texto entero, o null si es desconocido).
    expect(d.reservas[0]).toHaveProperty('netoUnidades');
  });

  it('PENDIENTE no puede confirmarse directamente: 409', async () => {
    const r = await http(agencias.A, 'PUT', ruta(), {
      estado: 'CONFIRMADA',
      timeLimit: TIME_LIMIT,
    });
    expect(r.estado).toBe(409);
    expect(codigo(r.json)).toBe('TRANSICION_DE_RESERVA_INVALIDA');
  });

  it('SOLICITADA con localizador, y repetir el PUT no cambia nada (idempotente)', async () => {
    const cuerpo = { estado: 'SOLICITADA', localizador: 'LOC-77' };
    const una = await http(agencias.A, 'PUT', ruta(), cuerpo);
    expect(una.estado).toBe(200);
    const primera = DetalleDeArchivo.parse(una.json).reservas[0];
    expect(primera).toMatchObject({ estado: 'SOLICITADA', localizador: 'LOC-77' });
    expect(primera?.solicitadaEn).not.toBeNull();

    await esperar(20);
    const dos = DetalleDeArchivo.parse((await http(agencias.A, 'PUT', ruta(), cuerpo)).json)
      .reservas[0];
    expect(dos).toEqual(primera);
  });

  it('CONFIRMADA exige el time limit: 422 sin él, 200 con él, y la base lo guarda en UTC', async () => {
    const sin = await http(agencias.A, 'PUT', ruta(), { estado: 'CONFIRMADA' });
    expect(sin.estado).toBe(422);
    expect(codigo(sin.json)).toBe('TIME_LIMIT_REQUERIDO');
    expect((await reservaEnBase(agencias.A.tenant, reserva))[0]?.estado).toBe('SOLICITADA');

    const con = await http(agencias.A, 'PUT', ruta(), {
      estado: 'CONFIRMADA',
      timeLimit: TIME_LIMIT,
    });
    expect(con.estado).toBe(200);
    const d = DetalleDeArchivo.parse(con.json);
    expect(d.reservas[0]).toMatchObject({
      estado: 'CONFIRMADA',
      timeLimit: TIME_LIMIT,
      plazoVigente: TIME_LIMIT,
      semaforo: 'EN_PLAZO',
    });
    expect(d.avance).toBe('CONFIRMADO');
    expect((await reservaEnBase(agencias.A.tenant, reserva))[0]?.time_limit?.toISOString()).toBe(
      TIME_LIMIT,
    );
  });

  it('un plazo posterior a la salida se rechaza: 422', async () => {
    const r = await http(agencias.A, 'PUT', ruta(), {
      estado: 'CONFIRMADA',
      timeLimit: `${fechaIso(enDias(SALIDA, 5))}T12:00:00.000Z`,
    });
    expect(r.estado).toBe(422);
    expect(codigo(r.json)).toBe('PLAZO_POSTERIOR_A_LA_SALIDA');
  });

  it('ABONADA exige la fecha de pago total; con ella el plazo vigente pasa a ser el del pago', async () => {
    const sin = await http(agencias.A, 'PUT', ruta(), { estado: 'ABONADA_AL_PROVEEDOR' });
    expect(sin.estado).toBe(422);
    expect(codigo(sin.json)).toBe('PAGO_TOTAL_REQUERIDO');

    const con = await http(agencias.A, 'PUT', ruta(), {
      estado: 'ABONADA_AL_PROVEEDOR',
      pagoTotalVenceEn: PAGO_TOTAL,
    });
    expect(con.estado).toBe(200);
    expect(DetalleDeArchivo.parse(con.json).reservas[0]).toMatchObject({
      estado: 'ABONADA_AL_PROVEEDOR',
      plazoVigente: PAGO_TOTAL,
    });
  });

  it('pasajeros: reemplaza la lista completa, exige un titular y avisa si no cuadra con la venta', async () => {
    const A = agencias.A;
    const ruta2 = `/api/v1/archivos/${archivo.id}/pasajeros`;

    const sinTitular = await http(A, 'PUT', ruta2, {
      pasajeros: [{ nombre: 'Ana Pérez', tipo: 'ADT' }],
    });
    expect(sinTitular.estado).toBe(422);
    expect(codigo(sinTitular.json)).toBe('TITULAR_INVALIDO');

    const menorSinEdad = await http(A, 'PUT', ruta2, {
      pasajeros: [
        { nombre: 'Ana Pérez', tipo: 'ADT', esTitular: true },
        { nombre: 'Luis Pérez', tipo: 'CHD' },
      ],
    });
    expect(menorSinEdad.estado).toBe(422);
    expect(codigo(menorSinEdad.json)).toBe('EDAD_REQUERIDA');
    expect((await archivoEnBase(A.tenant, archivo.id))[0]?.pasajeros).toBe('0');

    const uno = await http(A, 'PUT', ruta2, {
      pasajeros: [{ nombre: 'Ana Pérez', tipo: 'ADT', esTitular: true }],
    });
    expect(uno.estado).toBe(200);
    expect(DetalleDeArchivo.parse(uno.json).avisos).toEqual(['PASAJEROS_NO_CUADRAN_CON_LA_VENTA']);

    const dos = DetalleDeArchivo.parse(
      (
        await http(A, 'PUT', ruta2, {
          pasajeros: [
            { nombre: 'Ana Pérez', tipo: 'ADT', esTitular: true },
            { nombre: 'Beto Gómez', tipo: 'ADT' },
          ],
        })
      ).json,
    );
    expect(dos.pasajeros.map((p) => [p.nombre, p.esTitular, p.orden])).toEqual([
      ['Ana Pérez', true, 0],
      ['Beto Gómez', false, 1],
    ]);
    expect(dos.avisos).toEqual([]);
    expect((await archivoEnBase(A.tenant, archivo.id))[0]?.pasajeros).toBe('2');
  });

  it('la lista pone primero el archivo con el plazo más próximo e informa el semáforo', async () => {
    const sinPlazo = await archivoNuevo(agencias.A);
    const lista = ListaDeArchivos.parse(
      (await http(agencias.A, 'GET', '/api/v1/archivos')).json,
    ).datos;
    const posicion = (id: string): number => lista.findIndex((a) => a.id === id);
    expect(posicion(archivo.id)).toBeGreaterThanOrEqual(0);
    expect(posicion(archivo.id)).toBeLessThan(posicion(sinPlazo.id));
    expect(lista[posicion(archivo.id)]).toMatchObject({
      proximoPlazo: PAGO_TOTAL,
      avance: 'CONFIRMADO',
    });
  }, 30_000);

  it('PAGADA y luego el archivo ya no se puede cancelar (penalidad, fuera del alcance): 409', async () => {
    const pagada = await http(agencias.A, 'PUT', ruta(), { estado: 'PAGADA_AL_PROVEEDOR' });
    expect(pagada.estado).toBe(200);
    expect(DetalleDeArchivo.parse(pagada.json).avance).toBe('PAGADO_A_PROVEEDORES');

    const r = await http(agencias.A, 'POST', `/api/v1/archivos/${archivo.id}/cancelacion`, {
      motivo: 'CLIENTE_DESISTIO',
    });
    expect(r.estado).toBe(409);
    expect(codigo(r.json)).toBe('ARCHIVO_CON_RESERVA_PAGADA');
  });

  it('cancelación: OTRO exige nota (400 del contrato), cancela reservas vivas y congela el archivo', async () => {
    const A = agencias.A;
    const otro = await archivoNuevo(A);
    const rutaCancelar = `/api/v1/archivos/${otro.id}/cancelacion`;

    expect((await http(A, 'POST', rutaCancelar, { motivo: 'OTRO' })).estado).toBe(400);

    const ok = await http(A, 'POST', rutaCancelar, {
      motivo: 'OTRO',
      nota: 'La clienta cambió de planes',
    });
    expect(ok.estado).toBe(201);
    const d = DetalleDeArchivo.parse(ok.json);
    expect(d).toMatchObject({ estado: 'CANCELADO', avance: null, motivoCancelacion: 'OTRO' });
    expect(d.canceladoEn).not.toBeNull();
    expect(d.reservas.every((r) => r.estado === 'CANCELADA')).toBe(true);

    const otraVez = await http(A, 'POST', rutaCancelar, { motivo: 'CLIENTE_DESISTIO' });
    expect(otraVez.estado).toBe(409);
    expect(codigo(otraVez.json)).toBe('ARCHIVO_YA_CANCELADO');

    const cambio = await http(
      A,
      'PUT',
      `/api/v1/archivos/${otro.id}/reservas/${otro.reservas[0]?.id}`,
      {
        estado: 'SOLICITADA',
      },
    );
    expect(cambio.estado).toBe(409);
    expect(codigo(cambio.json)).toBe('ARCHIVO_CANCELADO');

    const pasajeros = await http(A, 'PUT', `/api/v1/archivos/${otro.id}/pasajeros`, {
      pasajeros: [],
    });
    expect(pasajeros.estado).toBe(409);
  }, 30_000);

  it('la lista filtra por estado: los cancelados solo salen con CANCELADO o TODOS', async () => {
    const abiertos = ListaDeArchivos.parse(
      (await http(agencias.A, 'GET', '/api/v1/archivos')).json,
    ).datos;
    const cancelados = ListaDeArchivos.parse(
      (await http(agencias.A, 'GET', '/api/v1/archivos?estado=CANCELADO')).json,
    ).datos;
    expect(abiertos.every((a) => a.estado === 'ABIERTO')).toBe(true);
    expect(cancelados.length).toBeGreaterThan(0);
    expect(cancelados.every((a) => a.estado === 'CANCELADO')).toBe(true);
  });
});

describe('permisos archivo.ver y archivo.operar con sesiones reales (T-249)', () => {
  let archivo: ResumenDeArchivo;
  let reserva = '';

  beforeAll(async () => {
    archivo = await archivoNuevo(agencias.A);
    reserva = archivo.reservas[0]?.id ?? '';
    expect(reserva).not.toBe('');
  }, 60_000);

  it('sin archivo.ver: la lista y el detalle dan 403 PERMISO_DENEGADO, sin datos del archivo', async () => {
    for (const ruta of ['/api/v1/archivos', `/api/v1/archivos/${archivo.id}`]) {
      const r = await comoMiembro('sinArchivo', 'GET', ruta);
      expect(r.estado, ruta).toBe(403);
      expect(codigo(r.json)).toBe('PERMISO_DENEGADO');
      expect(JSON.stringify(r.json)).not.toContain(archivo.paqueteNombre);
    }
  });

  it('con archivo.ver y sin archivo.operar: lee (200) pero cada mutación da 403 y la base no cambia', async () => {
    const lectura = await comoMiembro('soloVer', 'GET', `/api/v1/archivos/${archivo.id}`);
    expect(lectura.estado).toBe(200);
    expect(DetalleDeArchivo.parse(lectura.json).id).toBe(archivo.id);

    const intentos = [
      [
        'PUT',
        `/api/v1/archivos/${archivo.id}/reservas/${reserva}`,
        { estado: 'SOLICITADA', localizador: 'SIN-PERMISO' },
      ],
      [
        'PUT',
        `/api/v1/archivos/${archivo.id}/pasajeros`,
        { pasajeros: [{ nombre: 'Sin permiso', tipo: 'ADT', esTitular: true }] },
      ],
      ['POST', `/api/v1/archivos/${archivo.id}/cancelacion`, { motivo: 'CLIENTE_DESISTIO' }],
    ] as const;
    for (const [metodo, ruta, cuerpo] of intentos) {
      for (const quien of ['soloVer', 'sinArchivo'] as const) {
        const r = await comoMiembro(quien, metodo, ruta, cuerpo);
        expect(r.estado, `${quien} ${metodo} ${ruta}`).toBe(403);
        expect(codigo(r.json)).toBe('PERMISO_DENEGADO');
      }
    }

    const [fila] = await reservaEnBase(agencias.A.tenant, reserva);
    expect(fila).toMatchObject({ estado: 'PENDIENTE', localizador: null });
    expect((await archivoEnBase(agencias.A.tenant, archivo.id))[0]).toMatchObject({
      estado: 'ABIERTO',
      pasajeros: '0',
    });
  });

  it('OPERACIONES (archivo.operar, sin cotizacion.escribir) opera la reserva', async () => {
    const r = await comoMiembro(
      'operaciones',
      'PUT',
      `/api/v1/archivos/${archivo.id}/reservas/${reserva}`,
      { estado: 'SOLICITADA', localizador: 'OPS-1' },
    );
    expect(r.estado).toBe(200);
    const [fila] = await reservaEnBase(agencias.A.tenant, reserva);
    expect(fila).toMatchObject({ estado: 'SOLICITADA', localizador: 'OPS-1' });
  });
});

describe('el neto no sale sin cotizacion.ver_neto_y_margen, con sesiones reales (T-251)', () => {
  let archivo: ResumenDeArchivo;
  let reserva = '';
  const ruta = (): string => `/api/v1/archivos/${archivo.id}/reservas/${reserva}`;

  /** La clave `netoUnidades` no puede aparecer en NINGÚN rincón de la respuesta, ni como null. */
  const sinNeto = (json: unknown, donde: string): void => {
    expect(JSON.stringify(json), donde).not.toMatch(/neto/i);
  };

  beforeAll(async () => {
    archivo = await archivoNuevo(agencias.A);
    reserva = archivo.reservas[0]?.id ?? '';
    expect(reserva).not.toBe('');
  }, 60_000);

  it('sin el permiso: la lista, el detalle y cada mutación omiten netoUnidades', async () => {
    // El rol de prueba existe y de verdad NO tiene el permiso (la prueba no es vacua).
    expect(PERMISOS_DE.operaciones).not.toContain('cotizacion.ver_neto_y_margen');

    const lista = await comoMiembro('operaciones', 'GET', '/api/v1/archivos');
    expect(lista.estado).toBe(200);
    const propio = ListaDeArchivos.parse(lista.json).datos.find((a) => a.id === archivo.id);
    expect(propio?.reservas.length).toBeGreaterThan(0);
    sinNeto(lista.json, 'lista');

    const detalle = await comoMiembro('operaciones', 'GET', `/api/v1/archivos/${archivo.id}`);
    expect(detalle.estado).toBe(200);
    expect(DetalleDeArchivo.parse(detalle.json).reservas.length).toBeGreaterThan(0);
    sinNeto(detalle.json, 'detalle');

    const reservaPut = await comoMiembro('operaciones', 'PUT', ruta(), {
      estado: 'SOLICITADA',
      localizador: 'SIN-NETO',
    });
    expect(reservaPut.estado).toBe(200);
    sinNeto(reservaPut.json, 'PUT reserva');

    const pasajeros = await comoMiembro(
      'operaciones',
      'PUT',
      `/api/v1/archivos/${archivo.id}/pasajeros`,
      { pasajeros: [{ nombre: 'Ana Pérez', tipo: 'ADT', esTitular: true }] },
    );
    expect(pasajeros.estado).toBe(200);
    sinNeto(pasajeros.json, 'PUT pasajeros');

    const aCancelar = await archivoNuevo(agencias.A);
    const cancelacion = await comoMiembro(
      'operaciones',
      'POST',
      `/api/v1/archivos/${aCancelar.id}/cancelacion`,
      { motivo: 'CLIENTE_DESISTIO' },
    );
    expect(cancelacion.estado).toBe(201);
    sinNeto(cancelacion.json, 'POST cancelación');
  }, 60_000);

  it('control: con el permiso, las mismas lecturas y mutaciones SÍ traen netoUnidades (igual al de la base)', async () => {
    const [enBase] = await comoAgencia<{ neto_unidades: string | null }>(
      agencias.A.tenant,
      'SELECT neto_unidades::text AS neto_unidades FROM bookings WHERE tenant_id = $1 AND id = $2',
      [agencias.A.tenant, reserva],
    );
    expect(enBase).toBeDefined();

    const lista = await comoMiembro('conNeto', 'GET', '/api/v1/archivos');
    const enLista = ListaDeArchivos.parse(lista.json).datos.find((a) => a.id === archivo.id);
    expect(enLista?.reservas[0]).toHaveProperty('netoUnidades', enBase?.neto_unidades ?? null);

    const detalle = await comoMiembro('conNeto', 'GET', `/api/v1/archivos/${archivo.id}`);
    expect(DetalleDeArchivo.parse(detalle.json).reservas[0]).toHaveProperty(
      'netoUnidades',
      enBase?.neto_unidades ?? null,
    );

    const put = await comoMiembro('conNeto', 'PUT', ruta(), {
      estado: 'SOLICITADA',
      localizador: 'CON-NETO',
    });
    expect(put.estado).toBe(200);
    expect(DetalleDeArchivo.parse(put.json).reservas[0]).toHaveProperty(
      'netoUnidades',
      enBase?.neto_unidades ?? null,
    );
  });
});

describe('historial de estados de la reserva (T-250)', () => {
  interface FilaHistorial {
    reserva_id: string;
    archivo_id: string;
    estado_anterior: string;
    estado_nuevo: string;
    usuario_id: string | null;
  }
  const historialEnBase = (tenant: string, archivoId: string) =>
    comoAgencia<FilaHistorial>(
      tenant,
      `SELECT reserva_id, archivo_id, estado_anterior::text AS estado_anterior,
              estado_nuevo::text AS estado_nuevo, usuario_id
         FROM reserva_cambios_estado
        WHERE tenant_id = $1 AND archivo_id = $2
        ORDER BY ocurrido_en, id`,
      [tenant, archivoId],
    );

  let archivo: ResumenDeArchivo;
  let reserva = '';
  let deB: ResumenDeArchivo;
  const ruta = (): string => `/api/v1/archivos/${archivo.id}/reservas/${reserva}`;
  const TIME_LIMIT = `${fechaIso(enDias(SALIDA, -42))}T23:00:00.000Z`;

  beforeAll(async () => {
    archivo = await archivoNuevo(agencias.A);
    reserva = archivo.reservas[0]?.id ?? '';
    deB = await archivoNuevo(agencias.B);
  }, 60_000);

  it('un archivo recién abierto no tiene historial (el alta no es un cambio)', async () => {
    expect(await historialEnBase(agencias.A.tenant, archivo.id)).toEqual([]);
    const d = DetalleDeArchivo.parse(
      (await http(agencias.A, 'GET', `/api/v1/archivos/${archivo.id}`)).json,
    );
    expect(d.historial).toEqual([]);
  });

  it('un cambio de estado deja UNA fila con el estado anterior, el nuevo y el usuario', async () => {
    const r = await http(agencias.A, 'PUT', ruta(), { estado: 'SOLICITADA', localizador: 'H-1' });
    expect(r.estado).toBe(200);
    expect(await historialEnBase(agencias.A.tenant, archivo.id)).toEqual([
      {
        reserva_id: reserva,
        archivo_id: archivo.id,
        estado_anterior: 'PENDIENTE',
        estado_nuevo: 'SOLICITADA',
        usuario_id: agencias.A.usuario,
      },
    ]);
  });

  it('corregir la nota o el localizador, o repetir el PUT, NO deja fila', async () => {
    for (const cuerpo of [
      { estado: 'SOLICITADA', localizador: 'H-1' },
      { estado: 'SOLICITADA', localizador: 'H-1-CORREGIDO' },
      { estado: 'SOLICITADA', nota: 'Pidió ventana' },
    ]) {
      expect((await http(agencias.A, 'PUT', ruta(), cuerpo)).estado).toBe(200);
    }
    expect(await historialEnBase(agencias.A.tenant, archivo.id)).toHaveLength(1);
  });

  it('una transición rechazada (409) no deja fila', async () => {
    const r = await http(agencias.A, 'PUT', ruta(), {
      estado: 'PAGADA_AL_PROVEEDOR',
    });
    expect(r.estado).toBe(409);
    expect(await historialEnBase(agencias.A.tenant, archivo.id)).toHaveLength(1);
  });

  it('el detalle trae el historial en orden, sin neto, y lo lee un miembro con archivo.ver', async () => {
    const confirmar = await http(agencias.A, 'PUT', ruta(), {
      estado: 'CONFIRMADA',
      timeLimit: TIME_LIMIT,
    });
    expect(confirmar.estado).toBe(200);

    const d = DetalleDeArchivo.parse(
      (await comoMiembro('soloVer', 'GET', `/api/v1/archivos/${archivo.id}`)).json,
    );
    expect(d.historial.map((h) => [h.estadoAnterior, h.estadoNuevo])).toEqual([
      ['PENDIENTE', 'SOLICITADA'],
      ['SOLICITADA', 'CONFIRMADA'],
    ]);
    expect(d.historial.every((h) => h.reservaId === reserva)).toBe(true);
    expect(d.historial.every((h) => h.usuarioId === agencias.A.usuario)).toBe(true);
    expect(JSON.stringify(d.historial)).not.toMatch(/neto/i);
  });

  it('cancelar el archivo deja una fila por cada reserva viva, con su estado de origen y quien canceló', async () => {
    const otro = await archivoNuevo(agencias.A);
    const reservaOtro = otro.reservas[0]?.id ?? '';
    expect(
      (
        await http(agencias.A, 'PUT', `/api/v1/archivos/${otro.id}/reservas/${reservaOtro}`, {
          estado: 'SOLICITADA',
        })
      ).estado,
    ).toBe(200);
    const c = await http(agencias.A, 'POST', `/api/v1/archivos/${otro.id}/cancelacion`, {
      motivo: 'CLIENTE_DESISTIO',
    });
    expect(c.estado).toBe(201);
    expect(
      (await historialEnBase(agencias.A.tenant, otro.id)).map((f) => [
        f.estado_anterior,
        f.estado_nuevo,
        f.usuario_id,
      ]),
    ).toEqual([
      ['PENDIENTE', 'SOLICITADA', agencias.A.usuario],
      ['SOLICITADA', 'CANCELADA', agencias.A.usuario],
    ]);
  }, 30_000);

  it('aislamiento: B no ve ni por la API ni por la base el historial de A (control: A sí ve el suyo)', async () => {
    // Control positivo: sin él, «B ve cero» sería verde también con la tabla vacía.
    expect((await historialEnBase(agencias.A.tenant, archivo.id)).length).toBeGreaterThan(0);

    // B opera lo suyo: su historial es suyo y solo suyo.
    const reservaB = deB.reservas[0]?.id ?? '';
    expect(
      (
        await http(agencias.B, 'PUT', `/api/v1/archivos/${deB.id}/reservas/${reservaB}`, {
          estado: 'SOLICITADA',
        })
      ).estado,
    ).toBe(200);
    const propioB = DetalleDeArchivo.parse(
      (await http(agencias.B, 'GET', `/api/v1/archivos/${deB.id}`)).json,
    );
    expect(propioB.historial).toHaveLength(1);
    expect(propioB.historial.some((h) => h.reservaId === reserva)).toBe(false);

    // Con el rol de la API y el contexto de B, las filas de A no existen.
    expect(
      await comoAgencia(
        agencias.B.tenant,
        'SELECT 1 FROM reserva_cambios_estado WHERE archivo_id = $1 OR reserva_id = $2',
        [archivo.id, reserva],
      ),
    ).toEqual([]);
    expect(
      (
        await comoAgencia<{ n: string }>(
          agencias.B.tenant,
          'SELECT count(*)::text AS n FROM reserva_cambios_estado WHERE tenant_id = $1',
          [agencias.A.tenant],
        )
      )[0]?.n,
    ).toBe('0');

    // Y por la API, el archivo de A da 404 a B (no hay detalle ni historial que leer).
    const ajeno = await http(agencias.B, 'GET', `/api/v1/archivos/${archivo.id}`);
    expect(ajeno.estado).toBe(404);
    expect(JSON.stringify(ajeno.json)).not.toContain(reserva);
  }, 30_000);

  it('la fila no se actualiza ni se borra con el rol de la API (viajapro_app: solo SELECT e INSERT)', async () => {
    const [fila] = await comoAgencia<{ id: string }>(
      agencias.A.tenant,
      'SELECT id FROM reserva_cambios_estado WHERE tenant_id = $1 AND archivo_id = $2 LIMIT 1',
      [agencias.A.tenant, archivo.id],
    );
    expect(fila?.id).toBeDefined();
    await expect(
      comoAgencia(
        agencias.A.tenant,
        "UPDATE reserva_cambios_estado SET estado_nuevo = 'PENDIENTE' WHERE id = $1",
        [fila?.id],
      ),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      comoAgencia(agencias.A.tenant, 'DELETE FROM reserva_cambios_estado WHERE id = $1', [
        fila?.id,
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      comoAgencia(agencias.A.tenant, 'TRUNCATE reserva_cambios_estado', []),
    ).rejects.toMatchObject({ code: '42501' });
    // Sigue ahí.
    expect(
      await comoAgencia(agencias.A.tenant, 'SELECT 1 FROM reserva_cambios_estado WHERE id = $1', [
        fila?.id,
      ]),
    ).toHaveLength(1);
  });
});

describe('la lista ordena por plazo en la base ANTES del límite (T-251)', () => {
  it('con límite 1 sale el de plazo más próximo aunque sea el más antiguo, no el último que se abrió', async () => {
    const A = agencias.A;
    // El más antiguo: confirmado, con un plazo ya vencido (el caso más urgente de todos).
    const viejo = await archivoNuevo(A);
    const reservaViejo = viejo.reservas[0]?.id ?? '';
    const ruta = `/api/v1/archivos/${viejo.id}/reservas/${reservaViejo}`;
    expect((await http(A, 'PUT', ruta, { estado: 'SOLICITADA' })).estado).toBe(200);
    const vencido = new Date(Date.now() - 3_600_000).toISOString();
    expect((await http(A, 'PUT', ruta, { estado: 'CONFIRMADA', timeLimit: vencido })).estado).toBe(
      200,
    );
    // El más nuevo: sin plazo. Con el orden viejo (número descendente, límite, y luego orden en
    // memoria) un límite pequeño se quedaba con este y dejaba fuera al urgente.
    const nuevo = await archivoNuevo(A);

    const completa = ListaDeArchivos.parse(
      (await http(A, 'GET', '/api/v1/archivos?limite=500')).json,
    ).datos;
    expect(completa[0]?.id).toBe(viejo.id);
    expect(completa[0]).toMatchObject({ semaforo: 'VENCIDO' });

    const uno = ListaDeArchivos.parse(
      (await http(A, 'GET', '/api/v1/archivos?limite=1')).json,
    ).datos;
    expect(uno.map((a) => a.id)).toEqual([viejo.id]);
    expect(uno[0]?.id).not.toBe(nuevo.id);

    // Y el recorte es un prefijo de la lista completa: mismo orden, no otro subconjunto.
    const tres = ListaDeArchivos.parse(
      (await http(A, 'GET', '/api/v1/archivos?limite=3')).json,
    ).datos;
    expect(tres.map((a) => a.id)).toEqual(completa.slice(0, 3).map((a) => a.id));
  }, 60_000);
});
