/**
 * T-241 de punta a punta: aplicación ensamblada, HTTP real y PostgreSQL con RLS. Dos agencias.
 *
 * Aceptar una cotización escribe `quoting.cotizacion_aceptada` en el outbox (misma transacción); el
 * despachador del contenedor de la API la entrega al consumidor `booking.abrir_archivo`, que abre el
 * archivo de viaje con su número de file. Lo que afirma:
 *
 *   · por el aviso en memoria, sin que nadie llame al despachador, el archivo aparece;
 *   · el evento lleva solo identificadores (sin nombres ni importes);
 *   · tras DOS pasadas del despachador hay UN archivo, con su reserva «por definir» en PENDIENTE y
 *     lo vendido copiado, y una sola fila de entrega entregada;
 *   · reentregar (borrada la marca de entrega) no duplica el archivo: la segunda red es el
 *     `UNIQUE (tenant_id, cotizacion_id)`;
 *   · el número de file es consecutivo POR AGENCIA (cada una arranca en 1);
 *   · AISLAMIENTO: el despachador de A no entrega ni ve el evento de B; `tenants_con_eventos_por_
 *     entregar` devuelve a B (pendiente) y no a A (entregado); A no lee archivos de B por RLS;
 *   · un evento envenenado se reintenta, guarda solo el CÓDIGO del error y se abandona a los 10
 *     intentos sin impedir los eventos buenos.
 *
 * **Fixtures propios**, agencias `fixture-aislamiento-` purgadas al terminar. Las lecturas van con el
 * ROL de la API (`SET LOCAL ROLE viajapro_app`): el propietario no queda sujeto a RLS en Neon/CI y
 * una «lectura cruzada» devolvería filas de la otra agencia sin probar nada.
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
import { DespachadorDeConsumidor } from '../../shared/eventos/despachador-de-consumidor.js';
import { PlanificadorDeDespacho } from '../../shared/eventos/planificador-de-despacho.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../shared/tenant/contexto-tenant.js';
import { VersionAceptadaDeQuoting } from '../quoting/infrastructure/version-aceptada.prisma.js';
import { ConsumidorAbrirArchivo } from './interface/consumidor-abrir-archivo.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const FECHA = '2027-03-15';
const CONSUMIDOR = 'booking.abrir_archivo';
const TIPO = 'quoting.cotizacion_aceptada';

interface Agencia {
  tenant: string;
  usuario: string;
  identidad: string;
  contacto: string;
  paquete: string;
}

interface FilaDeArchivo {
  id: string;
  numero: number;
  contacto_id: string;
  cotizacion_id: string;
  version_cotizacion: number;
  paquete_nombre: string;
  destino: string;
  fecha_salida: string;
  noches: number;
  adultos: number;
  venta_unidades: string;
  moneda_iso: string;
  estado: string;
  trm_valor: string | null;
}

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;
let despachador: DespachadorDeConsumidor;
const agencias = {} as Record<'A' | 'B', Agencia>;

/** Lee como la agencia `tenant`, con el rol de la API y su contexto (ver el comentario del archivo). */
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

const archivosDe = (tenant: string, cotizacionId: string) =>
  comoAgencia<FilaDeArchivo>(
    tenant,
    `SELECT id, numero, contacto_id, cotizacion_id, version_cotizacion, paquete_nombre, destino,
            to_char(fecha_salida, 'YYYY-MM-DD') AS fecha_salida, noches, adultos,
            venta_unidades::text AS venta_unidades, moneda_iso, estado::text AS estado,
            trm_valor::text AS trm_valor
       FROM travel_files WHERE tenant_id = $1 AND cotizacion_id = $2`,
    [tenant, cotizacionId],
  );

const reservasDe = (tenant: string, archivoId: string) =>
  comoAgencia<{
    estado: string;
    mayorista_id: string | null;
    mayorista_nombre: string | null;
    neto_unidades: string | null;
    moneda_iso: string;
    time_limit: Date | null;
  }>(
    tenant,
    `SELECT estado::text AS estado, mayorista_id, mayorista_nombre,
            neto_unidades::text AS neto_unidades, moneda_iso, time_limit
       FROM bookings WHERE tenant_id = $1 AND travel_file_id = $2`,
    [tenant, archivoId],
  );

const entregasDe = (tenant: string, cotizacionId: string) =>
  comoAgencia<{
    entregado_en: Date | null;
    intentos: number;
    ultimo_error: string | null;
    abandonado_en: Date | null;
  }>(
    tenant,
    `SELECT e.entregado_en, e.intentos, e.ultimo_error, e.abandonado_en
       FROM entregas_de_eventos e
       JOIN outbox o ON o.id = e.outbox_id AND o.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1 AND o.agregado_id = $2 AND e.consumidor = $3`,
    [tenant, cotizacionId, CONSUMIDOR],
  );

const eventosDe = (tenant: string, cotizacionId: string) =>
  comoAgencia<{ id: string; tipo_evento: string; version_evento: number; payload: unknown }>(
    tenant,
    `SELECT id::text AS id, tipo_evento, version_evento, payload
       FROM outbox WHERE tenant_id = $1 AND agregado_id = $2 AND tipo_evento = $3`,
    [tenant, cotizacionId, TIPO],
  );

/** Lo que devuelve la función SECURITY DEFINER, llamada como la llama el despachador: rol de la API. */
async function agenciasConTrabajo(): Promise<string[]> {
  await adminPg.query('BEGIN');
  try {
    await adminPg.query('SET LOCAL ROLE "viajapro_app"');
    const { rows } = await adminPg.query(
      'SELECT f AS tenant_id FROM public.tenants_con_eventos_por_entregar($1::text, $2::text) AS f',
      [CONSUMIDOR, TIPO],
    );
    await adminPg.query('COMMIT');
    return rows.map((r: { tenant_id: string }) => r.tenant_id);
  } catch (error) {
    await adminPg.query('ROLLBACK');
    throw error;
  }
}

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
    data: { id: tenant, slug: `fixture-aislamiento-book-${tenant.slice(-12)}`, nombre: letra },
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
      correo: `fixture-aislamiento-book-${letra}-${randomBytes(3).toString('hex')}@fixture-identidad.test`,
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
      nombre: `Paquete ${letra} apertura`,
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

/** Guarda una cotización, la envía y la acepta por la API. Devuelve su id. */
async function aceptarCotizacion(quien: Agencia): Promise<string> {
  const alta = await pedir(quien, '/api/v1/cotizaciones', {
    contactoId: quien.contacto,
    titulo: 'Cotización de la apertura',
    version: { paqueteId: quien.paquete, fecha: FECHA, adultos: 2 },
  });
  expect(alta.estado).toBe(201);
  const id = (alta.json as CotizacionGuardada).id;
  expect(
    (await pedir(quien, `/api/v1/cotizaciones/${id}/estado`, { estado: 'ENVIADA' })).estado,
  ).toBe(201);
  expect(
    (await pedir(quien, `/api/v1/cotizaciones/${id}/estado`, { estado: 'ACEPTADA' })).estado,
  ).toBe(201);
  return id;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  despachador = new DespachadorDeConsumidor(
    app.get(PrismaService),
    app.get(ConsumidorAbrirArchivo, { strict: false }),
  );
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

describe('apertura del archivo de viaje al aceptar una cotización (T-241)', () => {
  let primeraDeA = '';
  let segundaDeA = '';

  it('por el aviso en memoria, sin llamar al despachador, el archivo aparece con su número de file', async () => {
    const A = agencias.A;
    primeraDeA = await aceptarCotizacion(A);

    let archivos = await archivosDe(A.tenant, primeraDeA);
    for (let i = 0; i < 100 && archivos.length === 0; i++) {
      await esperar(100);
      archivos = await archivosDe(A.tenant, primeraDeA);
    }
    expect(archivos).toHaveLength(1);
    expect(archivos[0]?.numero).toBe(1);

    // A partir de aquí el despacho es a mano, para controlar cuándo corre cada pasada.
    await app.get(PlanificadorDeDespacho).detener();
  }, 30_000);

  it('el evento del outbox lleva solo identificadores (v1, sin nombres ni importes)', async () => {
    const A = agencias.A;
    const eventos = await eventosDe(A.tenant, primeraDeA);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo_evento: TIPO, version_evento: 1 });
    const payload = eventos[0]?.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      [
        'aceptadaEn',
        'aceptadaPorUsuarioId',
        'contactoId',
        'cotizacionId',
        'oportunidadId',
        'v',
        'version',
      ].sort(),
    );
    expect(payload).toMatchObject({
      v: 1,
      cotizacionId: primeraDeA,
      version: 1,
      contactoId: A.contacto,
      aceptadaPorUsuarioId: A.usuario,
    });
  });

  it('dos pasadas del despachador dejan UN archivo, su reserva por definir y una sola entrega', async () => {
    const A = agencias.A;
    segundaDeA = await aceptarCotizacion(A);

    // Aceptada con el despachador detenido: el evento espera y la función lo ve.
    expect(await archivosDe(A.tenant, segundaDeA)).toEqual([]);
    expect(await agenciasConTrabajo()).toContain(A.tenant);

    await despachador.barrer();
    await despachador.barrer();

    const archivos = await archivosDe(A.tenant, segundaDeA);
    expect(archivos).toHaveLength(1);
    const archivo = archivos[0];
    expect(archivo).toMatchObject({
      numero: 2, // consecutivo por agencia
      contacto_id: A.contacto,
      cotizacion_id: segundaDeA,
      version_cotizacion: 1,
      paquete_nombre: 'Paquete A apertura',
      destino: 'San Andrés',
      fecha_salida: FECHA,
      noches: 3,
      adultos: 2,
      venta_unidades: '2400000',
      moneda_iso: 'COP',
      estado: 'ABIERTO',
      trm_valor: null,
    });

    // Una reserva «por definir» (las líneas aún no congelan mayorista), pendiente de pedir el cupo.
    const reservas = await reservasDe(A.tenant, archivo?.id ?? '');
    expect(reservas).toEqual([
      {
        estado: 'PENDIENTE',
        mayorista_id: null,
        mayorista_nombre: null,
        neto_unidades: '2000000',
        moneda_iso: 'COP',
        time_limit: null,
      },
    ]);

    const entregas = await entregasDe(A.tenant, segundaDeA);
    expect(entregas).toHaveLength(1);
    expect(entregas[0]?.entregado_en).not.toBeNull();
    expect(entregas[0]?.abandonado_en).toBeNull();
    expect(entregas[0]?.ultimo_error).toBeNull();

    // Y ya no hay nada pendiente para A.
    expect(await agenciasConTrabajo()).not.toContain(A.tenant);
  });

  it('reentregar sin la marca de entrega no duplica el archivo ni sus reservas', async () => {
    const A = agencias.A;
    await adminPg.query(
      `DELETE FROM entregas_de_eventos
        WHERE tenant_id = $1 AND consumidor = $2
          AND outbox_id IN (SELECT id FROM outbox WHERE tenant_id = $1 AND agregado_id = $3)`,
      [A.tenant, CONSUMIDOR, segundaDeA],
    );
    expect(await entregasDe(A.tenant, segundaDeA)).toEqual([]);

    expect(await despachador.despacharTenant(A.tenant)).toBe(1);

    const archivos = await archivosDe(A.tenant, segundaDeA);
    expect(archivos).toHaveLength(1);
    expect(archivos[0]?.numero).toBe(2);
    expect(await reservasDe(A.tenant, archivos[0]?.id ?? '')).toHaveLength(1);
    expect((await entregasDe(A.tenant, segundaDeA))[0]?.entregado_en).not.toBeNull();
  });
});

describe('aislamiento entre agencias del despachador', () => {
  it('el despachador de A no entrega ni ve el evento de B; el de B lo entrega con SU numeración', async () => {
    const A = agencias.A;
    const B = agencias.B;
    const cotizacionB = await aceptarCotizacion(B);

    // B tiene un evento pendiente y la función lo ve; A no tiene nada.
    expect(await agenciasConTrabajo()).toContain(B.tenant);

    // El despachador de A, con el contexto de A, no toca lo de B.
    expect(await despachador.despacharTenant(A.tenant)).toBe(0);
    expect(await archivosDe(B.tenant, cotizacionB)).toEqual([]);
    expect(await entregasDe(B.tenant, cotizacionB)).toEqual([]);

    // El de B lo entrega, y es el file 1 de B (la numeración es por agencia).
    expect(await despachador.despacharTenant(B.tenant)).toBe(1);
    const archivos = await archivosDe(B.tenant, cotizacionB);
    expect(archivos).toHaveLength(1);
    expect(archivos[0]).toMatchObject({ numero: 1, contacto_id: B.contacto });
    expect(await agenciasConTrabajo()).not.toContain(B.tenant);

    // Con el rol de la API, A no lee nada de B (ni archivos, ni reservas, ni entregas, ni eventos)
    // aunque lo pida por su tenant y por su id.
    expect(await archivosDe(A.tenant, cotizacionB)).toEqual([]);
    for (const tabla of ['travel_files', 'bookings', 'entregas_de_eventos', 'outbox']) {
      expect(
        await comoAgencia(A.tenant, `SELECT 1 FROM ${tabla} WHERE tenant_id = $1`, [B.tenant]),
      ).toEqual([]);
    }
    // Y B tiene lo suyo: sin esto, «A ve cero» sería verde con la tabla vacía.
    expect(
      await comoAgencia(B.tenant, 'SELECT 1 FROM travel_files WHERE tenant_id = $1', [B.tenant]),
    ).toHaveLength(1);
  });
});

describe('aislamiento: barrido con dos agencias y RLS del outbox', () => {
  it('un solo barrer() con eventos de A y de B deja cada archivo solo en su agencia, con numeración propia', async () => {
    const A = agencias.A;
    const B = agencias.B;
    const cotA = await aceptarCotizacion(A);
    const cotB = await aceptarCotizacion(B);

    await despachador.barrer();

    const deA = await archivosDe(A.tenant, cotA);
    const deB = await archivosDe(B.tenant, cotB);
    expect(deA).toHaveLength(1);
    expect(deB).toHaveLength(1);
    expect(deA[0]?.contacto_id).toBe(A.contacto);
    expect(deB[0]?.contacto_id).toBe(B.contacto);
    // Cada una sigue su propia numeración (A ya tenía 2 archivos; B, 1).
    expect(deA[0]?.numero).toBe(3);
    expect(deB[0]?.numero).toBe(2);
    // Ninguna ve el archivo de la otra.
    expect(await archivosDe(A.tenant, cotB)).toEqual([]);
    expect(await archivosDe(B.tenant, cotA)).toEqual([]);
  });

  it('RLS del outbox: A no lee eventos de B (lectura directa, sin depender del predicado del despachador)', async () => {
    const A = agencias.A;
    const B = agencias.B;
    expect(
      await comoAgencia(
        A.tenant,
        'SELECT 1 FROM outbox WHERE tenant_id = $1 AND tipo_evento = $2',
        [B.tenant, TIPO],
      ),
    ).toEqual([]);
  });

  it('control positivo: B sí tiene filas en travel_files, bookings, entregas_de_eventos y outbox', async () => {
    const B = agencias.B;
    for (const tabla of ['travel_files', 'bookings', 'entregas_de_eventos', 'outbox']) {
      const filas = await comoAgencia(B.tenant, `SELECT 1 FROM ${tabla} WHERE tenant_id = $1`, [
        B.tenant,
      ]);
      expect(filas.length, tabla).toBeGreaterThan(0);
    }
  });
});

describe('un evento envenenado', () => {
  it('guarda solo el código del error, se abandona a los 10 intentos y no frena a los buenos', async () => {
    const A = agencias.A;
    const veneno = '99999999-9999-4999-8999-999999999999';
    // Un evento de aceptación sobre una cotización que no existe: el consumidor no puede abrirlo.
    await adminPg.query(
      `INSERT INTO outbox (tenant_id, agregado, agregado_id, tipo_evento, version_evento, payload)
       VALUES ($1, 'cotizacion', $2, $3, 1, $4::jsonb)`,
      [
        A.tenant,
        veneno,
        TIPO,
        JSON.stringify({
          v: 1,
          cotizacionId: veneno,
          version: 1,
          contactoId: A.contacto,
          oportunidadId: null,
          aceptadaPorUsuarioId: null,
          aceptadaEn: '2026-11-17T10:00:00.000Z',
        }),
      ],
    );
    // Un evento bueno detrás del venenoso.
    const buena = await aceptarCotizacion(A);

    // Una pasada: el bueno se entrega aunque el venenoso falle.
    expect(await despachador.despacharTenant(A.tenant)).toBe(1);
    expect(await archivosDe(A.tenant, buena)).toHaveLength(1);
    let e = await entregasDe(A.tenant, veneno);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({
      intentos: 1,
      ultimo_error: 'VERSION_ACEPTADA_NO_ENCONTRADA',
      entregado_en: null,
      abandonado_en: null,
    });

    for (let i = 0; i < 9; i++) await despachador.despacharTenant(A.tenant);
    e = await entregasDe(A.tenant, veneno);
    expect(e[0]?.intentos).toBe(10);
    expect(e[0]?.abandonado_en).not.toBeNull();
    expect(e[0]?.entregado_en).toBeNull();

    // Abandonada: ya no se reintenta ni la ve la función.
    await despachador.despacharTenant(A.tenant);
    expect((await entregasDe(A.tenant, veneno))[0]?.intentos).toBe(10);
    expect(await agenciasConTrabajo()).not.toContain(A.tenant);
  }, 60_000);
});

describe('referencia cruzada entre agencias', () => {
  it('un evento en el outbox de A que apunta a la cotización de B no entrega nada ni toca archivos (prueba el predicado del despachador y RLS del puerto)', async () => {
    const A = agencias.A;
    const B = agencias.B;
    const cotB = await aceptarCotizacion(B);
    await despachador.despacharTenant(B.tenant);
    const antesB = await archivosDe(B.tenant, cotB);
    expect(antesB).toHaveLength(1);

    await adminPg.query(
      `INSERT INTO outbox (tenant_id, agregado, agregado_id, tipo_evento, version_evento, payload)
       VALUES ($1, 'cotizacion', $2, $3, 1, $4::jsonb)`,
      [
        A.tenant,
        cotB,
        TIPO,
        JSON.stringify({
          v: 1,
          cotizacionId: cotB,
          version: 1,
          contactoId: B.contacto,
          oportunidadId: null,
          aceptadaPorUsuarioId: null,
          aceptadaEn: '2026-11-17T10:00:00.000Z',
        }),
      ],
    );

    expect(await despachador.despacharTenant(A.tenant)).toBe(0);

    // Nada nuevo en A para esa cotización, y el archivo de B no cambió.
    expect(await archivosDe(A.tenant, cotB)).toEqual([]);
    expect(await archivosDe(B.tenant, cotB)).toEqual(antesB);
    const entregas = await entregasDe(A.tenant, cotB);
    expect(entregas).toHaveLength(1);
    expect(entregas[0]).toMatchObject({
      ultimo_error: 'VERSION_ACEPTADA_NO_ENCONTRADA',
      entregado_en: null,
    });
  });

  it('el puerto, dentro de la transacción de A y pidiendo con el tenant de B, responde null (RLS sola)', async () => {
    const A = agencias.A;
    const B = agencias.B;
    const cotB = await aceptarCotizacion(B);
    await despachador.despacharTenant(B.tenant);

    const respuesta = await ContextoTenant.ejecutarCon(
      { tenantId: A.tenant, usuarioId: null, identidadId: null, permisos: new Set(), trazaId: 't' },
      () =>
        app
          .get(PrismaService)
          .conTenant((tx) => new VersionAceptadaDeQuoting().leer(tx, B.tenant, cotB, 1)),
    );
    expect(respuesta).toBeNull();
  });
});

describe('mayorista por línea y TRM congelados por el cotizador (T-241, ADR-0024 §2)', () => {
  /**
   * Un paquete en USD con dos tarifas por persona de MAYORISTAS DISTINTOS (adulto y niño), para
   * que una cotización de 1 adulto + 1 niño tenga dos líneas con dos mayoristas.
   */
  async function paqueteConDosMayoristas(
    quien: Agencia,
    moneda: 'USD' | 'COP',
  ): Promise<{ paquete: string; m1: string; m2: string }> {
    const m1 = await admin.mayorista.create({
      data: { tenantId: quien.tenant, nombre: 'Mayorista Uno' },
    });
    const m2 = await admin.mayorista.create({
      data: { tenantId: quien.tenant, nombre: 'Mayorista Dos' },
    });
    const paquete = await admin.paquete.create({
      data: {
        tenantId: quien.tenant,
        nombre: `Paquete ${moneda} dos mayoristas`,
        destino: 'Miami',
        dias: 4,
        noches: 3,
        planAlimentacion: 'TODO_INCLUIDO',
      },
    });
    const vigencia = await admin.vigencia.create({
      data: {
        tenantId: quien.tenant,
        paqueteId: paquete.id,
        desde: new Date('2027-03-01'),
        hasta: new Date('2027-03-31'),
      },
    });
    await admin.tarifa.create({
      data: {
        tenantId: quien.tenant,
        vigenciaId: vigencia.id,
        nombre: 'Adulto',
        tipoPasajero: 'ADT',
        mayoristaId: m1.id,
        netoUnidades: 120_000n,
        ventaUnidades: 150_000n,
        monedaIso: moneda,
      },
    });
    await admin.tarifa.create({
      data: {
        tenantId: quien.tenant,
        vigenciaId: vigencia.id,
        nombre: 'Niño',
        tipoPasajero: 'CHD',
        mayoristaId: m2.id,
        netoUnidades: 80_000n,
        ventaUnidades: 100_000n,
        monedaIso: moneda,
      },
    });
    return { paquete: paquete.id, m1: m1.id, m2: m2.id };
  }

  const composicion = (paquete: string) => ({
    paqueteId: paquete,
    fecha: FECHA,
    adultos: 1,
    ninos: 1,
    edadesNinos: [8],
  });

  it('dos mayoristas y TRM: el archivo abre con DOS reservas y la TRM de la versión, y la API no expone el mayorista', async () => {
    const A = agencias.A;
    const { paquete, m1, m2 } = await paqueteConDosMayoristas(A, 'USD');

    const alta = await pedir(A, '/api/v1/cotizaciones', {
      contactoId: A.contacto,
      titulo: 'Dos mayoristas',
      version: {
        ...composicion(paquete),
        trm: { valor: '4150.5', fecha: '2027-03-01', fuente: 'OFICIAL' },
      },
    });
    expect(alta.estado).toBe(201);
    const guardada = alta.json as CotizacionGuardada;
    // La TRM sale en la lectura; el mayorista, no.
    expect(guardada.versiones[0]?.trm).toEqual({
      monedaOrigen: 'USD',
      monedaDestino: 'COP',
      valor: '4150.500000',
      fecha: '2027-03-01',
      fuente: 'OFICIAL',
    });
    expect(JSON.stringify(alta.json)).not.toContain(m1);
    expect(JSON.stringify(alta.json)).not.toContain(m2);

    // Congelado en la base, por línea.
    const lineas = await comoAgencia<{ mayoristas: string[] }>(
      A.tenant,
      `SELECT array_agg(l ->> 'mayoristaId' ORDER BY l ->> 'mayoristaId') AS mayoristas
         FROM versiones_cotizacion v, jsonb_array_elements(v.lineas) AS l
        WHERE v.tenant_id = $1 AND v.cotizacion_id = $2`,
      [A.tenant, guardada.id],
    );
    expect(lineas[0]?.mayoristas).toEqual([m1, m2].sort());

    for (const estado of ['ENVIADA', 'ACEPTADA']) {
      expect(
        (await pedir(A, `/api/v1/cotizaciones/${guardada.id}/estado`, { estado })).estado,
      ).toBe(201);
    }
    await despachador.despacharTenant(A.tenant);

    const archivos = await archivosDe(A.tenant, guardada.id);
    expect(archivos).toHaveLength(1);
    expect(archivos[0]).toMatchObject({
      moneda_iso: 'USD',
      venta_unidades: '250000',
      trm_valor: '4150.500000',
    });
    const trm = await comoAgencia<{ o: string; d: string; f: string; fuente: string }>(
      A.tenant,
      `SELECT trm_moneda_origen AS o, trm_moneda_destino AS d,
              to_char(trm_fecha, 'YYYY-MM-DD') AS f, trm_fuente::text AS fuente
         FROM travel_files WHERE tenant_id = $1 AND id = $2`,
      [A.tenant, archivos[0]?.id ?? ''],
    );
    expect(trm[0]).toEqual({ o: 'USD', d: 'COP', f: '2027-03-01', fuente: 'OFICIAL' });

    const reservas = (await reservasDe(A.tenant, archivos[0]?.id ?? '')).sort((a, b) =>
      (a.mayorista_nombre ?? '').localeCompare(b.mayorista_nombre ?? ''),
    );
    // Orden alfabético por nombre: «Dos» antes que «Uno».
    expect(reservas).toEqual([
      {
        estado: 'PENDIENTE',
        mayorista_id: m2,
        mayorista_nombre: 'Mayorista Dos',
        neto_unidades: '80000',
        moneda_iso: 'USD',
        time_limit: null,
      },
      {
        estado: 'PENDIENTE',
        mayorista_id: m1,
        mayorista_nombre: 'Mayorista Uno',
        neto_unidades: '120000',
        moneda_iso: 'USD',
        time_limit: null,
      },
    ]);
  });

  it('sin TRM declarada la versión queda sin TRM (no se inventa) y el archivo igual abre', async () => {
    const A = agencias.A;
    const { paquete } = await paqueteConDosMayoristas(A, 'USD');
    const alta = await pedir(A, '/api/v1/cotizaciones', {
      contactoId: A.contacto,
      titulo: 'Sin TRM',
      version: composicion(paquete),
    });
    expect(alta.estado).toBe(201);
    const id = (alta.json as CotizacionGuardada).id;
    expect((alta.json as CotizacionGuardada).versiones[0]?.trm).toBeNull();
    for (const estado of ['ENVIADA', 'ACEPTADA']) {
      await pedir(A, `/api/v1/cotizaciones/${id}/estado`, { estado });
    }
    await despachador.despacharTenant(A.tenant);
    const archivos = await archivosDe(A.tenant, id);
    expect(archivos).toHaveLength(1);
    expect(archivos[0]?.trm_valor).toBeNull();
    expect(await reservasDe(A.tenant, archivos[0]?.id ?? '')).toHaveLength(2);
  });

  it('una TRM en una versión ya en la moneda de la agencia se rechaza con un error tipado (422)', async () => {
    const A = agencias.A;
    const { paquete } = await paqueteConDosMayoristas(A, 'COP');
    const r = await pedir(A, '/api/v1/cotizaciones', {
      contactoId: A.contacto,
      titulo: 'TRM sobrante',
      version: {
        ...composicion(paquete),
        trm: { valor: '1', fecha: '2027-03-01', fuente: 'AGENCIA' },
      },
    });
    expect(r.estado).toBe(422);
    expect((r.json as { error: { code: string } }).error.code).toBe('TRM_INNECESARIA');
  });
});
