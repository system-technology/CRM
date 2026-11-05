/**
 * `GET /api/v1/reportes/resumen`, de punta a punta: aplicación ensamblada, HTTP real y PostgreSQL
 * con RLS. Dos agencias, y tres personas con sesión real:
 *
 *   · `duenoA`  — rol con `cotizacion.ver_neto_y_margen` en la agencia A.
 *   · `asesorA` — rol SIN ese permiso, en la misma agencia A.
 *   · `duenoB`  — rol con el permiso, en la agencia B.
 *
 * Lo que afirma:
 *   · las cifras de A salen de los datos de A y nada más: las de B (más caras, para que se note)
 *     no se cuelan, y a la inversa;
 *   · las ventas van por moneda, en enteros, y las cotizaciones aceptadas cuentan la versión
 *     enviada;
 *   · quien tiene el permiso recibe neto, margen y porcentaje; quien no lo tiene recibe una
 *     respuesta donde esas claves NO existen (se busca en el texto, no en claves conocidas);
 *   · un periodo sin datos devuelve ceros y razones `null`, no inventadas;
 *   · el rango se valida en el borde y sin sesión no hay respuesta.
 *
 * **Fixtures propios.** Las versiones son inmutables y solo la purga las borra, así que esta
 * prueba crea dos agencias `fixture-aislamiento-` y las borra al terminar. Las cotizaciones se
 * crean con el atajo de desarrollo (todos los permisos); las LECTURAS del reporte van con cookie
 * de sesión, que es la que lleva los permisos del rol.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import type { CotizacionGuardada, ResumenDeReportes } from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const DOMINIO = '@fixture-identidad.test';
const CLAVE = 'una-clave-larga-de-prueba-1';
const ORIGEN_WEB = 'http://localhost:3000';
const FECHA = '2027-03-15';

const correo = {
  duenoA: `fixture-aislamiento-rep-dueno-a-${randomBytes(3).toString('hex')}${DOMINIO}`,
  asesorA: `fixture-aislamiento-rep-asesor-a-${randomBytes(3).toString('hex')}${DOMINIO}`,
  duenoB: `fixture-aislamiento-rep-dueno-b-${randomBytes(3).toString('hex')}${DOMINIO}`,
};
type Quien = keyof typeof correo;
const identidadId: Record<Quien, string> = { duenoA: '', asesorA: '', duenoB: '' };

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
const cookies = {} as Record<Quien, string>;

/** El rango cubre «ahora»: todo lo que crea esta prueba cae dentro. */
const RANGO = {
  desde: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
  hasta: new Date(Date.now() + 24 * 3600_000).toISOString(),
};

const rnd = (): number => Math.floor(Math.random() * 250) + 1;

async function conDevHeader(
  metodo: 'GET' | 'POST',
  ruta: string,
  tenant: string,
  cuerpo?: unknown,
): Promise<{ estado: number; json: unknown }> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-dev-tenant-id': tenant },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  return { estado: r.status, json: await r.json() };
}

async function iniciarSesion(quien: Quien): Promise<string> {
  const r = await fetch(new URL('/api/v1/auth/sign-in/email', base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGEN_WEB,
      'x-forwarded-for': `10.${rnd()}.${rnd()}.${rnd()}`,
    },
    body: JSON.stringify({ correo: correo[quien], contrasena: CLAVE }),
  });
  if (r.status !== 200) throw new Error(`No inició sesión ${quien}: ${r.status}`);
  return r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

async function reporte(
  quien: Quien | null,
  query: Record<string, string> = RANGO,
): Promise<{ estado: number; texto: string; json: ResumenDeReportes }> {
  const r = await fetch(
    new URL(`/api/v1/reportes/resumen?${new URLSearchParams(query).toString()}`, base),
    {
      headers: quien ? { cookie: cookies[quien] } : {},
    },
  );
  const texto = await r.text();
  return { estado: r.status, texto, json: JSON.parse(texto) as ResumenDeReportes };
}

async function crearAgencia(tenant: string, sufijo: string, ventaUnidades: bigint) {
  await admin.tenant.create({
    data: {
      id: tenant,
      slug: `fixture-aislamiento-rep-${tenant.slice(-12)}`,
      nombre: `Agencia ${sufijo}`,
    },
  });
  const conPermiso = await admin.rol.create({
    data: {
      tenantId: tenant,
      nombre: 'Dueño',
      clave: 'DUENO',
      permisos: ['cotizacion.ver_neto_y_margen', 'cotizacion.escribir', 'crm.escribir'],
    },
  });
  const sinPermiso = await admin.rol.create({
    data: {
      tenantId: tenant,
      nombre: 'Asesor',
      clave: 'ASESOR',
      permisos: ['cotizacion.escribir', 'crm.escribir'],
    },
  });
  const contacto = await admin.contacto.create({
    data: {
      tenantId: tenant,
      telefonoE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
      nombre: `Viajero ${sufijo}`,
    },
  });
  const paquete = await admin.paquete.create({
    data: {
      tenantId: tenant,
      nombre: `Paquete ${sufijo} fixture`,
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
      netoUnidades: (ventaUnidades * 5n) / 6n,
      ventaUnidades,
      monedaIso: 'COP',
    },
  });
  return {
    conPermiso: conPermiso.id,
    sinPermiso: sinPermiso.id,
    contacto: contacto.id,
    paquete: paquete.id,
  };
}

async function persona(quien: Quien, tenantId: string, rolId: string): Promise<void> {
  const i = await admin.identidad.create({
    data: { correo: correo[quien], nombre: quien, correoVerificado: true },
  });
  await admin.credencial.create({
    data: {
      identidadId: i.id,
      proveedor: 'credential',
      hashContrasena: await hashPassword(CLAVE),
    },
  });
  identidadId[quien] = i.id;
  await admin.usuario.create({
    data: { tenantId, identidadId: i.id, rolId, correo: correo[quien], nombre: quien },
  });
}

/** Cotiza `adultos`, la guarda, y la lleva hasta `hasta` por las transiciones válidas. */
async function cotizar(
  tenant: string,
  datos: { contacto: string; paquete: string },
  adultos: number,
  hasta: 'BORRADOR' | 'ENVIADA' | 'ACEPTADA',
): Promise<CotizacionGuardada> {
  const g = await conDevHeader('POST', '/api/v1/cotizaciones', tenant, {
    contactoId: datos.contacto,
    titulo: `Cotización fixture ${adultos}`,
    version: { paqueteId: datos.paquete, fecha: FECHA, adultos },
  });
  expect(g.estado).toBe(201);
  let cot = g.json as CotizacionGuardada;
  for (const estado of hasta === 'ACEPTADA'
    ? ['ENVIADA', 'ACEPTADA']
    : hasta === 'ENVIADA'
      ? ['ENVIADA']
      : []) {
    const t = await conDevHeader('POST', `/api/v1/cotizaciones/${cot.id}/estado`, tenant, {
      estado,
    });
    expect(t.estado).toBe(201);
    cot = t.json as CotizacionGuardada;
  }
  return cot;
}

let aceptadaA: CotizacionGuardada;

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  // B vende más caro por adulto: si sus cifras se colaran en A, los totales no cuadrarían.
  const a = await crearAgencia(TENANT_A, 'A', 1_200_000n);
  const b = await crearAgencia(TENANT_B, 'B', 2_100_000n);
  await persona('duenoA', TENANT_A, a.conPermiso);
  await persona('asesorA', TENANT_A, a.sinPermiso);
  await persona('duenoB', TENANT_B, b.conPermiso);

  // Oportunidades: A tiene 2 abiertas, 1 ganada y 1 perdida; B una abierta.
  const etapasA = {
    nueva: await admin.etapaPipeline.create({
      data: { tenantId: TENANT_A, nombre: 'Nueva A', orden: 1, probabilidad: 10 },
    }),
    ganada: await admin.etapaPipeline.create({
      data: { tenantId: TENANT_A, nombre: 'Ganada A', orden: 2, probabilidad: 100, esGanada: true },
    }),
    perdida: await admin.etapaPipeline.create({
      data: { tenantId: TENANT_A, nombre: 'Perdida A', orden: 3, probabilidad: 0, esPerdida: true },
    }),
  };
  const etapaB = await admin.etapaPipeline.create({
    data: { tenantId: TENANT_B, nombre: 'Nueva B', orden: 1, probabilidad: 10 },
  });
  const oportunidad = (tenantId: string, contactoId: string, etapaId: string) =>
    admin.oportunidad.create({
      data: { tenantId, contactoId, etapaId, titulo: 'Oportunidad fixture' },
    });
  await oportunidad(TENANT_A, a.contacto, etapasA.nueva.id);
  await oportunidad(TENANT_A, a.contacto, etapasA.nueva.id);
  await oportunidad(TENANT_A, a.contacto, etapasA.ganada.id);
  await oportunidad(TENANT_A, a.contacto, etapasA.perdida.id);
  await oportunidad(TENANT_B, b.contacto, etapaB.id);

  // Una conversación de A: el viajero escribió hace una hora y se le respondió 10 minutos después.
  const hace1h = new Date(Date.now() - 3600_000);
  const cuenta = await admin.cuentaWhatsapp.create({
    data: {
      tenantId: TENANT_A,
      wabaId: `waba-rep-${randomBytes(4).toString('hex')}`,
      nombre: 'WABA',
    },
  });
  const canal = await admin.canal.create({
    data: {
      tenantId: TENANT_A,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: `+57301${Math.floor(Math.random() * 9e6 + 1e6)}`,
    },
  });
  const conversacion = await admin.conversacion.create({
    data: {
      tenantId: TENANT_A,
      canalId: canal.id,
      contactoId: a.contacto,
      ultimoMensajeClienteEn: hace1h,
      primeraRespuestaEn: new Date(hace1h.getTime() + 10 * 60_000),
    },
  });
  await admin.mensaje.create({
    data: {
      tenantId: TENANT_A,
      conversacionId: conversacion.id,
      direccion: 'ENTRANTE',
      tipo: 'TEXTO',
      estado: 'ENTREGADO',
      texto: 'Hola, quiero cotizar',
      wamid: `wamid.rep.${randomBytes(6).toString('hex')}`,
      ocurridoEn: hace1h,
    },
  });

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();

  // Cotizaciones: A tiene 1 aceptada (2 adultos), 1 enviada y 1 borrador; B tiene 1 aceptada.
  aceptadaA = await cotizar(TENANT_A, a, 2, 'ACEPTADA');
  await cotizar(TENANT_A, a, 1, 'ENVIADA');
  await cotizar(TENANT_A, a, 1, 'BORRADOR');
  await cotizar(TENANT_B, b, 1, 'ACEPTADA');

  for (const quien of Object.keys(correo) as Quien[]) cookies[quien] = await iniciarSesion(quien);
});

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
        Object.values(identidadId).filter((id) => id !== ''),
      ]);
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('GET /api/v1/reportes/resumen', () => {
  it('quien tiene el permiso recibe las cifras de SU agencia, con neto y margen', async () => {
    const r = await reporte('duenoA');
    expect(r.estado).toBe(200);

    expect(r.json.cotizaciones).toEqual({
      creadas: 3,
      enviadas: 2,
      aceptadas: 1,
      tasaAceptacion: 50,
    });

    // Lo esperado del neto y el margen sale de la propia cotización, leída con el permiso.
    const leida = await conDevHeader(
      'GET',
      `/api/v1/cotizaciones/${aceptadaA.id}?incluirMargen=true`,
      TENANT_A,
    );
    const v1 = (leida.json as CotizacionGuardada).versiones[0]!;
    expect(v1.venta).toEqual({ unidades: '2400000', moneda: 'COP' });

    expect(r.json.ventasPorMoneda).toHaveLength(1);
    const cop = r.json.ventasPorMoneda[0]!;
    expect(cop).toMatchObject({
      moneda: 'COP',
      cotizacionesAceptadas: 1,
      ventas: { unidades: '2400000', moneda: 'COP' },
      neto: v1.neto,
      margen: v1.margen,
      cotizacionesSinNeto: 0,
    });
    expect(cop.margenPorcentaje).toBeGreaterThan(0);

    expect(r.json.oportunidades).toMatchObject({
      creadas: 4,
      ganadas: 1,
      perdidas: 1,
      abiertas: 2,
      tasaConversion: 50,
    });
    expect(r.json.oportunidades.porEtapa.map((e) => [e.nombre, e.cantidad])).toEqual([
      ['Nueva A', 2],
      ['Ganada A', 1],
      ['Perdida A', 1],
    ]);

    expect(r.json.respuesta).toEqual({
      conversacionesNuevas: 1,
      conversacionesRespondidas: 1,
      promedioMinutos: 10,
      medianaMinutos: 10,
    });
  });

  it('quien NO tiene el permiso recibe lo mismo, sin neto ni margen: las claves no existen', async () => {
    const con = await reporte('duenoA');
    const sin = await reporte('asesorA');
    expect(sin.estado).toBe(200);

    expect(sin.texto).not.toMatch(/neto|margen/i);
    expect(sin.json.ventasPorMoneda).toEqual([
      { moneda: 'COP', cotizacionesAceptadas: 1, ventas: { unidades: '2400000', moneda: 'COP' } },
    ]);
    // Todo lo demás coincide con lo que ve el dueño.
    expect(sin.json.cotizaciones).toEqual(con.json.cotizaciones);
    expect(sin.json.oportunidades).toEqual(con.json.oportunidades);
    expect(sin.json.respuesta).toEqual(con.json.respuesta);
  });

  it('otra agencia ve solo lo suyo: no mezcla cifras ni etapas de A', async () => {
    // B no ve nada de A: sus propias cifras, con su propia venta por adulto.
    const r = await reporte('duenoB');
    expect(r.estado).toBe(200);
    expect(r.json.cotizaciones).toEqual({
      creadas: 1,
      enviadas: 1,
      aceptadas: 1,
      tasaAceptacion: 100,
    });
    expect(r.json.ventasPorMoneda).toHaveLength(1);
    expect(r.json.ventasPorMoneda[0]?.ventas).toEqual({ unidades: '2100000', moneda: 'COP' });
    expect(r.json.oportunidades).toMatchObject({
      creadas: 1,
      ganadas: 0,
      perdidas: 0,
      abiertas: 1,
    });
    expect(r.json.oportunidades.porEtapa.map((e) => e.nombre)).toEqual(['Nueva B']);
    expect(r.json.oportunidades.tasaConversion).toBeNull();
    expect(r.json.respuesta).toEqual({
      conversacionesNuevas: 0,
      conversacionesRespondidas: 0,
      promedioMinutos: null,
      medianaMinutos: null,
    });
    // Nada de A en el texto: ni su etapa ni su venta.
    expect(r.texto).not.toContain('2400000');
    expect(r.texto).not.toContain('Nueva A');
  });

  it('un periodo sin datos devuelve ceros y razones null, no cifras inventadas', async () => {
    const r = await reporte('duenoA', {
      desde: new Date(Date.now() - 300 * 24 * 3600_000).toISOString(),
      hasta: new Date(Date.now() - 200 * 24 * 3600_000).toISOString(),
    });
    expect(r.estado).toBe(200);
    expect(r.json.cotizaciones).toEqual({
      creadas: 0,
      enviadas: 0,
      aceptadas: 0,
      tasaAceptacion: null,
    });
    expect(r.json.ventasPorMoneda).toEqual([]);
    expect(r.json.oportunidades.creadas).toBe(0);
    expect(r.json.oportunidades.tasaConversion).toBeNull();
    expect(r.json.respuesta.promedioMinutos).toBeNull();
  });

  it('valida el rango en el borde (400) y exige sesión (401)', async () => {
    const invertido = await reporte('duenoA', { desde: RANGO.hasta, hasta: RANGO.desde });
    expect(invertido.estado).toBe(400);
    const sinHora = await reporte('duenoA', { desde: '2026-10-01', hasta: '2026-11-01' });
    expect(sinHora.estado).toBe(400);
    const demasiado = await reporte('duenoA', {
      desde: '2020-01-01T00:00:00.000Z',
      hasta: '2026-01-01T00:00:00.000Z',
    });
    expect(demasiado.estado).toBe(400);

    const anonimo = await reporte(null);
    expect(anonimo.estado).toBe(401);
  });
});
