/**
 * `GET /api/v1/reportes/resumen`, de punta a punta: aplicación ensamblada, HTTP real y PostgreSQL
 * con RLS. **Dos agencias y dos asesores en la misma agencia** (T-342, ADR-0035 §9):
 *
 *   · `duenoA`       — `reportes.ver_agencia` + `cotizacion.ver_neto_y_margen` (agencia A).
 *   · `operacionesA` — `reportes.ver_agencia` SIN el margen, en la misma agencia A.
 *   · `valentinaA`   — asesora: ni `reportes.ver_agencia` ni margen.
 *   · `betoA`        — asesor CON el permiso de margen pero SIN `reportes.ver_agencia`: los dos
 *     ejes son independientes (§6), el margen que ve es el de sus propias cotizaciones.
 *   · `duenoB`       — los mismos permisos, en la agencia B.
 *
 * Lo que afirma:
 *   · un asesor ve LO SUYO y nada del compañero: ni sus ventas, ni su embudo, ni sus tiempos, ni
 *     el total de la agencia (del que se deduciría lo ajeno);
 *   · el servidor IMPONE el asesor de la sesión: `?asesorId=` propio o `yo` no cambia nada, y el
 *     de otro responde 403 —idéntico con un id inexistente o de otra agencia, no es un oráculo—;
 *   · quien tiene `reportes.ver_agencia` ve la suma de los dos y puede filtrar por asesor;
 *   · el margen sigue protegido por SU permiso en los dos alcances, y sin él las claves no
 *     existen (se busca en el texto crudo, no en claves conocidas);
 *   · las cifras de A salen de los datos de A y nada más: las de B (más caras, para que se note)
 *     no se cuelan, y un `asesorId` de la otra agencia no trae nada;
 *   · un periodo sin datos devuelve ceros y razones `null`, y el rango se valida en el borde.
 *
 * **Fixtures propios.** Las versiones son inmutables y solo la purga las borra, así que esta
 * prueba crea dos agencias `fixture-aislamiento-` y las borra al terminar. Las cotizaciones se
 * crean con el atajo de desarrollo, con la cabecera `x-dev-usuario-id` del asesor que cotiza
 * (de ahí sale `cotizaciones.creado_por`, la atribución de §2); las LECTURAS del reporte van con
 * cookie de sesión, que es la que lleva los permisos del rol.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import { CotizacionGuardada, ResumenDeReportesPorAlcance } from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { mensajeConTexto } from '../../shared/cifrado/cifrado-de-prueba.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const DOMINIO = '@fixture-identidad.test';
const CLAVE = 'una-clave-larga-de-prueba-1';
const ORIGEN_WEB = 'http://localhost:3000';
const FECHA = '2027-03-15';
/** Un id con forma válida que no es de nadie: el 403 debe ser el mismo que con uno real. */
const INEXISTENTE = '01932000-0000-7000-8000-0000000fffff';

const correo = {
  duenoA: `fixture-aislamiento-rep-dueno-a-${randomBytes(3).toString('hex')}${DOMINIO}`,
  valentinaA: `fixture-aislamiento-rep-vale-a-${randomBytes(3).toString('hex')}${DOMINIO}`,
  betoA: `fixture-aislamiento-rep-beto-a-${randomBytes(3).toString('hex')}${DOMINIO}`,
  operacionesA: `fixture-aislamiento-rep-oper-a-${randomBytes(3).toString('hex')}${DOMINIO}`,
  duenoB: `fixture-aislamiento-rep-dueno-b-${randomBytes(3).toString('hex')}${DOMINIO}`,
};
type Quien = keyof typeof correo;
const QUIENES = Object.keys(correo) as Quien[];
const identidadId = {} as Record<Quien, string>;
/** El id del USUARIO en su agencia: el que atribuye cotizaciones, oportunidades y mensajes. */
const usuarioId = {} as Record<Quien, string>;

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
  comoUsuario?: string,
): Promise<{ estado: number; json: unknown }> {
  const r = await fetch(new URL(ruta, base), {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'x-dev-tenant-id': tenant,
      ...(comoUsuario === undefined ? {} : { 'x-dev-usuario-id': comoUsuario }),
    },
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
): Promise<{ estado: number; texto: string; json: ResumenDeReportesPorAlcance }> {
  const r = await fetch(
    new URL(`/api/v1/reportes/resumen?${new URLSearchParams(query).toString()}`, base),
    { headers: quien ? { cookie: cookies[quien] } : {} },
  );
  const texto = await r.text();
  const json: unknown = JSON.parse(texto);
  // T-195: todo 200 cumple el contrato que consume la web. Se valida y se devuelve el cuerpo
  // CRUDO: `parse` descarta claves desconocidas, y las pruebas de fuga necesitan verlas.
  if (r.status === 200) ResumenDeReportesPorAlcance.parse(json);
  return { estado: r.status, texto, json: json as ResumenDeReportesPorAlcance };
}

const codigo = (json: unknown): string => (json as { error: { code: string } }).error.code;

async function crearAgencia(tenant: string, sufijo: string, ventaUnidades: bigint) {
  await admin.tenant.create({
    data: {
      id: tenant,
      slug: `fixture-aislamiento-rep-${tenant.slice(-12)}`,
      nombre: `Agencia ${sufijo}`,
    },
  });
  const rol = (nombre: string, permisos: string[], clave?: string) =>
    admin.rol.create({
      data: { tenantId: tenant, nombre, permisos, ...(clave ? { clave } : {}) },
    });
  // Dueña: ve la agencia y el dinero. Operaciones: ve la agencia, no el dinero. Asesor: ni lo uno
  // ni lo otro. Asesor con margen: el dinero de LO SUYO, que es el caso de §6 del ADR.
  const deAgenciaConMargen = await rol(
    'Dueño',
    [
      'conversaciones.ver_todas',
      'cotizacion.ver_neto_y_margen',
      'cotizacion.escribir',
      'crm.escribir',
      'reportes.ver_agencia',
    ],
    'DUENO',
  );
  const deAgenciaSinMargen = await rol('Operaciones', [
    'conversaciones.ver_todas',
    'cotizacion.escribir',
    'crm.escribir',
    'reportes.ver_agencia',
  ]);
  const asesor = await rol('Asesor', ['cotizacion.escribir', 'crm.escribir'], 'ASESOR');
  const asesorConMargen = await rol('Asesor con margen', [
    'cotizacion.escribir',
    'crm.escribir',
    'cotizacion.ver_neto_y_margen',
  ]);
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
    deAgenciaConMargen: deAgenciaConMargen.id,
    deAgenciaSinMargen: deAgenciaSinMargen.id,
    asesor: asesor.id,
    asesorConMargen: asesorConMargen.id,
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
  const u = await admin.usuario.create({
    data: { tenantId, identidadId: i.id, rolId, correo: correo[quien], nombre: quien },
  });
  usuarioId[quien] = u.id;
}

/** Cotiza `adultos` COMO `quien`, y la lleva hasta `hasta` por las transiciones válidas. */
async function cotizar(
  tenant: string,
  datos: { contacto: string; paquete: string },
  quien: Quien,
  adultos: number,
  hasta: 'BORRADOR' | 'ENVIADA' | 'ACEPTADA',
): Promise<CotizacionGuardada> {
  const autor = usuarioId[quien];
  const g = await conDevHeader(
    'POST',
    '/api/v1/cotizaciones',
    tenant,
    {
      contactoId: datos.contacto,
      titulo: `Cotización fixture ${quien} ${adultos}`,
      version: { paqueteId: datos.paquete, fecha: FECHA, adultos },
    },
    autor,
  );
  expect(g.estado).toBe(201);
  let cot = CotizacionGuardada.parse(g.json);
  for (const estado of hasta === 'ACEPTADA'
    ? ['ENVIADA', 'ACEPTADA']
    : hasta === 'ENVIADA'
      ? ['ENVIADA']
      : []) {
    const t = await conDevHeader(
      'POST',
      `/api/v1/cotizaciones/${cot.id}/estado`,
      tenant,
      { estado },
      autor,
    );
    expect(t.estado).toBe(201);
    cot = CotizacionGuardada.parse(t.json);
  }
  return cot;
}

let aceptadaDeValentina: CotizacionGuardada;
let aceptadaDeBeto: CotizacionGuardada;

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  // B vende más caro por adulto: si sus cifras se colaran en A, los totales no cuadrarían.
  const a = await crearAgencia(TENANT_A, 'A', 1_200_000n);
  const b = await crearAgencia(TENANT_B, 'B', 2_100_000n);
  await persona('duenoA', TENANT_A, a.deAgenciaConMargen);
  await persona('operacionesA', TENANT_A, a.deAgenciaSinMargen);
  await persona('valentinaA', TENANT_A, a.asesor);
  await persona('betoA', TENANT_A, a.asesorConMargen);
  await persona('duenoB', TENANT_B, b.deAgenciaConMargen);

  // Oportunidades, con asesor: Valentina 2 abiertas y 1 ganada; Beto 1 perdida; B una abierta.
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
  const oportunidad = (
    tenantId: string,
    contactoId: string,
    etapaId: string,
    asesorId: string | null,
  ) =>
    admin.oportunidad.create({
      data: { tenantId, contactoId, etapaId, titulo: 'Oportunidad fixture', asesorId },
    });
  await oportunidad(TENANT_A, a.contacto, etapasA.nueva.id, usuarioId.valentinaA);
  await oportunidad(TENANT_A, a.contacto, etapasA.nueva.id, usuarioId.valentinaA);
  await oportunidad(TENANT_A, a.contacto, etapasA.ganada.id, usuarioId.valentinaA);
  await oportunidad(TENANT_A, a.contacto, etapasA.perdida.id, usuarioId.betoA);
  await oportunidad(TENANT_B, b.contacto, etapaB.id, usuarioId.duenoB);

  // Tres conversaciones en A. El viajero escribió hace una hora; Valentina respondió a los 10
  // minutos, Beto a los 20, y una queda sin responder asignada a Valentina.
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
  // Una conversación por contacto: son únicas por (tenant, canal, contacto).
  const conversacionDe = async (asignadoAId: string, minutos: number | null) => {
    const viajero = await admin.contacto.create({
      data: {
        tenantId: TENANT_A,
        telefonoE164: `+57302${Math.floor(Math.random() * 9e6 + 1e6)}`,
        nombre: `Viajero conversación ${randomBytes(2).toString('hex')}`,
      },
    });
    const conv = await admin.conversacion.create({
      data: {
        tenantId: TENANT_A,
        canalId: canal.id,
        contactoId: viajero.id,
        asignadoAId,
        ultimoMensajeClienteEn: hace1h,
        ...(minutos === null
          ? {}
          : { primeraRespuestaEn: new Date(hace1h.getTime() + minutos * 60_000) }),
      },
    });
    await admin.mensaje.create({
      data: {
        tenantId: TENANT_A,
        conversacionId: conv.id,
        direccion: 'ENTRANTE',
        tipo: 'TEXTO',
        estado: 'ENTREGADO',
        ...mensajeConTexto(TENANT_A, 'Hola, quiero cotizar'),
        wamid: `wamid.rep.${randomBytes(6).toString('hex')}`,
        ocurridoEn: hace1h,
      },
    });
    if (minutos !== null) {
      // El saliente HUMANO con autor: es la atribución de M9 (ADR-0035 §2).
      await admin.mensaje.create({
        data: {
          tenantId: TENANT_A,
          conversacionId: conv.id,
          direccion: 'SALIENTE',
          tipo: 'TEXTO',
          estado: 'ENTREGADO',
          autorId: asignadoAId,
          ...mensajeConTexto(TENANT_A, 'Con gusto, te cuento'),
          wamid: `wamid.rep.${randomBytes(6).toString('hex')}`,
          ocurridoEn: new Date(hace1h.getTime() + minutos * 60_000),
        },
      });
    }
    return conv;
  };
  await conversacionDe(usuarioId.valentinaA, 10);
  await conversacionDe(usuarioId.betoA, 20);
  await conversacionDe(usuarioId.valentinaA, null);

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  (app as NestExpressApplication).set('trust proxy', 1);
  await app.listen(0);
  base = await app.getUrl();

  // Cotizaciones: Valentina 1 aceptada (2 adultos), 1 enviada y 1 borrador; Beto 1 aceptada
  // (1 adulto); B 1 aceptada.
  aceptadaDeValentina = await cotizar(TENANT_A, a, 'valentinaA', 2, 'ACEPTADA');
  await cotizar(TENANT_A, a, 'valentinaA', 1, 'ENVIADA');
  await cotizar(TENANT_A, a, 'valentinaA', 1, 'BORRADOR');
  aceptadaDeBeto = await cotizar(TENANT_A, a, 'betoA', 1, 'ACEPTADA');
  await cotizar(TENANT_B, b, 'duenoB', 1, 'ACEPTADA');

  for (const quien of QUIENES) cookies[quien] = await iniciarSesion(quien);
});

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
        Object.values(identidadId).filter((id) => id !== ''),
      ]);
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('alcance de agencia', () => {
  it('con reportes.ver_agencia: la suma de los dos asesores, con neto y margen', async () => {
    const r = await reporte('duenoA');
    expect(r.estado).toBe(200);
    expect(r.json.alcance).toBe('AGENCIA');
    expect(r.json.asesorId).toBeNull();

    expect(r.json.cotizaciones).toEqual({
      creadas: 4,
      enviadas: 3,
      aceptadas: 2,
      tasaAceptacion: 66.7,
    });

    // Lo esperado del neto y el margen sale de las propias cotizaciones, leídas con el permiso.
    const sumaEsperada = 2_400_000n + 1_200_000n;
    expect(r.json.ventasPorMoneda).toHaveLength(1);
    const cop = r.json.ventasPorMoneda[0]!;
    expect(cop).toMatchObject({
      moneda: 'COP',
      cotizacionesAceptadas: 2,
      ventas: { unidades: sumaEsperada.toString(), moneda: 'COP' },
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
      conversacionesNuevas: 3,
      conversacionesRespondidas: 2,
      promedioMinutos: 15,
      medianaMinutos: 15,
      p90Minutos: 19,
      sinResponder: 1,
      tasaRespuesta: 66.7,
    });
  });

  it('puede filtrar por un asesor sin dejar de ser alcance de agencia', async () => {
    const r = await reporte('duenoA', { ...RANGO, asesorId: usuarioId.betoA });
    expect(r.estado).toBe(200);
    expect(r.json.alcance).toBe('AGENCIA');
    expect(r.json.asesorId).toBe(usuarioId.betoA);
    expect(r.json.cotizaciones).toEqual({
      creadas: 1,
      enviadas: 1,
      aceptadas: 1,
      tasaAceptacion: 100,
    });
    expect(r.json.ventasPorMoneda[0]?.ventas).toEqual({ unidades: '1200000', moneda: 'COP' });
    expect(r.json.oportunidades).toMatchObject({ creadas: 1, ganadas: 0, perdidas: 1 });
    expect(r.json.respuesta.conversacionesNuevas).toBe(1);
    expect(r.json.respuesta.promedioMinutos).toBe(20);
    // Nada de Valentina: ni su venta ni sus dos oportunidades abiertas.
    expect(r.texto).not.toContain('2400000');
    expect(r.texto).not.toContain('3600000');
  });

  it('quien NO tiene el permiso de margen ve las mismas filas sin neto ni margen', async () => {
    const con = await reporte('duenoA');
    const sin = await reporte('operacionesA');
    expect(sin.estado).toBe(200);
    expect(sin.json.alcance).toBe('AGENCIA');

    expect(sin.texto).not.toMatch(/neto|margen/i);
    expect(sin.json.ventasPorMoneda).toEqual([
      { moneda: 'COP', cotizacionesAceptadas: 2, ventas: { unidades: '3600000', moneda: 'COP' } },
    ]);
    expect(sin.json.cotizaciones).toEqual(con.json.cotizaciones);
    expect(sin.json.oportunidades).toEqual(con.json.oportunidades);
    expect(sin.json.respuesta).toEqual(con.json.respuesta);
  });
});

describe('alcance propio: un asesor no ve lo del otro (T-342)', () => {
  it('sin reportes.ver_agencia la respuesta es PROPIA y trae solo sus cifras', async () => {
    const r = await reporte('valentinaA');
    expect(r.estado).toBe(200);
    expect(r.json.alcance).toBe('PROPIO');
    expect(r.json.asesorId).toBe(usuarioId.valentinaA);

    expect(r.json.cotizaciones).toEqual({
      creadas: 3,
      enviadas: 2,
      aceptadas: 1,
      tasaAceptacion: 50,
    });
    expect(r.json.ventasPorMoneda).toEqual([
      { moneda: 'COP', cotizacionesAceptadas: 1, ventas: { unidades: '2400000', moneda: 'COP' } },
    ]);
    expect(r.json.oportunidades).toMatchObject({
      creadas: 3,
      ganadas: 1,
      perdidas: 0,
      abiertas: 2,
      tasaConversion: 100,
    });
    expect(r.json.respuesta).toEqual({
      conversacionesNuevas: 2,
      conversacionesRespondidas: 1,
      promedioMinutos: 10,
      medianaMinutos: 10,
      p90Minutos: 10,
      sinResponder: 1,
      tasaRespuesta: 50,
    });
  });

  it('no se cuela lo de Beto ni el total de la agencia, del que se deduciría', async () => {
    const r = await reporte('valentinaA');
    // La venta de Beto, el total de la agencia y su margen no aparecen en ninguna forma.
    expect(r.texto).not.toContain('1200000');
    expect(r.texto).not.toContain('3600000');
    expect(r.texto).not.toMatch(/neto|margen/i);
    // Su embudo no incluye la etapa perdida de Beto.
    const perdida = r.json.oportunidades.porEtapa.find((e) => e.nombre === 'Perdida A');
    expect(perdida?.cantidad).toBe(0);
  });

  it('el servidor impone el asesor de la sesión: «yo» y el propio id dan lo mismo', async () => {
    const sin = await reporte('valentinaA');
    const yo = await reporte('valentinaA', { ...RANGO, asesorId: 'yo' });
    const propio = await reporte('valentinaA', { ...RANGO, asesorId: usuarioId.valentinaA });
    expect(yo.json).toEqual(sin.json);
    expect(propio.json).toEqual(sin.json);
  });

  it('pedir el asesorId de otro es 403 y no devuelve ninguna cifra', async () => {
    const r = await reporte('valentinaA', { ...RANGO, asesorId: usuarioId.betoA });
    expect(r.estado).toBe(403);
    expect(codigo(r.json)).toBe('PERMISO_DENEGADO');
    expect(r.texto).not.toMatch(/ventasPorMoneda|oportunidades|respuesta/);
  });

  it('el 403 no revela si el asesor existe: el mismo con uno inexistente o de otra agencia', async () => {
    const compa = await reporte('valentinaA', { ...RANGO, asesorId: usuarioId.betoA });
    const inexistente = await reporte('valentinaA', { ...RANGO, asesorId: INEXISTENTE });
    const deOtraAgencia = await reporte('valentinaA', { ...RANGO, asesorId: usuarioId.duenoB });
    expect(inexistente.estado).toBe(403);
    expect(deOtraAgencia.estado).toBe(403);
    expect(inexistente.texto).toEqual(compa.texto);
    expect(deOtraAgencia.texto).toEqual(compa.texto);
  });

  it('el margen va por SU permiso, no por el alcance: Beto ve el de sus cotizaciones', async () => {
    const r = await reporte('betoA');
    expect(r.estado).toBe(200);
    expect(r.json.alcance).toBe('PROPIO');

    const leida = await conDevHeader(
      'GET',
      `/api/v1/cotizaciones/${aceptadaDeBeto.id}?incluirMargen=true`,
      TENANT_A,
    );
    const suya = CotizacionGuardada.parse(leida.json).versiones[0]!;
    expect(r.json.ventasPorMoneda).toHaveLength(1);
    expect(r.json.ventasPorMoneda[0]).toMatchObject({
      moneda: 'COP',
      cotizacionesAceptadas: 1,
      ventas: { unidades: '1200000', moneda: 'COP' },
      neto: suya.neto,
      margen: suya.margen,
      cotizacionesSinNeto: 0,
    });
    // El margen que ve es el SUYO: ni el de Valentina ni el de la agencia.
    const deValentina = await conDevHeader(
      'GET',
      `/api/v1/cotizaciones/${aceptadaDeValentina.id}?incluirMargen=true`,
      TENANT_A,
    );
    const ajena = CotizacionGuardada.parse(deValentina.json).versiones[0]!;
    expect(r.texto).not.toContain(ajena.margen!.unidades);
    expect(r.texto).not.toContain('2400000');
  });
});

describe('entre agencias y bordes', () => {
  it('otra agencia ve solo lo suyo: no mezcla cifras ni etapas de A', async () => {
    const r = await reporte('duenoB');
    expect(r.estado).toBe(200);
    expect(r.json.alcance).toBe('AGENCIA');
    expect(r.json.cotizaciones).toEqual({
      creadas: 1,
      enviadas: 1,
      aceptadas: 1,
      tasaAceptacion: 100,
    });
    expect(r.json.ventasPorMoneda).toHaveLength(1);
    expect(r.json.ventasPorMoneda[0]?.ventas).toEqual({ unidades: '2100000', moneda: 'COP' });
    expect(r.json.oportunidades.porEtapa.map((e) => e.nombre)).toEqual(['Nueva B']);
    expect(r.json.respuesta.conversacionesNuevas).toBe(0);
    // Nada de A en el texto: ni su etapa ni sus ventas.
    expect(r.texto).not.toContain('2400000');
    expect(r.texto).not.toContain('Nueva A');
  });

  it('un asesorId de la otra agencia no trae nada, ni con reportes.ver_agencia', async () => {
    const r = await reporte('duenoA', { ...RANGO, asesorId: usuarioId.duenoB });
    expect(r.estado).toBe(200);
    expect(r.json.asesorId).toBe(usuarioId.duenoB);
    expect(r.json.ventasPorMoneda).toEqual([]);
    expect(r.json.cotizaciones.creadas).toBe(0);
    expect(r.texto).not.toContain('2100000');
  });

  it('las ventas se agrupan por el instante de la ACEPTACION, no por el envio (T-183)', async () => {
    const antes = await reporte('duenoA', {
      desde: new Date(Date.now() - 300 * 24 * 3600_000).toISOString(),
      hasta: new Date(Date.now() - 24 * 3600_000).toISOString(),
    });
    expect(antes.estado).toBe(200);
    expect(antes.json.ventasPorMoneda).toEqual([]);
    const hoy = await reporte('duenoA');
    expect(hoy.json.ventasPorMoneda[0]?.cotizacionesAceptadas).toBe(2);
    expect(hoy.json.cotizaciones.aceptadasSinFecha).toBeUndefined();
  });

  it('un periodo sin datos devuelve ceros y razones null, no cifras inventadas', async () => {
    for (const quien of ['duenoA', 'valentinaA'] as Quien[]) {
      const r = await reporte(quien, {
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
    }
  });

  it('valida el rango y el asesorId en el borde (400) y exige sesión (401)', async () => {
    const invertido = await reporte('duenoA', { desde: RANGO.hasta, hasta: RANGO.desde });
    expect(invertido.estado).toBe(400);
    const sinHora = await reporte('duenoA', { desde: '2026-10-01', hasta: '2026-11-01' });
    expect(sinHora.estado).toBe(400);
    const demasiado = await reporte('duenoA', {
      desde: '2020-01-01T00:00:00.000Z',
      hasta: '2026-01-01T00:00:00.000Z',
    });
    expect(demasiado.estado).toBe(400);
    // Un asesorId mal formado es 400 para todos, antes de mirar permisos.
    for (const quien of ['duenoA', 'valentinaA'] as Quien[]) {
      const malFormado = await reporte(quien, { ...RANGO, asesorId: 'zzz' });
      expect(malFormado.estado).toBe(400);
    }

    const anonimo = await reporte(null);
    expect(anonimo.estado).toBe(401);
  });
});
