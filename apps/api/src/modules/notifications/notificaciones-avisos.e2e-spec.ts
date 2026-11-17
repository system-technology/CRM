/**
 * T-254 de punta a punta: aplicación ensamblada, HTTP real y PostgreSQL con RLS. Dos agencias.
 *
 * Un aviso de plazo en el outbox (`booking.*`) llega a los consumidores de `notifications` por el
 * despachador y se convierte en una notificación en la aplicación para el destinatario correcto.
 * Lo que afirma:
 *
 *   · el aviso va al ASESOR de la oportunidad del archivo y solo a él; a nadie más de la agencia;
 *   · sin oportunidad, a TODOS los que pueden operar archivos (`archivo.operar`) y a nadie sin ese
 *     permiso (control positivo y negativo);
 *   · un evento → una notificación por destinatario: dos pasadas del despachador no duplican, y
 *     reentregar (borrada la marca de entrega) tampoco (UNIQUE por evento/destinatario);
 *   · AISLAMIENTO: B no ve las notificaciones de A (lista vacía de lo ajeno) y no puede marcar la
 *     de A (404, la fila queda sin leer); otro usuario de la MISMA agencia tampoco (404);
 *   · listar: no leídas primero y contador de no leídas; marcar es idempotente y conserva la hora;
 *   · un evento con forma inválida no crea nada, guarda solo el CÓDIGO del error y reintenta.
 *
 * Los archivos NO se siembran: nacen aceptando cotizaciones por la API (como `booking-archivos`). Los
 * eventos de aviso se escriben directo en el outbox y se despachan A MANO por agencia con el
 * despachador del consumidor: no se depende del barrido de arranque (inerte en las e2e).
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
  ListaDeArchivos,
  ListaDeNotificaciones,
  Notificacion,
  type ResumenDeArchivo,
} from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DespachadorDeConsumidor } from '../../shared/eventos/despachador-de-consumidor.js';
import { PlanificadorDeDespacho } from '../../shared/eventos/planificador-de-despacho.js';
import { RegistroDeConsumidores } from '../../shared/eventos/registro-de-consumidores.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const FECHA = '2027-03-15';
const ORIGEN_WEB = 'http://localhost:3000';
const CLAVE = 'una-clave-larga-de-prueba-1';
const VENCE = '2027-03-10T15:00:00.000Z';

type Persona = 'asesorA' | 'otroA' | 'sinPermisoA' | 'asesorB';
const PERMISOS_DE: Record<Persona, string[]> = {
  asesorA: ['archivo.ver', 'archivo.operar'],
  otroA: ['archivo.ver', 'archivo.operar'],
  sinPermisoA: ['crm.escribir', 'cotizacion.escribir'],
  asesorB: ['archivo.ver', 'archivo.operar'],
};
const TENANT_DE: Record<Persona, string> = {
  asesorA: TENANT_A,
  otroA: TENANT_A,
  sinPermisoA: TENANT_A,
  asesorB: TENANT_B,
};

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
let registro: RegistroDeConsumidores;
let prisma: PrismaService;
const agencias = {} as Record<'A' | 'B', Agencia>;
const usuarioDe = {} as Record<Persona, string>;
const cookies = {} as Record<Persona, string>;
const identidadesDePersonas: string[] = [];
const rnd = (): number => Math.floor(Math.random() * 250) + 1;

async function crearPersona(quien: Persona): Promise<void> {
  const tenant = TENANT_DE[quien];
  const rol = await admin.rol.create({
    data: { tenantId: tenant, nombre: `Rol ${quien}`, permisos: PERMISOS_DE[quien] },
  });
  const correo = `fixture-aislamiento-avisos-${quien.toLowerCase()}-${randomBytes(3).toString('hex')}@fixture-identidad.test`;
  const identidad = await admin.identidad.create({
    data: { correo, nombre: `Persona ${quien}`, correoVerificado: true },
  });
  identidadesDePersonas.push(identidad.id);
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
      correo,
      nombre: identidad.nombre,
    },
  });
  usuarioDe[quien] = usuario.id;
  const r = await fetch(new URL('/api/v1/auth/sign-in/email', base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGEN_WEB,
      'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`,
    },
    body: JSON.stringify({ correo, contrasena: CLAVE }),
  });
  expect(r.status).toBe(200);
  cookies[quien] = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

/** Como la persona, con su sesión real. */
async function como(
  quien: Persona,
  metodo: 'GET' | 'POST',
  ruta: string,
): Promise<{ estado: number; json: unknown }> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      origin: ORIGEN_WEB,
      cookie: cookies[quien],
      'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`,
    },
    ...(metodo === 'POST' ? { body: '{}' } : {}),
  });
  const texto = await r.text();
  return { estado: r.status, json: texto ? (JSON.parse(texto) as unknown) : {} };
}

const lista = async (quien: Persona) =>
  ListaDeNotificaciones.parse((await como(quien, 'GET', '/api/v1/notificaciones')).json);

/** Atajo de desarrollo (todos los permisos): solo para armar los archivos. */
async function armar(
  quien: Agencia,
  metodo: 'GET' | 'POST',
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

async function crearAgencia(tenant: string, letra: string): Promise<Agencia> {
  await admin.tenant.create({
    data: { id: tenant, slug: `fixture-aislamiento-avisos-${tenant.slice(-12)}`, nombre: letra },
  });
  const rol = await admin.rol.create({
    data: {
      tenantId: tenant,
      nombre: 'Armador',
      permisos: ['cotizacion.escribir', 'crm.escribir'],
    },
  });
  const identidad = await admin.identidad.create({
    data: {
      correo: `fixture-aislamiento-avisos-${letra}-${randomBytes(3).toString('hex')}@fixture-identidad.test`,
      nombre: `Armador ${letra}`,
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
      nombre: `Paquete ${letra} avisos`,
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

/** Guarda, envía y acepta una cotización por la API y espera a que se abra su archivo. */
async function archivoNuevo(quien: Agencia): Promise<ResumenDeArchivo> {
  const alta = await armar(quien, 'POST', '/api/v1/cotizaciones', {
    contactoId: quien.contacto,
    titulo: 'Cotización de avisos',
    version: { paqueteId: quien.paquete, fecha: FECHA, adultos: 2 },
  });
  expect(alta.estado).toBe(201);
  const cotizacionId = (alta.json as CotizacionGuardada).id;
  for (const estado of ['ENVIADA', 'ACEPTADA']) {
    expect(
      (await armar(quien, 'POST', `/api/v1/cotizaciones/${cotizacionId}/estado`, { estado }))
        .estado,
    ).toBe(201);
  }
  for (let i = 0; i < 150; i++) {
    const { json } = await armar(quien, 'GET', '/api/v1/archivos?estado=TODOS');
    const hallado = ListaDeArchivos.parse(json).datos.find((a) => a.cotizacionId === cotizacionId);
    if (hallado) return hallado;
    await esperar(100);
  }
  throw new Error(`El archivo de la cotización ${cotizacionId} no se abrió a tiempo`);
}

/** Escribe un aviso de plazo en el outbox, como lo haría la vigilancia de `booking`. */
async function escribirAviso(
  tenant: string,
  tipoEvento: string,
  archivo: ResumenDeArchivo,
  payload?: object,
): Promise<bigint> {
  const reservaId = archivo.reservas[0]?.id ?? '';
  expect(reservaId).not.toBe('');
  const fila = await admin.outbox.create({
    data: {
      tenantId: tenant,
      agregado: 'reserva',
      agregadoId: reservaId,
      tipoEvento,
      versionEvento: 1,
      payload: payload ?? {
        v: 1,
        reservaId,
        archivoId: archivo.id,
        plazo: tipoEvento.includes('time_limit') ? 'TIME_LIMIT' : 'PAGO_TOTAL',
        venceEn: VENCE,
      },
    },
    select: { id: true },
  });
  return fila.id;
}

/** Despacha a mano lo pendiente de UNA agencia con el consumidor de ese tipo de evento. */
async function despachar(tenant: string, consumidor: string): Promise<number> {
  const c = registro.todos().find((x) => x.nombre === consumidor);
  if (!c) throw new Error(`Consumidor ${consumidor} no registrado`);
  return new DespachadorDeConsumidor(prisma, c).despacharTenant(tenant);
}

const notificacionesDe = (tenant: string, outboxId: bigint) =>
  comoAgencia<{ usuario_id: string; leida_en: Date | null; archivo_numero: number; tipo: string }>(
    tenant,
    `SELECT usuario_id, leida_en, archivo_numero, tipo::text AS tipo
       FROM notificaciones WHERE tenant_id = $1 AND outbox_id = $2 ORDER BY usuario_id`,
    [tenant, outboxId.toString()],
  );

const entregaDe = (tenant: string, outboxId: bigint, consumidor: string) =>
  comoAgencia<{
    entregado_en: Date | null;
    intentos: number;
    ultimo_error: string | null;
  }>(
    tenant,
    `SELECT entregado_en, intentos, ultimo_error FROM entregas_de_eventos
      WHERE tenant_id = $1 AND outbox_id = $2 AND consumidor = $3`,
    [tenant, outboxId.toString(), consumidor],
  );

let archivoA1: ResumenDeArchivo; // con oportunidad y asesor
let archivoA2: ResumenDeArchivo; // sin oportunidad
let archivoB1: ResumenDeArchivo;

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
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();
  registro = app.get(RegistroDeConsumidores);
  prisma = app.get(PrismaService);

  for (const p of ['asesorA', 'otroA', 'sinPermisoA', 'asesorB'] as const) await crearPersona(p);

  archivoA1 = await archivoNuevo(agencias.A);
  archivoA2 = await archivoNuevo(agencias.A);
  archivoB1 = await archivoNuevo(agencias.B);

  // El archivo A1 viene de una oportunidad cuyo asesor es `asesorA`.
  const etapa = await admin.etapaPipeline.create({
    data: { tenantId: TENANT_A, nombre: 'Nueva A', orden: 1, probabilidad: 10 },
  });
  const oportunidad = await admin.oportunidad.create({
    data: {
      tenantId: TENANT_A,
      contactoId: agencias.A.contacto,
      etapaId: etapa.id,
      titulo: 'Oportunidad de avisos',
      asesorId: usuarioDe.asesorA,
    },
  });
  await admin.travelFile.update({
    where: { id: archivoA1.id },
    data: { oportunidadId: oportunidad.id },
  });
}, 180_000);

afterAll(async () => {
  await app?.get(PlanificadorDeDespacho).detener();
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
        [...Object.values(agencias).map((a) => a.identidad), ...identidadesDePersonas],
      ]);
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('avisos de plazo como notificación en la aplicación (T-254)', () => {
  const CONSUMIDOR_TL_PROXIMO = 'notifications.aviso_time_limit_proximo';
  const CONSUMIDOR_PT_VENCIDO = 'notifications.aviso_pago_total_vencido';
  let porAsesor = 0n;
  let porOperadores = 0n;

  it('con asesor en la oportunidad: UNA notificación para él, y para nadie más; dos pasadas no duplican', async () => {
    porAsesor = await escribirAviso(TENANT_A, 'booking.time_limit_proximo', archivoA1);

    await despachar(TENANT_A, CONSUMIDOR_TL_PROXIMO);
    await despachar(TENANT_A, CONSUMIDOR_TL_PROXIMO);

    const filas = await notificacionesDe(TENANT_A, porAsesor);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      usuario_id: usuarioDe.asesorA,
      archivo_numero: archivoA1.numero,
      tipo: 'TIME_LIMIT_PROXIMO',
      leida_en: null,
    });
    const entregas = await entregaDe(TENANT_A, porAsesor, CONSUMIDOR_TL_PROXIMO);
    expect(entregas).toHaveLength(1);
    expect(entregas[0]?.entregado_en).not.toBeNull();

    const delAsesor = (await lista('asesorA')).datos.filter((n) => n.archivoId === archivoA1.id);
    expect(delAsesor).toHaveLength(1);
    expect(delAsesor[0]).toMatchObject({
      tipo: 'TIME_LIMIT_PROXIMO',
      archivoNumero: archivoA1.numero,
      venceEn: VENCE,
      leidaEn: null,
    });
    // Otro usuario que SÍ puede operar y uno que no: ninguno la ve.
    for (const quien of ['otroA', 'sinPermisoA'] as const) {
      expect((await lista(quien)).datos.filter((n) => n.archivoId === archivoA1.id)).toEqual([]);
    }
  });

  it('sin oportunidad: a todos los que pueden operar archivos, no a quien no puede', async () => {
    porOperadores = await escribirAviso(TENANT_A, 'booking.pago_total_vencido', archivoA2);
    await despachar(TENANT_A, CONSUMIDOR_PT_VENCIDO);

    const filas = await notificacionesDe(TENANT_A, porOperadores);
    expect(filas.map((f) => f.usuario_id).sort()).toEqual(
      [usuarioDe.asesorA, usuarioDe.otroA].sort(),
    );
    // Control positivo (lo ven) y negativo (el que no tiene permiso, no).
    for (const quien of ['asesorA', 'otroA'] as const) {
      const propias = (await lista(quien)).datos.filter((n) => n.archivoId === archivoA2.id);
      expect(propias).toHaveLength(1);
      expect(propias[0]?.tipo).toBe('PAGO_TOTAL_VENCIDO');
    }
    expect((await lista('sinPermisoA')).datos).toEqual([]);
  });

  it('reentregar (borrada la marca de entrega) no duplica: lo impide el UNIQUE por evento y destinatario', async () => {
    await admin.$executeRaw`DELETE FROM entregas_de_eventos WHERE tenant_id = ${TENANT_A}::uuid AND outbox_id = ${porOperadores}`;
    await despachar(TENANT_A, CONSUMIDOR_PT_VENCIDO);
    expect(await notificacionesDe(TENANT_A, porOperadores)).toHaveLength(2);
    const entregas = await entregaDe(TENANT_A, porOperadores, CONSUMIDOR_PT_VENCIDO);
    expect(entregas[0]?.entregado_en).not.toBeNull();
  });

  it('listar: no leídas primero y el contador cuenta solo las no leídas', async () => {
    const antes = await lista('asesorA');
    expect(antes.noLeidas).toBe(2);
    const primera = antes.datos[0];
    expect(primera).toBeDefined();

    const r = await como('asesorA', 'POST', `/api/v1/notificaciones/${primera?.id ?? ''}/lectura`);
    expect(r.estado).toBe(201);
    const marcada = Notificacion.parse(r.json);
    expect(marcada.leidaEn).not.toBeNull();

    const despues = await lista('asesorA');
    expect(despues.noLeidas).toBe(1);
    expect(despues.datos).toHaveLength(2);
    expect(despues.datos[0]?.leidaEn).toBeNull();
    expect(despues.datos[1]?.id).toBe(primera?.id);

    // Idempotente: marcar otra vez devuelve 201 con la MISMA hora.
    const otra = await como(
      'asesorA',
      'POST',
      `/api/v1/notificaciones/${primera?.id ?? ''}/lectura`,
    );
    expect(Notificacion.parse(otra.json).leidaEn).toBe(marcada.leidaEn);
  });

  it('AISLAMIENTO: B no ve las de A, no puede marcarlas (404) y la fila de A no cambia', async () => {
    const deA = (await lista('otroA')).datos.find((n) => n.archivoId === archivoA2.id);
    expect(deA).toBeDefined();
    const id = deA?.id ?? '';

    // B no la ve en su lista.
    expect((await lista('asesorB')).datos.map((n) => n.id)).not.toContain(id);

    const r = await como('asesorB', 'POST', `/api/v1/notificaciones/${id}/lectura`);
    expect(r.estado).toBe(404);
    expect((r.json as { error: { code: string } }).error.code).toBe('NOTIFICACION_NO_ENCONTRADA');

    const [fila] = await comoAgencia<{ leida_en: Date | null }>(
      TENANT_A,
      'SELECT leida_en FROM notificaciones WHERE tenant_id = $1 AND id = $2',
      [TENANT_A, id],
    );
    expect(fila?.leida_en).toBeNull();
  });

  it('otro usuario de la MISMA agencia no la ve ni puede marcarla (404)', async () => {
    const deAsesor = (await lista('asesorA')).datos.find((n) => n.archivoId === archivoA1.id);
    expect(deAsesor).toBeDefined();
    const id = deAsesor?.id ?? '';
    expect((await lista('otroA')).datos.map((n) => n.id)).not.toContain(id);

    const r = await como('otroA', 'POST', `/api/v1/notificaciones/${id}/lectura`);
    expect(r.estado).toBe(404);
    const [fila] = await comoAgencia<{ leida_en: Date | null }>(
      TENANT_A,
      'SELECT leida_en FROM notificaciones WHERE tenant_id = $1 AND id = $2',
      [TENANT_A, id],
    );
    expect(fila?.leida_en).toBeNull();

    // Control positivo: su dueño sí puede.
    expect((await como('asesorA', 'POST', `/api/v1/notificaciones/${id}/lectura`)).estado).toBe(
      201,
    );
  });

  it('el aviso de B llega a B y no a A (el despachador de A no entrega el evento de B)', async () => {
    const deB = await escribirAviso(TENANT_B, 'booking.time_limit_vencido', archivoB1);

    // El despachador de A no ve el evento de B.
    await despachar(TENANT_A, 'notifications.aviso_time_limit_vencido');
    expect(await entregaDe(TENANT_B, deB, 'notifications.aviso_time_limit_vencido')).toEqual([]);

    await despachar(TENANT_B, 'notifications.aviso_time_limit_vencido');
    const filas = await notificacionesDe(TENANT_B, deB);
    expect(filas.map((f) => f.usuario_id)).toEqual([usuarioDe.asesorB]);
    expect((await lista('asesorB')).datos.map((n) => n.archivoId)).toEqual([archivoB1.id]);
    for (const quien of ['asesorA', 'otroA'] as const) {
      expect((await lista(quien)).datos.map((n) => n.archivoId)).not.toContain(archivoB1.id);
    }
  });

  it('un evento con forma inválida no crea nada: reintenta y guarda solo el código del error', async () => {
    const malo = await escribirAviso(TENANT_A, 'booking.time_limit_vencido', archivoA1, {
      v: 1,
      reservaId: 'no-es-uuid',
    });
    await despachar(TENANT_A, 'notifications.aviso_time_limit_vencido');
    expect(await notificacionesDe(TENANT_A, malo)).toEqual([]);
    const [entrega] = await entregaDe(TENANT_A, malo, 'notifications.aviso_time_limit_vencido');
    expect(entrega?.entregado_en).toBeNull();
    expect(entrega?.intentos).toBe(1);
    expect(entrega?.ultimo_error).toBe('EVENTO_DE_AVISO_INVALIDO');
  });

  it('la ruta exige sesión: sin ella, no hay lista', async () => {
    const r = await fetch(new URL('/api/v1/notificaciones', base));
    expect([401, 403]).toContain(r.status);
  });
});
