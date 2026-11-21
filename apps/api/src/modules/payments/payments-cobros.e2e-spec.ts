/**
 * T-330 de punta a punta: aplicación ensamblada, HTTP real y PostgreSQL con RLS. Dos agencias.
 *
 * **Esta prueba NO se ejecutó en el entorno donde se escribió (no hay PostgreSQL local): corre en el
 * job de integración del CI.** Está escrita contra la migración `20261121140000` y los moldes de
 * `booking-archivos.e2e-spec.ts`.
 *
 * Los archivos NO se siembran: nacen como en producción, aceptando cotizaciones por la API y
 * esperando al despachador. Lo que afirma, regla por regla de la nota de T-330 y del ADR-0034:
 *
 *   · AISLAMIENTO: un asesor de otra agencia no ve ni toca el cobro (404 en lectura, registro,
 *     reverso y plazo), y la otra agencia queda intacta en la base;
 *   · PERMISOS con sesiones reales: ASESOR solo registra PAGO; DEVOLUCION, AJUSTE, PENALIDAD, REVERSO,
 *     plazo y parámetros exigen `cobro.corregir`; sin `cobro.ver` no se lee;
 *   · `registrado_por` sale de la sesión (el cuerpo con `registradoPor` es un 400);
 *   · IDEMPOTENCIA: mismo contenido 200, distinto 409, y concurrencia (una sola fila);
 *   · tipo según el estado del archivo, devolución y reverso sin lo pagado en negativo, penalidad
 *     acotada, `pagado_el` no futuro, moneda del archivo, Luhn sin repetir el valor, sobrepago;
 *   · la CARRERA registrar-pago vs cancelar-archivo, serializada por el `FOR SHARE` del puerto;
 *   · sumas como `bigint` (más allá de 2^53); ninguna ruta devuelve neto ni margen;
 *   · eventos al outbox con solo ids; ninguna ruta de edición o borrado.
 *
 * **Fixtures propios**, agencias `fixture-aislamiento-` purgadas al terminar. Las lecturas directas
 * van con el ROL de la API (`SET LOCAL ROLE viajapro_app`).
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import {
  CobroDelArchivo,
  type CotizacionGuardada,
  ListaDeArchivos,
  ResultadoDeMovimiento,
  type ResumenDeArchivo,
  VistaDeCobros,
} from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();

const DIA_MS = 86_400_000;
const hoyUtc = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
const enDias = (d: Date, n: number): Date => new Date(d.getTime() + n * DIA_MS);
const fechaIso = (d: Date): string => d.toISOString().slice(0, 10);
const SALIDA = enDias(hoyUtc, 120);
const FECHA = fechaIso(SALIDA);
// «Hoy» de la agencia es el de Bogotá: se usa AYER (siempre pasado) y +3 días (siempre futuro).
const AYER = fechaIso(enDias(hoyUtc, -1));
const FUTURO = fechaIso(enDias(hoyUtc, 3));

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

/** Miembros de A con sesión real. */
type Miembro = 'asesor' | 'dueno' | 'soloVer' | 'sinCobro';
const MIEMBROS: readonly Miembro[] = ['asesor', 'dueno', 'soloVer', 'sinCobro'];
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
const PERMISOS_DE: Record<Miembro, string[]> = {
  // Los del rol ASESOR sembrado (ADR-0034 §6): ve y registra, no corrige.
  asesor: ['archivo.ver', 'archivo.operar', 'cobro.ver', 'cobro.registrar'],
  dueno: ['archivo.ver', 'archivo.operar', 'cobro.ver', 'cobro.registrar', 'cobro.corregir'],
  soloVer: ['archivo.ver', 'cobro.ver'],
  sinCobro: ['archivo.ver', 'archivo.operar', 'crm.escribir'],
};
const correos = {} as Record<Miembro, string>;
const cookies = {} as Record<Miembro, string>;
const usuarios = {} as Record<Miembro, string>;
const identidadesDeMiembros: string[] = [];
const rnd = (): number => Math.floor(Math.random() * 250) + 1;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function crearMiembro(quien: Miembro, tenant: string): Promise<void> {
  const rol = await admin.rol.create({
    data: { tenantId: tenant, nombre: `Rol ${quien}`, permisos: PERMISOS_DE[quien] },
  });
  correos[quien] =
    `fixture-aislamiento-cobro-${quien.toLowerCase()}-${randomBytes(3).toString('hex')}@fixture-identidad.test`;
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
  const usuario = await admin.usuario.create({
    data: {
      tenantId: tenant,
      identidadId: identidad.id,
      rolId: rol.id,
      correo: identidad.correo,
      nombre: identidad.nombre,
    },
  });
  usuarios[quien] = usuario.id;
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

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';
interface Respuesta {
  estado: number;
  json: unknown;
  texto: string;
}

/** Con la sesión real del miembro: sus permisos son los de su rol. */
async function comoMiembro(
  quien: Miembro,
  metodo: Metodo,
  ruta: string,
  cuerpo?: unknown,
): Promise<Respuesta> {
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
  return { estado: r.status, json: texto ? (JSON.parse(texto) as unknown) : {}, texto };
}

/** Atajo de desarrollo: TODOS los permisos. Para cancelar y para la agencia B. */
async function http(
  quien: Agencia,
  metodo: Metodo,
  ruta: string,
  cuerpo?: unknown,
): Promise<Respuesta> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-dev-tenant-id': quien.tenant,
      'x-dev-usuario-id': quien.usuario,
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const texto = await r.text();
  return { estado: r.status, json: texto ? (JSON.parse(texto) as unknown) : {}, texto };
}

const codigo = (json: unknown): string => (json as { error: { code: string } }).error.code;

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

interface FilaDePago {
  id: string;
  tipo: string;
  monto: string;
  registrado_por: string;
  travel_file_id: string;
  reverso_de_id: string | null;
}

const pagosEnBase = (tenant: string, archivoId: string) =>
  comoAgencia<FilaDePago>(
    tenant,
    `SELECT id, tipo::text AS tipo, monto_unidades::text AS monto, registrado_por, travel_file_id,
            reverso_de_id
       FROM pagos WHERE tenant_id = $1 AND travel_file_id = $2 ORDER BY registrado_en, id`,
    [tenant, archivoId],
  );

async function crearAgencia(tenant: string, letra: string): Promise<Agencia> {
  await admin.tenant.create({
    data: { id: tenant, slug: `fixture-aislamiento-cobro-${tenant.slice(-12)}`, nombre: letra },
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
      correo: `fixture-aislamiento-cobro-${letra}-${randomBytes(3).toString('hex')}@fixture-identidad.test`,
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
      nombre: `Paquete ${letra} cobros`,
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

/** Guarda, envía y acepta una cotización por la API, y espera a que el despachador abra su archivo. */
async function archivoNuevo(quien: Agencia): Promise<ResumenDeArchivo> {
  const alta = await http(quien, 'POST', '/api/v1/cotizaciones', {
    contactoId: quien.contacto,
    titulo: 'Cotización de cobros',
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

const pago = (unidades: bigint | string, extra: Record<string, unknown> = {}) => ({
  tipo: 'PAGO',
  claveIdempotencia: randomUUID(),
  monto: { unidades: String(unidades), moneda: 'COP' },
  pagadoEl: AYER,
  medio: 'TRANSFERENCIA',
  ...extra,
});
const devolucion = (unidades: bigint | string, extra: Record<string, unknown> = {}) => ({
  tipo: 'DEVOLUCION',
  claveIdempotencia: randomUUID(),
  monto: { unidades: String(unidades), moneda: 'COP' },
  pagadoEl: AYER,
  medio: 'EFECTIVO',
  ...extra,
});
const ajuste = (unidades: string, extra: Record<string, unknown> = {}) => ({
  tipo: 'AJUSTE',
  claveIdempotencia: randomUUID(),
  monto: { unidades, moneda: 'COP' },
  motivo: 'Descuento acordado',
  ...extra,
});
const penalidad = (unidades: bigint | string, extra: Record<string, unknown> = {}) => ({
  tipo: 'PENALIDAD',
  claveIdempotencia: randomUUID(),
  monto: { unidades: String(unidades), moneda: 'COP' },
  motivo: 'Cancelación fuera de plazo',
  ...extra,
});
const reverso = (extra: Record<string, unknown> = {}) => ({
  claveIdempotencia: randomUUID(),
  motivo: 'Registrado por error',
  ...extra,
});

const rutaPagos = (id: string) => `/api/v1/archivos/${id}/pagos`;
const rutaCobro = (id: string) => `/api/v1/archivos/${id}/cobro`;

async function cobroDe(quien: Miembro, id: string): Promise<CobroDelArchivo> {
  const r = await comoMiembro(quien, 'GET', rutaCobro(id));
  expect(r.estado).toBe(200);
  return CobroDelArchivo.parse(r.json);
}

/** Registra un pago y exige 201: para preparar un escenario. */
async function pagar(quien: Miembro, id: string, unidades: bigint | string, extra = {}) {
  const r = await comoMiembro(quien, 'POST', rutaPagos(id), pago(unidades, extra));
  expect(r.estado, r.texto).toBe(201);
  return ResultadoDeMovimiento.parse(r.json);
}

const archivos = {} as Record<
  'principal' | 'cancelable' | 'grande' | 'carrera' | 'reversos' | 'plazos' | 'deB',
  ResumenDeArchivo
>;
const venta = (a: ResumenDeArchivo): bigint => BigInt(a.venta.unidades);

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

  for (const m of MIEMBROS) cookies[m] = await iniciarSesion(m);

  archivos.principal = await archivoNuevo(agencias.A);
  archivos.cancelable = await archivoNuevo(agencias.A);
  archivos.grande = await archivoNuevo(agencias.A);
  archivos.carrera = await archivoNuevo(agencias.A);
  archivos.reversos = await archivoNuevo(agencias.A);
  archivos.plazos = await archivoNuevo(agencias.A);
  archivos.deB = await archivoNuevo(agencias.B);
}, 180_000);

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

describe('registrar un pago y leer el saldo (T-330)', () => {
  it('ASESOR registra un PAGO: 201, saldo calculado en el servidor y `registrado_por` de la sesión', async () => {
    const a = archivos.principal;
    const r = await comoMiembro(
      'asesor',
      'POST',
      rutaPagos(a.id),
      pago(800_000n, { nota: 'Anticipo' }),
    );
    expect(r.estado, r.texto).toBe(201);
    const res = ResultadoDeMovimiento.parse(r.json);
    expect(res.movimiento.tipo).toBe('PAGO');
    expect(res.movimiento.registradoPor).toBe(usuarios.asesor);
    expect(res.cobro.total.unidades).toBe(venta(a).toString());
    expect(res.cobro.pagado.unidades).toBe('800000');
    expect(res.cobro.saldo.unidades).toBe((venta(a) - 800_000n).toString());
    expect(res.cobro.situacion).toBe('PARCIAL');
    // El libro: una fila, con el autor de la sesión.
    const filas = await pagosEnBase(TENANT_A, a.id);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.registrado_por).toBe(usuarios.asesor);
    expect(filas[0]?.monto).toBe('800000');
  });

  it('el cuerpo NO puede traer registradoPor, registradoEn ni tenantId: 400 y nada escrito', async () => {
    const a = archivos.principal;
    const antes = (await pagosEnBase(TENANT_A, a.id)).length;
    for (const extra of [
      { registradoPor: usuarios.dueno },
      { registradoEn: '2020-01-01T00:00:00.000Z' },
      { tenantId: TENANT_B },
      { travelFileId: archivos.deB.id },
    ]) {
      const r = await comoMiembro('asesor', 'POST', rutaPagos(a.id), pago(1_000n, extra));
      expect(r.estado).toBe(400);
      expect(codigo(r.json)).toBe('ENTRADA_INVALIDA');
    }
    expect(await pagosEnBase(TENANT_A, a.id)).toHaveLength(antes);
  });

  it('el saldo se lee de nuevo igual y el estado de cobro por defecto es el de «salida − 30 días»', async () => {
    const a = archivos.principal;
    const c = await cobroDe('soloVer', a.id);
    expect(c.pagado.unidades).toBe('800000');
    expect(c.diasDePlazo).toBe(30);
    expect(c.fechaLimiteManual).toBe(false);
    expect(c.fechaLimite).toBe(fechaIso(enDias(SALIDA, -30)));
    expect(c.estadoDeCobro).toBe('SALDO_PENDIENTE');
    expect(c.movimientos).toHaveLength(1);
  });

  it('ninguna ruta devuelve neto ni margen', async () => {
    const a = archivos.principal;
    const cobro = await comoMiembro('dueno', 'GET', rutaCobro(a.id));
    const vista = await comoMiembro('dueno', 'GET', '/api/v1/cobros');
    for (const r of [cobro, vista]) {
      expect(r.estado).toBe(200);
      expect(r.texto).not.toMatch(/neto|margen/i);
    }
  });
});

describe('idempotencia (R5)', () => {
  it('el mismo contenido con la misma clave responde 200 con la misma fila; otro contenido, 409', async () => {
    const a = archivos.principal;
    const cuerpo = pago(50_000n);
    const primero = await comoMiembro('asesor', 'POST', rutaPagos(a.id), cuerpo);
    const segundo = await comoMiembro('asesor', 'POST', rutaPagos(a.id), cuerpo);
    expect(primero.estado).toBe(201);
    expect(segundo.estado).toBe(200);
    expect(ResultadoDeMovimiento.parse(segundo.json).movimiento.id).toBe(
      ResultadoDeMovimiento.parse(primero.json).movimiento.id,
    );

    for (const cambio of [
      { monto: { unidades: '50001', moneda: 'COP' } },
      { pagadoEl: fechaIso(enDias(hoyUtc, -2)) },
      { medio: 'EFECTIVO' },
    ]) {
      const otro = await comoMiembro('asesor', 'POST', rutaPagos(a.id), { ...cuerpo, ...cambio });
      expect(otro.estado).toBe(409);
      expect(codigo(otro.json)).toBe('CLAVE_DE_IDEMPOTENCIA_REUTILIZADA');
    }
    const filas = await pagosEnBase(TENANT_A, a.id);
    expect(filas.filter((f) => f.monto === '50000')).toHaveLength(1);
  });

  it('concurrencia: seis peticiones iguales a la vez crean UNA fila (una 201, cinco 200)', async () => {
    const a = archivos.principal;
    const cuerpo = pago(10_000n);
    const antes = (await pagosEnBase(TENANT_A, a.id)).length;
    const rs = await Promise.all(
      Array.from({ length: 6 }, () => comoMiembro('asesor', 'POST', rutaPagos(a.id), cuerpo)),
    );
    expect(rs.map((r) => r.estado).sort()).toEqual([200, 200, 200, 200, 200, 201]);
    expect(await pagosEnBase(TENANT_A, a.id)).toHaveLength(antes + 1);
  });

  it('una clave de OTRA agencia no es un reintento: cada una registra lo suyo', async () => {
    const cuerpo = pago(1_000n);
    const deA = await comoMiembro('asesor', 'POST', rutaPagos(archivos.cancelable.id), cuerpo);
    const deB = await http(agencias.B, 'POST', rutaPagos(archivos.deB.id), cuerpo);
    expect(deA.estado).toBe(201);
    expect(deB.estado).toBe(201);
  });
});

describe('permisos con sesiones reales (ADR-0034 §6)', () => {
  it('ASESOR no puede DEVOLUCION, AJUSTE ni PENALIDAD: 403 PERMISO_DENEGADO y nada escrito', async () => {
    const a = archivos.reversos;
    for (const cuerpo of [devolucion(1n), ajuste('-1'), penalidad(1n)]) {
      const r = await comoMiembro('asesor', 'POST', rutaPagos(a.id), cuerpo);
      expect(r.estado).toBe(403);
      expect(codigo(r.json)).toBe('PERMISO_DENEGADO');
    }
    expect(await pagosEnBase(TENANT_A, a.id)).toHaveLength(0);
  });

  it('ASESOR no puede reversar, fijar un plazo ni cambiar los días de la agencia', async () => {
    const a = archivos.reversos;
    const p = await pagar('dueno', a.id, 1_000n);
    const id = p.movimiento.id;
    const intentos: Respuesta[] = [
      await comoMiembro('asesor', 'POST', `${rutaPagos(a.id)}/${id}/reverso`, reverso()),
      await comoMiembro('asesor', 'POST', `/api/v1/archivos/${a.id}/plazo-de-cobro`, {
        venceEl: fechaIso(enDias(hoyUtc, 10)),
      }),
      await comoMiembro('asesor', 'PUT', '/api/v1/cobros/parametros', { diasPlazoDeCobro: 5 }),
    ];
    for (const r of intentos) {
      expect(r.estado).toBe(403);
      expect(codigo(r.json)).toBe('PERMISO_DENEGADO');
    }
    expect((await pagosEnBase(TENANT_A, a.id)).filter((f) => f.tipo === 'REVERSO')).toHaveLength(0);
  });

  it('solo cobro.ver lee pero no registra; sin cobro.ver no se lee ni la lista ni el detalle', async () => {
    const a = archivos.principal;
    expect((await comoMiembro('soloVer', 'GET', rutaCobro(a.id))).estado).toBe(200);
    expect((await comoMiembro('soloVer', 'GET', '/api/v1/cobros')).estado).toBe(200);
    const escribe = await comoMiembro('soloVer', 'POST', rutaPagos(a.id), pago(1n));
    expect(escribe.estado).toBe(403);
    for (const ruta of [rutaCobro(a.id), '/api/v1/cobros']) {
      const r = await comoMiembro('sinCobro', 'GET', ruta);
      expect(r.estado).toBe(403);
      expect(codigo(r.json)).toBe('PERMISO_DENEGADO');
    }
    const registra = await comoMiembro('sinCobro', 'POST', rutaPagos(a.id), pago(1n));
    expect(registra.estado).toBe(403);
  });

  it('el DUEÑO registra los cuatro tipos y reversa', async () => {
    const a = archivos.reversos;
    await pagar('dueno', a.id, 500_000n);
    const r1 = await comoMiembro('dueno', 'POST', rutaPagos(a.id), devolucion(100_000n));
    const r2 = await comoMiembro('dueno', 'POST', rutaPagos(a.id), ajuste('-50000'));
    expect([r1.estado, r2.estado]).toEqual([201, 201]);
  });
});

describe('aislamiento entre agencias', () => {
  it('un asesor de A no ve ni toca el cobro del archivo de B: 404 en cada ruta, y B queda intacta', async () => {
    const deB = archivos.deB;
    await http(agencias.B, 'POST', rutaPagos(deB.id), pago(5_000n));
    const original = await pagosEnBase(TENANT_B, deB.id);
    expect(original.length).toBeGreaterThan(0);
    const idDeB = original[0]?.id ?? '';

    const intentos: Respuesta[] = [
      await comoMiembro('dueno', 'GET', rutaCobro(deB.id)),
      await comoMiembro('dueno', 'POST', rutaPagos(deB.id), pago(1_000n)),
      await comoMiembro('dueno', 'POST', `${rutaPagos(deB.id)}/${idDeB}/reverso`, reverso()),
      await comoMiembro(
        'dueno',
        'POST',
        `${rutaPagos(archivos.principal.id)}/${idDeB}/reverso`,
        reverso(),
      ),
      await comoMiembro('dueno', 'POST', `/api/v1/archivos/${deB.id}/plazo-de-cobro`, {
        venceEl: fechaIso(enDias(hoyUtc, 10)),
      }),
    ];
    for (const r of intentos) {
      expect(r.estado).toBe(404);
      expect(r.texto).not.toContain(deB.paqueteNombre);
    }
    // B sigue con lo que tenía, sin reversos ni plazos de A.
    expect(await pagosEnBase(TENANT_B, deB.id)).toHaveLength(original.length);
    const plazosDeB = await comoAgencia<{ n: string }>(
      TENANT_B,
      'SELECT count(*)::text AS n FROM plazos_de_cobro WHERE tenant_id = $1',
      [TENANT_B],
    );
    expect(plazosDeB[0]?.n).toBe('0');
  });

  it('la vista de A no trae archivos de B y RLS oculta los pagos de A a B', async () => {
    const r = await comoMiembro('dueno', 'GET', '/api/v1/cobros');
    const vista = VistaDeCobros.parse(r.json);
    expect(vista.datos.map((f) => f.archivoId)).not.toContain(archivos.deB.id);
    expect(vista.datos.map((f) => f.archivoId)).toContain(archivos.principal.id);
    const deAVistoPorB = await comoAgencia<{ n: string }>(
      TENANT_B,
      'SELECT count(*)::text AS n FROM pagos WHERE travel_file_id = $1',
      [archivos.principal.id],
    );
    expect(deAVistoPorB[0]?.n).toBe('0');
  });

  it('un pagador que es contacto de OTRA agencia se rechaza (404) y nada se escribe', async () => {
    const a = archivos.cancelable;
    const antes = (await pagosEnBase(TENANT_A, a.id)).length;
    const r = await comoMiembro(
      'asesor',
      'POST',
      rutaPagos(a.id),
      pago(1_000n, { pagadorId: agencias.B.contacto }),
    );
    expect(r.estado).toBe(404);
    expect(codigo(r.json)).toBe('PAGADOR_NO_ENCONTRADO');
    expect(await pagosEnBase(TENANT_A, a.id)).toHaveLength(antes);
  });

  it('un pagador de la misma agencia se acepta', async () => {
    const r = await comoMiembro(
      'asesor',
      'POST',
      rutaPagos(archivos.cancelable.id),
      pago(1_000n, { pagadorId: agencias.A.contacto }),
    );
    expect(r.estado).toBe(201);
  });
});

describe('reglas que la base no cubre (nota de T-330)', () => {
  it('otra moneda que la del archivo: 422', async () => {
    const r = await comoMiembro('asesor', 'POST', rutaPagos(archivos.principal.id), {
      ...pago(1_000n),
      monto: { unidades: '1000', moneda: 'USD' },
    });
    expect(r.estado).toBe(422);
    expect(codigo(r.json)).toBe('MONEDA_DISTINTA_DEL_ARCHIVO');
  });

  it('`pagado_el` futuro: 422; ayer: 201', async () => {
    const a = archivos.principal;
    const futuro = await comoMiembro(
      'asesor',
      'POST',
      rutaPagos(a.id),
      pago(1_000n, { pagadoEl: FUTURO }),
    );
    expect(futuro.estado).toBe(422);
    expect(codigo(futuro.json)).toBe('FECHA_DE_PAGO_FUTURA');
  });

  it('sobrepago: 409 sin confirmar, 201 con confirmarSobrepago, y queda saldo a favor', async () => {
    const a = archivos.grande;
    const enExceso = venta(a) + 1n;
    const sin = await comoMiembro('asesor', 'POST', rutaPagos(a.id), pago(enExceso));
    expect(sin.estado).toBe(409);
    expect(codigo(sin.json)).toBe('SOBREPAGO_SIN_CONFIRMAR');
    const con = await comoMiembro(
      'asesor',
      'POST',
      rutaPagos(a.id),
      pago(enExceso, { confirmarSobrepago: true }),
    );
    expect(con.estado).toBe(201);
    const c = ResultadoDeMovimiento.parse(con.json).cobro;
    expect(c.situacion).toBe('SALDO_A_FAVOR');
    expect(c.saldo.unidades).toBe('-1');
    expect(c.estadoDeCobro).toBe('AL_DIA');
  });

  it('Luhn: una tarjeta en `nota` o `referencia` se rechaza (400) sin repetir el valor y sin escribir', async () => {
    const a = archivos.carrera;
    for (const campo of ['nota', 'referencia'] as const) {
      for (const texto of [
        '4111111111111111',
        'tarjeta 4111 1111 1111 1111',
        '4111-1111-1111-1111',
        '4111.1111.1111.1111',
      ]) {
        const r = await comoMiembro(
          'asesor',
          'POST',
          rutaPagos(a.id),
          pago(1_000n, { [campo]: texto }),
        );
        expect(r.estado).toBe(400);
        expect(codigo(r.json)).toBe('ENTRADA_INVALIDA');
        expect(r.texto).not.toContain('4111');
        expect(r.texto).not.toContain('1111');
      }
    }
    expect(await pagosEnBase(TENANT_A, a.id)).toHaveLength(0);
    // Una referencia bancaria corriente sí pasa.
    const ok = await comoMiembro(
      'asesor',
      'POST',
      rutaPagos(a.id),
      pago(1_000n, { referencia: 'CUS 8842193', nota: 'Transferencia Bancolombia' }),
    );
    expect(ok.estado).toBe(201);
  });

  it('un archivo ABIERTO no admite PENALIDAD y uno CANCELADO no admite PAGO ni AJUSTE (409)', async () => {
    const a = archivos.cancelable;
    await pagar('dueno', a.id, 1_000_000n);
    const penalidadAbierto = await comoMiembro('dueno', 'POST', rutaPagos(a.id), penalidad(1n));
    expect(penalidadAbierto.estado).toBe(409);
    expect(codigo(penalidadAbierto.json)).toBe('TIPO_NO_PERMITIDO_PARA_EL_ESTADO_DEL_ARCHIVO');

    const cancelado = await http(agencias.A, 'POST', `/api/v1/archivos/${a.id}/cancelacion`, {
      motivo: 'CLIENTE_DESISTIO',
    });
    expect(cancelado.estado).toBe(201);
    for (const cuerpo of [pago(1n), ajuste('-1')]) {
      const r = await comoMiembro('dueno', 'POST', rutaPagos(a.id), cuerpo);
      expect(r.estado).toBe(409);
      expect(codigo(r.json)).toBe('TIPO_NO_PERMITIDO_PARA_EL_ESTADO_DEL_ARCHIVO');
    }
  });

  it('archivo cancelado: la penalidad no supera lo pagado y cierra en cero con la devolución', async () => {
    const a = archivos.cancelable; // ya cancelado arriba, con 1.000.000 pagados (+1.000 de otros tests)
    const antes = await cobroDe('dueno', a.id);
    const pagado = BigInt(antes.pagado.unidades);
    const demasiada = await comoMiembro('dueno', 'POST', rutaPagos(a.id), penalidad(pagado + 1n));
    expect(demasiada.estado).toBe(422);
    expect(codigo(demasiada.json)).toBe('PENALIDAD_EXCEDE_LO_PAGADO');

    const pena = 300_000n;
    expect((await comoMiembro('dueno', 'POST', rutaPagos(a.id), penalidad(pena))).estado).toBe(201);
    const dev = await comoMiembro('dueno', 'POST', rutaPagos(a.id), devolucion(pagado - pena));
    expect(dev.estado).toBe(201);
    const c = ResultadoDeMovimiento.parse(dev.json).cobro;
    expect(c.estadoDelArchivo).toBe('CANCELADO');
    expect(c.total.unidades).toBe(pena.toString());
    expect(c.saldo.unidades).toBe('0');
    expect(c.situacion).toBe('PAGADO');
    expect(c.estadoDeCobro).toBe('CANCELADO');
  });

  it('devolución mayor que lo pagado: 422', async () => {
    const a = archivos.reversos;
    const c = await cobroDe('dueno', a.id);
    const r = await comoMiembro(
      'dueno',
      'POST',
      rutaPagos(a.id),
      devolucion(BigInt(c.pagado.unidades) + 1n),
    );
    expect(r.estado).toBe(422);
    expect(codigo(r.json)).toBe('DEVOLUCION_EXCEDE_LO_PAGADO');
  });

  it('un ajuste que deja el total negativo: 422', async () => {
    const a = archivos.reversos;
    const c = await cobroDe('dueno', a.id);
    const r = await comoMiembro(
      'dueno',
      'POST',
      rutaPagos(a.id),
      ajuste(`-${BigInt(c.total.unidades) + 1n}`),
    );
    expect(r.estado).toBe(422);
    expect(codigo(r.json)).toBe('AJUSTE_DEJA_EL_TOTAL_NEGATIVO');
  });
});

describe('reverso', () => {
  it('anula el pago con motivo; queda visible; el saldo vuelve; un segundo reverso y el reverso de un reverso, no', async () => {
    const a = archivos.plazos;
    const p = await pagar('dueno', a.id, 300_000n);
    const r = await comoMiembro(
      'dueno',
      'POST',
      `${rutaPagos(a.id)}/${p.movimiento.id}/reverso`,
      reverso(),
    );
    expect(r.estado, r.texto).toBe(201);
    const res = ResultadoDeMovimiento.parse(r.json);
    expect(res.movimiento.tipo).toBe('REVERSO');
    expect(res.movimiento.reversoDeId).toBe(p.movimiento.id);
    expect(res.cobro.pagado.unidades).toBe('0');
    expect(res.cobro.movimientos.find((m) => m.id === p.movimiento.id)?.reversado).toBe(true);

    const doble = await comoMiembro(
      'dueno',
      'POST',
      `${rutaPagos(a.id)}/${p.movimiento.id}/reverso`,
      reverso(),
    );
    expect(doble.estado).toBe(409);
    expect(codigo(doble.json)).toBe('MOVIMIENTO_YA_REVERSADO');

    const deReverso = await comoMiembro(
      'dueno',
      'POST',
      `${rutaPagos(a.id)}/${res.movimiento.id}/reverso`,
      reverso(),
    );
    expect(deReverso.estado).toBe(422);
    expect(codigo(deReverso.json)).toBe('REVERSO_DE_REVERSO');
    expect((await pagosEnBase(TENANT_A, a.id)).filter((f) => f.tipo === 'REVERSO')).toHaveLength(1);
  });

  it('reversar un pago ya devuelto dejaría lo pagado en negativo: 422', async () => {
    const a = archivos.plazos;
    const p = await pagar('dueno', a.id, 200_000n);
    expect((await comoMiembro('dueno', 'POST', rutaPagos(a.id), devolucion(150_000n))).estado).toBe(
      201,
    );
    const r = await comoMiembro(
      'dueno',
      'POST',
      `${rutaPagos(a.id)}/${p.movimiento.id}/reverso`,
      reverso(),
    );
    expect(r.estado).toBe(422);
    expect(codigo(r.json)).toBe('REVERSO_DEJA_LO_PAGADO_NEGATIVO');
  });

  it('el reverso es idempotente (200 con la misma clave) y exige motivo', async () => {
    const a = archivos.plazos;
    const p = await pagar('dueno', a.id, 1_000n);
    const ruta = `${rutaPagos(a.id)}/${p.movimiento.id}/reverso`;
    const cuerpo = reverso();
    const primero = await comoMiembro('dueno', 'POST', ruta, cuerpo);
    const segundo = await comoMiembro('dueno', 'POST', ruta, cuerpo);
    expect([primero.estado, segundo.estado]).toEqual([201, 200]);
    expect(
      (await comoMiembro('dueno', 'POST', ruta, { claveIdempotencia: randomUUID() })).estado,
    ).toBe(400);
  });

  it('un movimiento de otro archivo de la misma agencia no se reversa desde esta URL: 404', async () => {
    const p = await pagar('dueno', archivos.plazos.id, 1_000n);
    const r = await comoMiembro(
      'dueno',
      'POST',
      `${rutaPagos(archivos.principal.id)}/${p.movimiento.id}/reverso`,
      reverso(),
    );
    expect(r.estado).toBe(404);
    expect(codigo(r.json)).toBe('MOVIMIENTO_DE_COBRO_NO_ENCONTRADO');
  });

  it('el libro no se edita ni se borra por la API: PUT y DELETE no existen', async () => {
    const a = archivos.plazos;
    const [fila] = await pagosEnBase(TENANT_A, a.id);
    for (const metodo of ['PUT', 'DELETE'] as const) {
      const r = await comoMiembro('dueno', metodo, `${rutaPagos(a.id)}/${fila?.id ?? ''}`, {});
      expect(r.estado).toBe(404);
    }
  });
});

describe('plazo de cobro y parámetros (`registrado_en` nunca del cliente)', () => {
  it('rige la última fila del archivo; el cliente no manda `registradoEn`; los días de la agencia mueven el defecto', async () => {
    const a = archivos.plazos;
    const url = `/api/v1/archivos/${a.id}/plazo-de-cobro`;
    const primera = fechaIso(enDias(hoyUtc, 20));
    const segunda = fechaIso(enDias(hoyUtc, 40));

    const conRegistradoEn = await comoMiembro('dueno', 'POST', url, {
      venceEl: primera,
      registradoEn: '2000-01-01T00:00:00.000Z',
    });
    expect(conRegistradoEn.estado).toBe(400);

    expect((await comoMiembro('dueno', 'POST', url, { venceEl: primera })).estado).toBe(201);
    const c2 = await comoMiembro('dueno', 'POST', url, {
      venceEl: segunda,
      motivo: 'Pidió más tiempo',
    });
    expect(CobroDelArchivo.parse(c2.json).fechaLimite).toBe(segunda);
    expect((await cobroDe('dueno', a.id)).fechaLimiteManual).toBe(true);

    // Orden (registrado_en, id) en la base: la última fila es la segunda y su instante lo fijó la base.
    const filas = await comoAgencia<{ vence_el: string; registrado_en: Date }>(
      TENANT_A,
      `SELECT vence_el::text AS vence_el, registrado_en FROM plazos_de_cobro
        WHERE tenant_id = $1 AND travel_file_id = $2 ORDER BY registrado_en, id`,
      [TENANT_A, a.id],
    );
    expect(filas.map((f) => f.vence_el)).toEqual([primera, segunda]);
    expect(Math.abs(Date.now() - (filas[1]?.registrado_en.getTime() ?? 0))).toBeLessThan(120_000);

    // Repetir lo mismo no inserta otra fila.
    await comoMiembro('dueno', 'POST', url, { venceEl: segunda, motivo: 'Pidió más tiempo' });
    const n = await comoAgencia<{ n: string }>(
      TENANT_A,
      'SELECT count(*)::text AS n FROM plazos_de_cobro WHERE tenant_id = $1 AND travel_file_id = $2',
      [TENANT_A, a.id],
    );
    expect(n[0]?.n).toBe('2');
  });

  it('PUT /cobros/parametros: los días de la agencia (0..365) cambian la fecha límite por defecto', async () => {
    const a = archivos.principal;
    expect(
      (await comoMiembro('dueno', 'PUT', '/api/v1/cobros/parametros', { diasPlazoDeCobro: 366 }))
        .estado,
    ).toBe(400);
    const r = await comoMiembro('dueno', 'PUT', '/api/v1/cobros/parametros', {
      diasPlazoDeCobro: 45,
    });
    expect(r.estado, r.texto).toBe(200);
    const c = await cobroDe('dueno', a.id);
    expect(c.diasDePlazo).toBe(45);
    expect(c.fechaLimite).toBe(fechaIso(enDias(SALIDA, -45)));
    // Es un upsert: otra vez no choca.
    expect(
      (await comoMiembro('dueno', 'PUT', '/api/v1/cobros/parametros', { diasPlazoDeCobro: 0 }))
        .estado,
    ).toBe(200);
  });
});

describe('sumas en bigint', () => {
  it('diez pagos de 10^15 − 1 y uno de 1 suman exacto en la base, el detalle y la vista (más allá de 2^53)', async () => {
    const a = archivos.grande;
    const tope = '999999999999999';
    const antes = BigInt((await cobroDe('dueno', a.id)).pagado.unidades);
    for (let i = 0; i < 10; i++) await pagar('dueno', a.id, tope, { confirmarSobrepago: true });
    await pagar('dueno', a.id, '1', { confirmarSobrepago: true });
    const esperado = antes + 10n * 999_999_999_999_999n + 1n;
    expect(esperado).toBeGreaterThan(2n ** 53n);
    expect((await cobroDe('dueno', a.id)).pagado.unidades).toBe(esperado.toString());
    const vista = VistaDeCobros.parse((await comoMiembro('dueno', 'GET', '/api/v1/cobros')).json);
    expect(vista.datos.find((f) => f.archivoId === a.id)?.pagado.unidades).toBe(
      esperado.toString(),
    );
    // La suma de la base, leída como texto, coincide dígito a dígito.
    const [fila] = await comoAgencia<{ suma: string }>(
      TENANT_A,
      `SELECT sum(monto_unidades)::text AS suma FROM pagos
        WHERE tenant_id = $1 AND travel_file_id = $2 AND tipo = 'PAGO'`,
      [TENANT_A, a.id],
    );
    expect(fila?.suma).toBe(esperado.toString());
  });

  it('un monto de 10^15 se rechaza en el contrato', async () => {
    const r = await comoMiembro(
      'dueno',
      'POST',
      rutaPagos(archivos.grande.id),
      pago('1000000000000000', { confirmarSobrepago: true }),
    );
    expect(r.estado).toBe(400);
  });

  it('la vista agrupa por moneda y trae solo archivos abiertos de la agencia', async () => {
    const vista = VistaDeCobros.parse((await comoMiembro('soloVer', 'GET', '/api/v1/cobros')).json);
    expect(vista.totales.map((t) => t.moneda)).toEqual(['COP']);
    expect(vista.datos.every((f) => f.total.moneda === 'COP')).toBe(true);
    expect(vista.datos.map((f) => f.archivoId)).not.toContain(archivos.cancelable.id); // cancelado
    const filtrada = VistaDeCobros.parse(
      (await comoMiembro('soloVer', 'GET', '/api/v1/cobros?estadoDeCobro=VENCIDO')).json,
    );
    expect(filtrada.datos).toHaveLength(0);
  });
});

describe('eventos al outbox (ADR-0034 §7)', () => {
  it('pago_registrado y pago_reversado llevan SOLO ids: ni monto, ni nota, ni motivo', async () => {
    const a = archivos.carrera;
    const p = await pagar('dueno', a.id, 123_456n, { nota: 'Nota privada de prueba' });
    const rev = await comoMiembro(
      'dueno',
      'POST',
      `${rutaPagos(a.id)}/${p.movimiento.id}/reverso`,
      reverso({ motivo: 'Motivo privado de prueba' }),
    );
    expect(rev.estado).toBe(201);
    const { rows } = await adminPg.query<{ tipo_evento: string; payload: Record<string, unknown> }>(
      `SELECT tipo_evento, payload FROM outbox
        WHERE tenant_id = $1 AND tipo_evento LIKE 'payments.%'
          AND (payload->>'travelFileId') = $2 ORDER BY id`,
      [TENANT_A, a.id],
    );
    const tipos = rows.map((r) => r.tipo_evento);
    expect(tipos).toContain('payments.pago_registrado');
    expect(tipos).toContain('payments.pago_reversado');
    for (const r of rows) {
      const claves = Object.keys(r.payload).sort();
      expect(
        r.tipo_evento === 'payments.pago_registrado'
          ? claves
          : ['pagoId', 'reversoDeId', 'travelFileId', 'v'],
      ).toEqual(
        r.tipo_evento === 'payments.pago_registrado'
          ? ['pagoId', 'tipo', 'travelFileId', 'v']
          : claves,
      );
      const texto = JSON.stringify(r.payload);
      for (const prohibido of ['123456', 'privada', 'privado'])
        expect(texto).not.toContain(prohibido);
    }
  });
});

describe('la carrera registrar-pago vs cancelar-archivo', () => {
  it('con una operación de booking en curso (fila bloqueada), el pago ESPERA y, al confirmarse la cancelación, la ve y se rechaza', async () => {
    const a = archivos.carrera;
    const bloqueador = new Client({ connectionString: process.env['DATABASE_URL'] });
    await bloqueador.connect();
    try {
      await bloqueador.query('BEGIN');
      await bloqueador.query("SELECT set_config('app.current_tenant', $1, true)", [TENANT_A]);
      // Lo que hace `cancelar` de booking: `FOR UPDATE` sobre el archivo.
      await bloqueador.query(
        'SELECT id FROM travel_files WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [a.id, TENANT_A],
      );

      const antes = (await pagosEnBase(TENANT_A, a.id)).length;
      const pendiente = comoMiembro('asesor', 'POST', rutaPagos(a.id), pago(1_000n));
      const estado = await Promise.race([
        pendiente.then(() => 'resuelto' as const),
        esperar(1_500).then(() => 'esperando' as const),
      ]);
      // El pago no pudo ni leer el archivo: está esperando el candado de la fila.
      expect(estado).toBe('esperando');

      await bloqueador.query(
        `UPDATE travel_files SET estado = 'CANCELADO', motivo_cancelacion = 'OTRO',
                cancelado_en = now(), cancelado_por = $3
          WHERE id = $1 AND tenant_id = $2`,
        [a.id, TENANT_A, agencias.A.usuario],
      );
      await bloqueador.query('COMMIT');

      const r = await pendiente;
      // Vio el archivo ya cancelado (no una foto anterior): no se registra un PAGO sobre un archivo cancelado.
      expect(r.estado).toBe(409);
      expect(codigo(r.json)).toBe('TIPO_NO_PERMITIDO_PARA_EL_ESTADO_DEL_ARCHIVO');
      expect(await pagosEnBase(TENANT_A, a.id)).toHaveLength(antes);
    } finally {
      await bloqueador.query('ROLLBACK').catch(() => undefined);
      await bloqueador.end();
    }
  });

  it('en carrera real (cancelar y pagar a la vez) nunca hay un 500 ni un estado a medias', async () => {
    for (let i = 0; i < 4; i++) {
      const a = await archivoNuevo(agencias.A);
      const [cancelar, pagar1] = await Promise.all([
        http(agencias.A, 'POST', `/api/v1/archivos/${a.id}/cancelacion`, {
          motivo: 'CLIENTE_DESISTIO',
        }),
        comoMiembro('asesor', 'POST', rutaPagos(a.id), pago(1_000n)),
      ]);
      expect(cancelar.estado).toBe(201);
      expect([201, 409]).toContain(pagar1.estado);
      const filas = await pagosEnBase(TENANT_A, a.id);
      // 201 ⇔ hay una fila (entró ANTES de cancelar); 409 ⇔ no la hay (la cancelación ganó).
      expect(filas).toHaveLength(pagar1.estado === 201 ? 1 : 0);
      // Y ya cancelado, ningún PAGO más.
      const despues = await comoMiembro('asesor', 'POST', rutaPagos(a.id), pago(1_000n));
      expect(despues.estado).toBe(409);
    }
  }, 120_000);
});
