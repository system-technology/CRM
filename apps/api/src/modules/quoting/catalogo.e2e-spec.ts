/**
 * Las dos rutas del catálogo de ADR-0009, a través de HTTP y contra Neon:
 *
 *   GET  /api/v1/catalogo/salidas
 *   POST /api/v1/catalogo/cotizar
 *
 * Arranca el `AppModule` real con el mismo montaje que `crm.e2e-spec.ts`: puerto efímero,
 * filtro global de dominio, cabecera de tenant de desarrollo.
 *
 * **Depende de la semilla.** Los números (78 salidas en octubre de 2026, 378000 y 280000 de
 * «Parque Consotá») son los de la agencia demo sembrada con `pnpm db:seed`. Si alguien cambia la
 * semilla, esta prueba cae y debe caer: es la que fija lo que se midió a mano. El tenant es el
 * identificador fijo de la demo, no «la primera agencia»: aquí un tenant equivocado daría
 * números distintos y un falso rojo.
 *
 * **Lo que SÍ afirma:** el montaje de las rutas; la validación de entrada (400); el corte sin
 * tenant (401); que `SIN_VIGENCIA` sale como 409 con su código estable; el conteo de salidas;
 * que cotizar devuelve TODAS las opciones aplicables y marca la más barata; que la tarifa de
 * grupo no aplica a múltiplos inexactos; que `neto` y `mayoristaId` no salen en el listado; y
 * que un tenant inexistente no ve estas salidas ni puede cotizarlas (RLS vía HTTP).
 *
 * **Lo que NO afirma:**
 *   · la aritmética del margen ni la resolución con solapes: están en `packages/domain`;
 *   · que `neto` no salga de `/cotizar`: ahí el margen SÍ viaja a propósito («solo para el
 *     tenant») y esta prueba no distingue quién llama, porque aún no hay autenticación;
 *   · el aislamiento entre tenants como garantía: aquí solo se prueba con un tenant inexistente,
 *     no con dos reales. La prueba de aislamiento de verdad es `aislamiento.spec.ts`;
 *   · la inyección implícita bajo `tsx`: vitest emite metadatos de decorador y el servidor de
 *     desarrollo no. Ver la cabecera de `crm.e2e-spec.ts`.
 */

import 'reflect-metadata';

import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const ARRANQUE_MS = 60_000;

/** La agencia demo de `pnpm db:seed`. */
const TENANT_DEMO = '01932000-0000-7000-8000-0000000000d0';
/** Un tenant que no existe: RLS no debe dejarle ver nada. */
const TENANT_AJENO = '01932000-0000-7000-8000-00000000ffff';

let app: INestApplication;
let base: string;
let paqueteConsota: string;

function cabeceras(tenantId: string | null = TENANT_DEMO): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(tenantId ? { 'x-dev-tenant-id': tenantId } : {}),
  };
}

interface Salida {
  paqueteId: string;
  paqueteNombre: string;
  fecha: string;
}
interface Opcion {
  nombre: string;
  unidad: string;
  veces: number;
  total: { unidades: string; moneda: string };
  recomendada: boolean;
}
interface ErrorApi {
  error: { code: string; details?: Record<string, string> };
}

async function salidas(consulta: string, tenantId: string | null = TENANT_DEMO) {
  const r = await fetch(new URL(`/api/v1/catalogo/salidas?${consulta}`, base), {
    headers: cabeceras(tenantId),
  });
  const texto = await r.text();
  return { status: r.status, texto, cuerpo: JSON.parse(texto) as { salidas: Salida[] } };
}

async function cotizar(cuerpo: unknown, tenantId: string = TENANT_DEMO) {
  const r = await fetch(new URL('/api/v1/catalogo/cotizar', base), {
    method: 'POST',
    headers: cabeceras(tenantId),
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] ??= 'token-solo-de-esta-prueba';
  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();

  // El id del paquete se busca por nombre en el propio listado: no se copia a mano.
  const { cuerpo } = await salidas('desde=2026-10-01&hasta=2026-10-31');
  const consota = cuerpo.salidas.find((s) => s.paqueteNombre === 'Parque Consotá');
  if (!consota) throw new Error('No hay salidas de «Parque Consotá»: corre `pnpm db:seed`.');
  paqueteConsota = consota.paqueteId;
}, ARRANQUE_MS);

afterAll(async () => {
  await app?.close();
});

describe('GET /api/v1/catalogo/salidas', () => {
  it('lista las 78 salidas de octubre de 2026 de la agencia demo', async () => {
    const r = await salidas('desde=2026-10-01&hasta=2026-10-31');
    expect(r.status).toBe(200);
    expect(r.cuerpo.salidas).toHaveLength(78);
  });

  it('todas las salidas caen dentro del rango pedido y vienen ordenadas por fecha', async () => {
    const { cuerpo } = await salidas('desde=2026-10-01&hasta=2026-10-31');
    const fechas = cuerpo.salidas.map((s) => s.fecha);
    expect(fechas.every((f) => f >= '2026-10-01' && f <= '2026-10-31')).toBe(true);
    expect([...fechas].sort()).toEqual(fechas);
  });

  it('el filtro por paquete devuelve solo ese paquete', async () => {
    const { cuerpo } = await salidas(
      `desde=2026-10-01&hasta=2026-10-31&paqueteId=${paqueteConsota}`,
    );
    expect(cuerpo.salidas.length).toBeGreaterThan(0);
    expect(cuerpo.salidas.length).toBeLessThan(78);
    expect(cuerpo.salidas.every((s) => s.paqueteId === paqueteConsota)).toBe(true);
  });

  it('`limite` recorta el listado', async () => {
    const { cuerpo } = await salidas('desde=2026-10-01&hasta=2026-10-31&limite=5');
    expect(cuerpo.salidas).toHaveLength(5);
  });

  it('nunca contiene `neto` ni `mayoristaId`, ni en el listado más amplio', async () => {
    const r = await salidas('desde=2026-01-01&limite=200');
    expect(r.status).toBe(200);
    expect(r.cuerpo.salidas.length).toBeGreaterThan(0);
    // Sobre el texto crudo: no importa a qué profundidad lo metan.
    expect(r.texto).not.toMatch(/neto/i);
    expect(r.texto).not.toMatch(/mayorista/i);
  });

  it('SIN cabecera de tenant devuelve 401', async () => {
    const r = await salidas('desde=2026-10-01', null);
    expect(r.status).toBe(401);
  });

  it('SIN `desde` devuelve 400', async () => {
    const r = await salidas('hasta=2026-10-31');
    expect(r.status).toBe(400);
  });

  it('un `desde` mal formado devuelve 400', async () => {
    const r = await salidas('desde=01-10-2026');
    expect(r.status).toBe(400);
  });

  it('un tenant inexistente no ve las salidas de la demo', async () => {
    const r = await salidas('desde=2026-10-01&hasta=2026-10-31', TENANT_AJENO);
    expect(r.status).toBe(200);
    expect(r.cuerpo.salidas).toHaveLength(0);
  });
});

describe('POST /api/v1/catalogo/cotizar', () => {
  it('con 2 adultos ofrece DOS opciones y recomienda la promo de pareja', async () => {
    const r = await cotizar({ paqueteId: paqueteConsota, fecha: '2026-10-11', adultos: 2 });
    expect(r.status).toBe(200);

    const opciones = r.cuerpo['opciones'] as Opcion[];
    expect(opciones).toHaveLength(2);

    const porPersona = opciones.find((o) => o.nombre === 'Adulto');
    expect(porPersona).toMatchObject({ unidad: 'POR_PERSONA', veces: 2, recomendada: false });
    expect(porPersona?.total.unidades).toBe('378000');

    const promo = opciones.find((o) => o.nombre === 'Promo pareja');
    expect(promo).toMatchObject({ unidad: 'POR_GRUPO', veces: 1, recomendada: true });
    expect(promo?.total.unidades).toBe('280000');
  });

  it('con 3 adultos SOLO queda la opción por persona', async () => {
    const r = await cotizar({ paqueteId: paqueteConsota, fecha: '2026-10-11', adultos: 3 });
    expect(r.status).toBe(200);
    const opciones = r.cuerpo['opciones'] as Opcion[];
    expect(opciones).toHaveLength(1);
    expect(opciones[0]).toMatchObject({ nombre: 'Adulto', unidad: 'POR_PERSONA', veces: 3 });
    expect(opciones[0]?.total.unidades).toBe('567000');
  });

  it('una fecha sin cobertura da 409 con `SIN_VIGENCIA`', async () => {
    const r = await cotizar({ paqueteId: paqueteConsota, fecha: '2026-11-20', adultos: 2 });
    expect(r.status).toBe(409);
    expect((r.cuerpo as unknown as ErrorApi).error.code).toBe('SIN_VIGENCIA');
  });

  it('un paquete inexistente da 404', async () => {
    const r = await cotizar({
      paqueteId: '00000000-0000-4000-8000-00000000dead',
      fecha: '2026-10-11',
    });
    expect(r.status).toBe(404);
  });

  it('un cuerpo inválido da 400 nombrando el campo, no 500', async () => {
    const r = await cotizar({ paqueteId: 'NO_ES_UN_UUID', fecha: '2026-10-11' });
    expect(r.status).toBe(400);
    const e = (r.cuerpo as unknown as ErrorApi).error;
    expect(e.code).toBe('ENTRADA_INVALIDA');
    expect(Object.keys(e.details ?? {})).toContain('paqueteId');
  });

  it('cero adultos da 400: un viaje sin adulto no se cotiza', async () => {
    const r = await cotizar({ paqueteId: paqueteConsota, fecha: '2026-10-11', adultos: 0 });
    expect(r.status).toBe(400);
  });

  it('un tenant inexistente no puede cotizar un paquete de la demo', async () => {
    const r = await cotizar(
      { paqueteId: paqueteConsota, fecha: '2026-10-11', adultos: 2 },
      TENANT_AJENO,
    );
    expect(r.status).toBe(404);
  });
});

/**
 * **Este bloque nace de una mutación que NO se puso roja.** Al quitar el filtro `publicada: true`
 * de `listar-salidas.use-case.ts`, las 16 pruebas anteriores seguían verdes: la semilla no tenía
 * ni una vigencia abierta, así que la regla solo estaba protegida por lectura.
 *
 * La semilla ya siembra las vigencias abiertas de la campaña (`publicada = false`, de un mes),
 * y estas dos afirmaciones son las que convierten el filtro y la regla de desempate en algo
 * verificado en vez de afirmado.
 */
describe('Las dos formas de vender conviven, y se distinguen', () => {
  it('una vigencia ABIERTA no se anuncia como salida', async () => {
    // Anunciar un rango de un mes como si fuera una fecha concreta seria mentirle al viajero.
    // Hay mas vigencias en la base que salidas en el listado, y esa diferencia es el filtro.
    const { cuerpo } = await salidas('desde=2026-10-01&hasta=2026-10-31&limite=200');
    expect(cuerpo.salidas).toHaveLength(78);
    for (const s of cuerpo.salidas) {
      // Toda salida anunciada es de un dia concreto: el listado no devuelve rangos.
      expect(s.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('la salida publicada GANA al rango que la contiene', async () => {
    // El 11 de octubre «Parque Consota» tiene salida publicada Y cae dentro de la vigencia
    // abierta de la campania. Lo mas especifico manda: esta es la regla del ADR-0009 §1
    // comprobada de punta a punta, no solo en la funcion pura.
    const enFechaPublicada = await cotizar({
      paqueteId: paqueteConsota,
      fecha: '2026-10-11',
      adultos: 2,
    });
    expect(enFechaPublicada.status).toBe(200);
    expect(enFechaPublicada.cuerpo['deSalidaProgramada']).toBe(true);
    expect(enFechaPublicada.cuerpo['vigenciaDesde']).toBe(enFechaPublicada.cuerpo['vigenciaHasta']);
  });

  it('una fecha sin salida publicada cae en el rango, y se dice', async () => {
    // El 20 de octubre no hay salida publicada de ese pasadia, pero la campania sigue vigente:
    // cotiza igual y la respuesta declara que NO viene de una fecha publicada. Esa distincion es
    // la que permite a la pantalla decir «bajo consulta de cupo» en vez de prometer una fecha.
    const enRango = await cotizar({ paqueteId: paqueteConsota, fecha: '2026-10-20', adultos: 2 });
    expect(enRango.status).toBe(200);
    expect(enRango.cuerpo['deSalidaProgramada']).toBe(false);
    expect(enRango.cuerpo['vigenciaDesde']).not.toBe(enRango.cuerpo['vigenciaHasta']);
  });
});
