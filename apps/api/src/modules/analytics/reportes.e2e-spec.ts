/**
 * `GET /api/v1/reportes/resumen`, de punta a punta: aplicación ensamblada, HTTP real y PostgreSQL
 * con RLS. **Dos agencias y dos asesores en la misma agencia** (T-342, ADR-0035 §9):
 *
 *   · `duenoA`       — `reportes.ver_agencia` + `cotizacion.ver_neto_y_margen` (agencia A).
 *   · `operacionesA` — `reportes.ver_agencia` SIN el margen, en la misma agencia A.
 *   · `valentinaA`   — asesora: ni `reportes.ver_agencia` ni margen.
 *   · `betoA`        — asesor CON el permiso de margen pero SIN `reportes.ver_agencia`: los dos
 *     ejes son independientes (§6), el margen que ve es el de sus propias cotizaciones.
 *   · `sinCobrosA`   — `reportes.ver_agencia` pero SIN `cobro.ver` (T-537): ve toda la agencia en
 *     todo menos en el dinero por cobrar, que su propia pantalla de cobros le niega.
 *   · `duenoB`       — los mismos permisos, en la agencia B.
 *   · `duenoC`, `anaC` — agencia C (T-531, T-532): el dueño y una asesora, con tres paquetes de
 *     destino y moneda distintos (San Andrés en COP y en USD, Cartagena en COP).
 *
 * Lo que afirma:
 *   · un asesor ve LO SUYO y nada del compañero: ni sus ventas, ni su embudo, ni sus tiempos, ni
 *     el total de la agencia (del que se deduciría lo ajeno);
 *   · el servidor IMPONE el asesor de la sesión: `?asesorId=` propio o `yo` no cambia nada, y el
 *     de otro responde 403 —idéntico con un id inexistente o de otra agencia, no es un oráculo—;
 *   · quien tiene `reportes.ver_agencia` ve la suma de los dos y puede filtrar por asesor;
 *   · el margen sigue protegido por SU permiso en los dos alcances, y sin él las claves no
 *     existen (se busca en el texto crudo, no en claves conocidas), y lo mismo `porCobrar` con
 *     `cobro.ver` (T-537: un reporte nunca enseña más que la pantalla del mismo dato);
 *   · las cifras de A salen de los datos de A y nada más: las de B (más caras, para que se note)
 *     no se cuelan, y un `asesorId` de la otra agencia no trae nada;
 *   · un periodo sin datos devuelve ceros y razones `null`, y el rango se valida en el borde;
 *   · `porAsesor` (T-531) trae en UNA respuesta lo mismo que cada consulta con `?asesorId=`, y
 *     `ventasPorDestino` (T-532) una fila por destino y moneda sin sumar monedas; ninguna de las
 *     dos existe con alcance propio, ni con el margen sin su permiso, ni cruza agencias.
 *
 * **Fixtures propios.** Las versiones son inmutables y solo la purga las borra, así que esta
 * prueba crea dos agencias `fixture-aislamiento-` y las borra al terminar. Las cotizaciones se
 * crean con el atajo de desarrollo, con la cabecera `x-dev-usuario-id` del asesor que cotiza
 * (de ahí sale `cotizaciones.creado_por`, la atribución de §2); las LECTURAS del reporte van con
 * cookie de sesión, que es la que lleva los permisos del rol.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import {
  CotizacionGuardada,
  type ResumenDeAgencia,
  ResumenDeReportesPorAlcance,
} from '@viajapro/contracts';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { mensajeConTexto } from '../../shared/cifrado/cifrado-de-prueba.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const TENANT_C = idDeTenant();
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
  sinCobrosA: `fixture-aislamiento-rep-sincob-a-${randomBytes(3).toString('hex')}${DOMINIO}`,
  duenoB: `fixture-aislamiento-rep-dueno-b-${randomBytes(3).toString('hex')}${DOMINIO}`,
  duenoC: `fixture-aislamiento-rep-dueno-c-${randomBytes(3).toString('hex')}${DOMINIO}`,
  anaC: `fixture-aislamiento-rep-ana-c-${randomBytes(3).toString('hex')}${DOMINIO}`,
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
      'cobro.ver',
    ],
    'DUENO',
  );
  const deAgenciaSinMargen = await rol('Operaciones', [
    'conversaciones.ver_todas',
    'cotizacion.escribir',
    'crm.escribir',
    'reportes.ver_agencia',
    'cobro.ver',
  ]);
  // `cobro.ver` lo llevan los tres roles sembrados (`siembra-de-tenant.ts`): el fixture los imita.
  const asesor = await rol(
    'Asesor',
    ['cotizacion.escribir', 'crm.escribir', 'cobro.ver'],
    'ASESOR',
  );
  const asesorConMargen = await rol('Asesor con margen', [
    'cotizacion.escribir',
    'crm.escribir',
    'cotizacion.ver_neto_y_margen',
    'cobro.ver',
  ]);
  // T-537: el rol a medida que hoy ninguna agencia puede componerse todavía (no hay endpoint),
  // y que es justo el caso que el recorte de `porCobrar` existe para cubrir.
  const deAgenciaSinCobros = await rol('Supervisión sin cobros', [
    'conversaciones.ver_todas',
    'cotizacion.escribir',
    'crm.escribir',
    'reportes.ver_agencia',
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
    deAgenciaSinCobros: deAgenciaSinCobros.id,
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
  await persona('sinCobrosA', TENANT_A, a.deAgenciaSinCobros);
  await persona('valentinaA', TENANT_A, a.asesor);
  await persona('betoA', TENANT_A, a.asesorConMargen);
  await persona('duenoB', TENANT_B, b.deAgenciaConMargen);
  const c = await crearAgencia(TENANT_C, 'C', 1_000_000n);
  await persona('duenoC', TENANT_C, c.deAgenciaConMargen);
  await persona('anaC', TENANT_C, c.asesor);
  // T-532: dos paquetes más. «San Andrés» ya existe en COP; aquí también en USD (mismo destino,
  // otra moneda: si algún día se sumaran, el total de un solo renglón delataría el error), y
  // «Cartagena» en COP.
  const paqueteExtra = async (destino: string, moneda: 'COP' | 'USD', ventaUnidades: bigint) => {
    const paquete = await admin.paquete.create({
      data: {
        tenantId: TENANT_C,
        nombre: `Paquete ${destino} ${moneda} fixture`,
        destino,
        dias: 4,
        noches: 3,
        planAlimentacion: 'TODO_INCLUIDO',
      },
    });
    const vigencia = await admin.vigencia.create({
      data: {
        tenantId: TENANT_C,
        paqueteId: paquete.id,
        desde: new Date('2027-03-01'),
        hasta: new Date('2027-03-31'),
      },
    });
    await admin.tarifa.create({
      data: {
        tenantId: TENANT_C,
        vigenciaId: vigencia.id,
        nombre: 'Adulto',
        netoUnidades: (ventaUnidades * 5n) / 6n,
        ventaUnidades,
        monedaIso: moneda,
      },
    });
    return paquete.id;
  };
  const sanAndresUsd = await paqueteExtra('San Andrés', 'USD', 50_000n);
  const cartagena = await paqueteExtra('Cartagena', 'COP', 2_000_000n);

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
  // Estas tres se guardan: de ellas heredan su asesor los archivos de viaje (ADR-0035 §2).
  const opDeValentina = await oportunidad(
    TENANT_A,
    a.contacto,
    etapasA.ganada.id,
    usuarioId.valentinaA,
  );
  const opDeBeto = await oportunidad(TENANT_A, a.contacto, etapasA.perdida.id, usuarioId.betoA);
  const opDeB = await oportunidad(TENANT_B, b.contacto, etapaB.id, usuarioId.duenoB);

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
  const aceptadaDeB = await cotizar(TENANT_B, b, 'duenoB', 1, 'ACEPTADA');

  // T-531, T-532 (agencia C): cuatro ventas aceptadas, de dos asesores, en tres destino/moneda.
  await cotizar(TENANT_C, c, 'duenoC', 2, 'ACEPTADA'); // San Andrés COP 2 000 000
  await cotizar(TENANT_C, c, 'anaC', 1, 'ACEPTADA'); // San Andrés COP 1 000 000
  await cotizar(TENANT_C, { ...c, paquete: sanAndresUsd }, 'duenoC', 1, 'ACEPTADA'); // USD 50 000
  await cotizar(TENANT_C, { ...c, paquete: cartagena }, 'anaC', 1, 'ACEPTADA'); // Cartagena 2 000 000

  // T-528: cotizaciones ENVIADAS que siguen esperando, con antigüedades distintas. Se envían hoy
  // y se retrasa `enviada_en` FUERA del rango del reporte: así cambian los tramos de «hoy» sin
  // tocar la cohorte de `enviadas` del periodo, que se cuenta por `enviada_en`.
  const envejecer = async (cot: CotizacionGuardada, dias: number) => {
    await admin.cotizacion.update({
      where: { id: cot.id },
      data: { enviadaEn: new Date(Date.now() - dias * 24 * 3600_000) },
    });
  };
  await envejecer(await cotizar(TENANT_A, a, 'valentinaA', 3, 'ENVIADA'), 5);
  await envejecer(await cotizar(TENANT_A, a, 'valentinaA', 4, 'ENVIADA'), 20);
  await envejecer(await cotizar(TENANT_A, a, 'betoA', 2, 'ENVIADA'), 10);

  // T-528: los archivos de viaje los abre el consumidor del evento de venta, no esta prueba. Se
  // espera a que existan y se les pone su oportunidad, que es de donde sale el asesor (§2).
  const esperarArchivo = async (tenantId: string, cotizacionId: string) => {
    for (let i = 0; i < 300; i++) {
      const f = await admin.travelFile.findFirst({ where: { tenantId, cotizacionId } });
      if (f) return f;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`El archivo de la cotización ${cotizacionId} no se abrió a tiempo`);
  };
  const archivoDe = async (tenantId: string, cot: CotizacionGuardada, oportunidadId: string) => {
    const f = await esperarArchivo(tenantId, cot.id);
    // `oportunidad_id` es de las pocas columnas que el archivo admite actualizar (la venta y la
    // moneda son inmutables por disparador).
    return admin.travelFile.update({ where: { id: f.id }, data: { oportunidadId } });
  };
  const archivoDeValentina = await archivoDe(TENANT_A, aceptadaDeValentina, opDeValentina.id);
  await archivoDe(TENANT_A, aceptadaDeBeto, opDeBeto.id);
  await archivoDe(TENANT_B, aceptadaDeB, opDeB.id);

  // Un pago parcial en el archivo de Valentina: su saldo deja de ser la venta y se ve que el
  // agregado usa las funciones de saldo, no la columna de venta.
  await admin.payment.create({
    data: {
      tenantId: TENANT_A,
      travelFileId: archivoDeValentina.id,
      tipo: 'PAGO',
      montoUnidades: 400_000n,
      monedaIso: archivoDeValentina.monedaIso,
      pagadoEl: new Date('2026-11-20T00:00:00.000Z'),
      medio: 'TRANSFERENCIA',
      claveIdempotencia: randomUUID(),
      registradoPorId: usuarioId.valentinaA,
    },
  });

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
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B, TENANT_C]);
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
      // 7 creadas hoy; solo 3 con `enviada_en` dentro del rango (T-528 envejeció tres).
      creadas: 7,
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
      creadas: 2,
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
      creadas: 5,
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

/**
 * T-528: las dos cifras de HOY. Son las que la web no podía pintar con honestidad, porque
 * `/cotizaciones` y `/cobros` no traen asesor y devuelven toda la agencia (T-490): filtrarlas en
 * el cliente habría sido que la web decida el alcance, que ADR-0035 §5 prohíbe.
 *
 * El escenario, todo dentro de la agencia A:
 *   · Valentina — 1 borrador, 3 enviadas abiertas (0, 5 y 20 días) y un archivo de 2.400.000 COP
 *     con 400.000 pagados: saldo 2.000.000.
 *   · Beto      — 1 enviada abierta (10 días) y un archivo de 1.200.000 COP sin pagos.
 *   · Agencia   — la suma de los dos: 5 abiertas y 3.200.000 por cobrar.
 *   · Agencia B — un archivo de 2.100.000 COP que no debe aparecer en ninguna cifra de A.
 *
 * Cada aserción es de igualdad exacta a propósito: si alguien quitara el filtro de asesor, el
 * asesor vería las cifras de la agencia y la prueba fallaría, que es justo lo que se le pide.
 */
describe('cotizaciones abiertas y por cobrar, con el mismo alcance (T-528)', () => {
  const COP = (unidades: string) => ({ unidades, moneda: 'COP' });

  it('la agencia ve las de los dos asesores, repartidas por antigüedad', async () => {
    const r = await reporte('duenoA');
    expect(r.estado).toBe(200);
    expect(r.json.cotizacionesAbiertas).toEqual({
      total: 5,
      borradores: 1,
      enviadas: 4,
      porAntiguedad: { hastaTresDias: 1, deCuatroASiete: 1, masDeSiete: 2 },
    });
    expect(r.json.porCobrar).toEqual({
      porMoneda: [{ moneda: 'COP', archivos: 2, saldo: COP('3200000') }],
      truncado: false,
    });
  });

  it('Valentina ve SOLO lo suyo: ni una cotización ni un peso de Beto', async () => {
    const r = await reporte('valentinaA');
    expect(r.json.alcance).toBe('PROPIO');
    expect(r.json.cotizacionesAbiertas).toEqual({
      total: 4,
      borradores: 1,
      enviadas: 3,
      porAntiguedad: { hastaTresDias: 1, deCuatroASiete: 1, masDeSiete: 1 },
    });
    // 2.400.000 vendidos − 400.000 pagados: el saldo sale de las funciones de `packages/domain`,
    // no de la columna de venta.
    expect(r.json.porCobrar).toEqual({
      porMoneda: [{ moneda: 'COP', archivos: 1, saldo: COP('2000000') }],
      truncado: false,
    });
    // Ni el saldo de Beto, ni el total de la agencia, ni el de la otra agencia.
    expect(r.texto).not.toContain('1200000');
    expect(r.texto).not.toContain('3200000');
    expect(r.texto).not.toContain('2100000');
  });

  it('Beto ve SOLO lo suyo, y no deduce el total de la agencia', async () => {
    const r = await reporte('betoA');
    expect(r.json.alcance).toBe('PROPIO');
    expect(r.json.cotizacionesAbiertas).toEqual({
      total: 1,
      borradores: 0,
      enviadas: 1,
      porAntiguedad: { hastaTresDias: 0, deCuatroASiete: 0, masDeSiete: 1 },
    });
    expect(r.json.porCobrar).toEqual({
      porMoneda: [{ moneda: 'COP', archivos: 1, saldo: COP('1200000') }],
      truncado: false,
    });
    expect(r.texto).not.toContain('2000000');
    expect(r.texto).not.toContain('3200000');
  });

  it('con reportes.ver_agencia y filtro de asesor se ve lo mismo que ve ese asesor', async () => {
    const comoDuena = await reporte('duenoA', { ...RANGO, asesorId: usuarioId.betoA });
    const comoEl = await reporte('betoA');
    expect(comoDuena.json.cotizacionesAbiertas).toEqual(comoEl.json.cotizacionesAbiertas);
    expect(comoDuena.json.porCobrar).toEqual(comoEl.json.porCobrar);
  });

  it('el archivo hereda el asesor de su OPORTUNIDAD, no de quien cotizó (ADR-0035 §2)', async () => {
    // El archivo de Valentina está en la oportunidad de Valentina: si la atribución se tomara de
    // otra columna, el reparto entre los dos asesores no daría 2.000.000 y 1.200.000.
    const suyos = await reporte('valentinaA');
    const deBeto = await reporte('betoA');
    const agencia = await reporte('duenoA');
    const saldo = (r: typeof suyos) => r.json.porCobrar?.porMoneda[0]?.saldo.unidades;
    expect(saldo(suyos)).toBe('2000000');
    expect(saldo(deBeto)).toBe('1200000');
    expect(saldo(agencia)).toBe('3200000');
  });

  it('otra agencia no aporta ni una fila: B ve lo suyo y A nunca lo ve', async () => {
    const b = await reporte('duenoB');
    expect(b.json.porCobrar).toEqual({
      porMoneda: [{ moneda: 'COP', archivos: 1, saldo: COP('2100000') }],
      truncado: false,
    });
    expect(b.json.cotizacionesAbiertas?.total).toBe(0);
    expect(b.texto).not.toContain('3200000');
    expect(b.texto).not.toContain('2000000');

    const a = await reporte('duenoA');
    expect(a.texto).not.toContain('2100000');
  });

  it('son cifras de HOY: no cambian con el periodo, aunque el periodo esté vacío', async () => {
    const delMes = await reporte('valentinaA');
    const antiguo = await reporte('valentinaA', {
      desde: new Date(Date.now() - 300 * 24 * 3600_000).toISOString(),
      hasta: new Date(Date.now() - 200 * 24 * 3600_000).toISOString(),
    });
    expect(antiguo.json.cotizaciones.creadas).toBe(0);
    expect(antiguo.json.cotizacionesAbiertas).toEqual(delMes.json.cotizacionesAbiertas);
    expect(antiguo.json.porCobrar).toEqual(delMes.json.porCobrar);
  });

  it('un asesorId de la otra agencia no trae cifras de nadie', async () => {
    const r = await reporte('duenoA', { ...RANGO, asesorId: usuarioId.duenoB });
    expect(r.estado).toBe(200);
    expect(r.json.porCobrar).toEqual({ porMoneda: [], truncado: false });
    expect(r.json.cotizacionesAbiertas?.total).toBe(0);
  });
});

/**
 * T-537: `porCobrar` es el MISMO dato que sirven las pantallas de cobro, que exigen `cobro.ver`.
 * Un reporte puede ser más estrecho que ellas, nunca más amplio (ADR-0035 §4).
 *
 * `sinCobrosA` es el rol que hoy ninguna agencia puede componerse —los tres sembrados llevan
 * `cobro.ver` y no hay endpoint para armar roles a medida—, y por eso esto no era una fuga en
 * producción: es la compuerta puesta ANTES de que ese endpoint exista (R12).
 */
describe('el saldo por cobrar exige `cobro.ver` (T-537)', () => {
  it('con reportes.ver_agencia pero sin cobro.ver: ve la agencia, menos el dinero por cobrar', async () => {
    const r = await reporte('sinCobrosA');
    expect(r.estado).toBe(200);
    // Ve toda la agencia en todo lo demás: el recorte es de la CIFRA, no del reporte.
    expect(r.json.alcance).toBe('AGENCIA');
    expect(r.json.cotizacionesAbiertas).toEqual({
      total: 5,
      borradores: 1,
      enviadas: 4,
      porAntiguedad: { hastaTresDias: 1, deCuatroASiete: 1, masDeSiete: 2 },
    });

    // La clave no existe: ni en cero, ni en `null`, ni vacía. Se mira el texto CRUDO.
    expect(r.json.porCobrar).toBeUndefined();
    expect(r.texto).not.toContain('porCobrar');
    // Y el saldo de la agencia tampoco se cuela por otra parte de la respuesta.
    expect(r.texto).not.toContain('3200000');
  });

  it('el mismo alcance CON el permiso sí la trae: lo que cambia es el permiso, no el alcance', async () => {
    const sin = await reporte('sinCobrosA');
    const con = await reporte('operacionesA');
    expect(sin.json.alcance).toBe(con.json.alcance);
    expect(sin.json.cotizacionesAbiertas).toEqual(con.json.cotizacionesAbiertas);
    expect(con.json.porCobrar).toEqual({
      porMoneda: [{ moneda: 'COP', archivos: 2, saldo: { unidades: '3200000', moneda: 'COP' } }],
      truncado: false,
    });
  });
});

/** La respuesta de agencia, o falla: estas pruebas no tienen nada que decir de la propia. */
function deAgencia(r: { json: ResumenDeReportesPorAlcance }): ResumenDeAgencia {
  if (r.json.alcance !== 'AGENCIA') throw new Error('Se esperaba el alcance de agencia');
  return r.json;
}

describe('cifras por asesor en una sola respuesta (T-531)', () => {
  it('cada fila es EXACTAMENTE lo que daría la consulta filtrada por ese asesor', async () => {
    const agencia = deAgencia(await reporte('duenoA'));
    const filas = agencia.porAsesor ?? [];
    // Solo los dos asesores con actividad: ni el dueño ni operaciones, que no cotizaron nada.
    expect(filas.map((f) => f.asesorId).sort()).toEqual(
      [usuarioId.valentinaA, usuarioId.betoA].sort(),
    );

    for (const quien of ['valentinaA', 'betoA'] as const) {
      const fila = filas.find((f) => f.asesorId === usuarioId[quien]);
      const individual = deAgencia(
        await reporte('duenoA', { ...RANGO, asesorId: usuarioId[quien] }),
      );
      const { porEtapa: _porEtapa, ...oportunidades } = individual.oportunidades;
      // Cotizaciones (con neto y margen: el dueño tiene el permiso), ventas, oportunidades y
      // respuesta, con la misma atribución que el filtro (ADR-0035 §2).
      expect(fila).toEqual({
        asesorId: usuarioId[quien],
        cotizaciones: individual.cotizaciones,
        ventasPorMoneda: individual.ventasPorMoneda,
        oportunidades,
        respuesta: individual.respuesta,
      });
    }
    // Y no son filas vacías: lo que se comparó es dinero y tiempos reales.
    const vale = filas.find((f) => f.asesorId === usuarioId.valentinaA);
    expect(vale?.ventasPorMoneda[0]?.ventas).toEqual({ unidades: '2400000', moneda: 'COP' });
    expect(vale?.respuesta.conversacionesNuevas).toBe(2);
    expect(vale?.respuesta.sinResponder).toBe(1);
    expect(vale?.oportunidades).toMatchObject({ creadas: 3, ganadas: 1, perdidas: 0, abiertas: 2 });
  });

  it('la agencia entera sigue siendo la suma: lo de los asesores cuadra con el total', async () => {
    const agencia = deAgencia(await reporte('duenoA'));
    const filas = agencia.porAsesor ?? [];
    const suma = (f: (x: (typeof filas)[number]) => number): number =>
      filas.reduce((acc, x) => acc + f(x), 0);
    expect(suma((x) => x.cotizaciones.creadas)).toBe(agencia.cotizaciones.creadas);
    expect(suma((x) => x.cotizaciones.enviadas)).toBe(agencia.cotizaciones.enviadas);
    expect(suma((x) => x.oportunidades.creadas)).toBe(agencia.oportunidades.creadas);
    expect(suma((x) => x.respuesta.conversacionesNuevas)).toBe(
      agencia.respuesta.conversacionesNuevas,
    );
  });

  it('va ordenada por asesor, sin depender del plan de la base', async () => {
    const ids = (deAgencia(await reporte('duenoA')).porAsesor ?? []).map((f) => f.asesorId);
    expect(ids).toEqual([...ids].sort());
  });

  it('sin cotizacion.ver_neto_y_margen ninguna fila trae neto ni margen', async () => {
    const r = await reporte('operacionesA');
    expect(deAgencia(r).porAsesor).toHaveLength(2);
    expect(r.texto).not.toMatch(/neto|margen/i);
  });

  it('con un filtro de asesor no hay lista por asesor: sería una lista de uno', async () => {
    const r = await reporte('duenoA', { ...RANGO, asesorId: usuarioId.betoA });
    expect(deAgencia(r).porAsesor).toBeUndefined();
    expect(r.texto).not.toContain('porAsesor');
  });

  it('con alcance propio la clave no existe y no se cuela el compañero', async () => {
    for (const quien of ['valentinaA', 'betoA'] as const) {
      const r = await reporte(quien);
      expect(r.json.alcance).toBe('PROPIO');
      expect(r.texto).not.toContain('porAsesor');
      expect(r.texto).not.toContain('ventasPorDestino');
      const otro = quien === 'valentinaA' ? usuarioId.betoA : usuarioId.valentinaA;
      expect(r.texto).not.toContain(otro);
    }
  });

  it('otra agencia solo ve a sus asesores: ni un id de A en la respuesta de B', async () => {
    const r = await reporte('duenoB');
    const filas = deAgencia(r).porAsesor ?? [];
    expect(filas.map((f) => f.asesorId)).toEqual([usuarioId.duenoB]);
    expect(filas[0]?.ventasPorMoneda[0]?.ventas).toEqual({ unidades: '2100000', moneda: 'COP' });
    for (const quien of ['duenoA', 'valentinaA', 'betoA', 'operacionesA'] as const) {
      expect(r.texto).not.toContain(usuarioId[quien]);
    }
  });

  it('un periodo sin datos devuelve listas vacías, no filas en cero', async () => {
    const r = await reporte('duenoA', {
      desde: '2020-01-01T00:00:00.000Z',
      hasta: '2020-02-01T00:00:00.000Z',
    });
    expect(deAgencia(r).porAsesor).toEqual([]);
    expect(deAgencia(r).ventasPorDestino).toEqual([]);
  });
});

describe('ventas del periodo por destino y moneda (T-532)', () => {
  it('una fila por destino y moneda, sin sumar monedas y de mayor a menor venta (R8)', async () => {
    const r = await reporte('duenoC');
    const filas = (deAgencia(r).ventasPorDestino ?? []).map((f) => [
      f.destino,
      f.moneda,
      f.cotizacionesAceptadas,
      f.ventas.unidades,
    ]);
    expect(filas).toEqual([
      ['San Andrés', 'COP', 2, '3000000'],
      ['Cartagena', 'COP', 1, '2000000'],
      ['San Andrés', 'USD', 1, '50000'],
    ]);
    // El mismo destino en dos monedas son dos renglones; ninguno vale 3 050 000.
    expect(r.texto).not.toContain('3050000');
  });

  it('reparte las MISMAS ventas que ventasPorMoneda: por destino suman lo mismo, moneda a moneda', async () => {
    const agencia = deAgencia(await reporte('duenoC'));
    for (const porMoneda of agencia.ventasPorMoneda) {
      const delDestino = (agencia.ventasPorDestino ?? [])
        .filter((f) => f.moneda === porMoneda.moneda)
        .reduce((acc, f) => acc + BigInt(f.ventas.unidades), 0n);
      expect(delDestino.toString()).toBe(porMoneda.ventas.unidades);
    }
    expect(agencia.ventasPorMoneda.map((v) => v.moneda).sort()).toEqual(['COP', 'USD']);
  });

  it('respeta el filtro de asesor de la agencia', async () => {
    const ana = deAgencia(await reporte('duenoC', { ...RANGO, asesorId: usuarioId.anaC }));
    expect(
      (ana.ventasPorDestino ?? []).map((f) => [f.destino, f.moneda, f.ventas.unidades]),
    ).toEqual([
      ['Cartagena', 'COP', '2000000'],
      ['San Andrés', 'COP', '1000000'],
    ]);
    const dueno = deAgencia(await reporte('duenoC', { ...RANGO, asesorId: usuarioId.duenoC }));
    expect(
      (dueno.ventasPorDestino ?? []).map((f) => [f.destino, f.moneda, f.ventas.unidades]),
    ).toEqual([
      ['San Andrés', 'COP', '2000000'],
      ['San Andrés', 'USD', '50000'],
    ]);
  });

  it('las cifras por asesor tampoco suman monedas: el dueño tiene una fila COP y una USD', async () => {
    const filas = deAgencia(await reporte('duenoC')).porAsesor ?? [];
    const dueno = filas.find((f) => f.asesorId === usuarioId.duenoC);
    expect(dueno?.ventasPorMoneda.map((v) => [v.moneda, v.ventas.unidades])).toEqual([
      ['COP', '2000000'],
      ['USD', '50000'],
    ]);
  });

  it('el neto y el margen por destino salen solo con su permiso', async () => {
    const con = await reporte('duenoC');
    for (const fila of deAgencia(con).ventasPorDestino ?? []) {
      expect(fila.margen).not.toBeUndefined();
      expect(fila.neto).not.toBeUndefined();
    }
    // Operaciones ve la agencia, pero esa agencia es la A: el permiso se prueba con su respuesta.
    const sin = await reporte('operacionesA');
    expect(deAgencia(sin).ventasPorDestino).toHaveLength(1);
    expect(sin.texto).not.toMatch(/neto|margen/i);
  });

  it('con alcance propio la clave no existe', async () => {
    const r = await reporte('anaC');
    expect(r.json.alcance).toBe('PROPIO');
    expect(r.texto).not.toContain('ventasPorDestino');
  });

  it('una agencia no ve los destinos de otra', async () => {
    const b = await reporte('duenoB');
    expect((deAgencia(b).ventasPorDestino ?? []).map((f) => f.destino)).toEqual(['San Andrés']);
    expect(b.texto).not.toContain('Cartagena');
    const a = await reporte('duenoA');
    expect(a.texto).not.toContain('Cartagena');
  });
});
