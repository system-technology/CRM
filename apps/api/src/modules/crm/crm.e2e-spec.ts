/**
 * La primera prueba que arranca la aplicación ENSAMBLADA.
 *
 * **Por qué existe, y no es una formalidad.** Este proyecto ya tiene la cicatriz: el
 * controlador del webhook de WhatsApp se construyó con **cero dependencias** porque Nest no se
 * quejó, y el fallo no apareció hasta la primera petición real. Ninguna de las pruebas con
 * dobles lo vio, porque un doble prueba la pieza y no el montaje.
 *
 * Lo que SÍ afirma, comprobado por mutación:
 *
 *   · que el `AppModule` real **se construye**. Verificado: al quitar un proveedor del módulo
 *     `crm`, las nueve pruebas de este archivo caen. Es la red que no existía;
 *   · que las rutas están mapeadas y responden;
 *   · que el middleware de tenant corta las que deben cortarse;
 *   · que un error de validación sale como 400 con el campo, y no como 500;
 *   · que la regla de pérdida se aplica **a través de HTTP**, no solo llamando al caso de uso.
 *
 * **Lo que NO afirma, y hay que decirlo porque yo mismo lo di por hecho hasta medirlo.**
 * Quitar el `@Inject` explícito del controlador del webhook —el defecto exacto de esta
 * mañana— **no pone esta prueba en rojo**. Vitest transpila con metadatos de decorador y el
 * servidor de desarrollo, con `tsx`, no: la inyección implícita funciona aquí y falla allí.
 *
 * O sea: esta prueba certifica el montaje bajo SU runtime, no bajo el de desarrollo. La única
 * forma de cubrir ese hueco es ejecutar la aplicación como se ejecuta de verdad —`pnpm build`
 * y arrancar el `dist`, o `tsx` en la misma configuración—. Queda en la cola con dueño
 * `devops`, y mientras tanto el `@Inject` explícito sigue siendo obligatorio por convención,
 * no por compuerta.
 *
 * **Habla con Neon de verdad.** No es un detalle: las políticas RLS son parte de lo que se
 * comprueba, y contra un doble no existen. Por eso el script de pruebas de `apps/api` carga
 * ahora `.env`, igual que el de `packages/database`.
 */

import 'reflect-metadata';

import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

/** Arrancar Nest y conectar con Neon no son milisegundos. */
const ARRANQUE_MS = 60_000;

let app: INestApplication;
let base: string;
let tenantId: string;

beforeAll(async () => {
  // El controlador del webhook lee este token en cada petición, no al construirse, así que
  // basta con ponerlo antes de arrancar. No es el de Meta y no sale de aquí.
  process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] ??= 'token-solo-de-esta-prueba';

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();

  // El tenant se saca de la propia aplicación en vez de escribirlo a mano: un identificador
  // copiado en la prueba deja de existir en cuanto alguien resiembra, y el fallo aparece como
  // «no autorizado» en vez de «la semilla cambió».
  const prisma = app.get(PrismaService);
  const agencias = await prisma.sinTenantPorqueEsPlataforma(
    'prueba e2e: localizar la agencia demo',
    (tx) => tx.tenant.findMany({ orderBy: { creadoEn: 'asc' }, take: 1, select: { id: true } }),
  );
  const primera = agencias[0];
  if (!primera) throw new Error('No hay ninguna agencia sembrada: corre `pnpm db:seed`.');
  tenantId = primera.id;
}, ARRANQUE_MS);

afterAll(async () => {
  await app?.close();
});

/** Cabeceras de una petición autenticada. En local el tenant llega por cabecera de desarrollo. */
function comoAgencia(extra: Record<string, string> = {}): Record<string, string> {
  return { 'x-dev-tenant-id': tenantId, 'content-type': 'application/json', ...extra };
}

describe('La aplicación ensamblada', () => {
  it('arranca con todos sus módulos', () => {
    // La aserción de la que cuelgan todas las demás. Si una dependencia no se puede resolver,
    // `beforeAll` ya habría reventado y esto no llegaría a correr.
    expect(app).toBeDefined();
    expect(base).toMatch(/^http:\/\//);
  });

  it('el webhook responde el apretón de manos: el controlador SÍ recibió sus dependencias', async () => {
    // Comprueba que el controlador del webhook está vivo y devuelve el challenge literal.
    // **Ojo con lo que esto NO prueba**: bajo vitest la inyección implícita funciona, así que
    // quitar el `@Inject` no lo pone en rojo. Ver la cabecera del archivo.
    const url = new URL('/webhooks/whatsapp', base);
    url.searchParams.set('hub.mode', 'subscribe');
    url.searchParams.set('hub.verify_token', process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] ?? '');
    url.searchParams.set('hub.challenge', '007');

    const r = await fetch(url);
    expect(r.status).toBe(200);
    // `007` y no `7`: si alguien lo convierte a número, Meta no da de alta la suscripción.
    expect(await r.text()).toBe('007');
  });
});

describe('GET /api/v1/crm/tablero', () => {
  it('devuelve las columnas que esta agencia tiene configuradas', async () => {
    const r = await fetch(new URL('/api/v1/crm/tablero', base), { headers: comoAgencia() });
    expect(r.status).toBe(200);

    const cuerpo = (await r.json()) as {
      columnas: { etapa: { id: string; nombre: string; esPerdida: boolean }; total: number }[];
    };
    expect(Array.isArray(cuerpo.columnas)).toBe(true);
    expect(cuerpo.columnas.length).toBeGreaterThan(0);

    // La etapa viaja entera, no como una cadena. Es lo que permite pintar el nombre que la
    // agencia le puso —la demo llama «Consulta nueva» a su primera etapa— en vez de una clave.
    const primera = cuerpo.columnas[0];
    expect(typeof primera?.etapa).toBe('object');
    expect(primera?.etapa.nombre.length).toBeGreaterThan(0);
  });

  it('SIN cabecera de tenant devuelve 401, no datos de nadie', async () => {
    const r = await fetch(new URL('/api/v1/crm/tablero', base), {
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(401);
  });
});

describe('GET /api/v1/crm/contactos', () => {
  it('lista los contactos de la agencia', async () => {
    const r = await fetch(new URL('/api/v1/crm/contactos', base), { headers: comoAgencia() });
    expect(r.status).toBe(200);
    const cuerpo = (await r.json()) as { datos: unknown[] };
    expect(Array.isArray(cuerpo.datos)).toBe(true);
  });

  it('la ficha de un contacto que no existe da 404 con su código', async () => {
    const r = await fetch(
      new URL('/api/v1/crm/contactos/00000000-0000-4000-8000-00000000dead/ficha', base),
      { headers: comoAgencia() },
    );
    expect(r.status).toBe(404);
    const cuerpo = (await r.json()) as { error: { code: string } };
    expect(cuerpo.error.code).toBe('CONTACTO_NO_ENCONTRADO');
  });
});

describe('PATCH /api/v1/crm/oportunidades/:id/etapa — las reglas, a través de HTTP', () => {
  const OPORTUNIDAD_CUALQUIERA = '00000000-0000-4000-8000-00000000c0de';

  it('un cuerpo inválido da 400 nombrando el campo, no 500', async () => {
    // Esto es exactamente lo que estaba roto: el controlador llamaba a `.parse()` a mano, el
    // ZodError no lo reconocía el filtro global, y el asesor recibía «ocurrió un error
    // inesperado» en vez de «falta la explicación».
    const r = await fetch(
      new URL(`/api/v1/crm/oportunidades/${OPORTUNIDAD_CUALQUIERA}/etapa`, base),
      {
        method: 'PATCH',
        headers: comoAgencia(),
        body: JSON.stringify({ etapaId: 'NO_ES_UN_UUID' }),
      },
    );
    expect(r.status).toBe(400);
    const cuerpo = (await r.json()) as {
      error: { code: string; details?: Record<string, string> };
    };
    expect(cuerpo.error.code).toBe('ENTRADA_INVALIDA');
    expect(Object.keys(cuerpo.error.details ?? {})).toContain('etapaId');
  });

  it('«OTRO» sin explicación da 400 y dice cuál es el campo', async () => {
    const r = await fetch(
      new URL(`/api/v1/crm/oportunidades/${OPORTUNIDAD_CUALQUIERA}/etapa`, base),
      {
        method: 'PATCH',
        headers: comoAgencia(),
        body: JSON.stringify({
          etapaId: '00000000-0000-4000-8000-0000000000e1',
          motivoPerdida: 'OTRO',
        }),
      },
    );
    expect(r.status).toBe(400);
    const cuerpo = (await r.json()) as { error: { details?: Record<string, string> } };
    expect(Object.keys(cuerpo.error.details ?? {})).toContain('notaPerdida');
  });

  it('una etapa de otra agencia no existe aquí', async () => {
    // Con RLS puesto, el identificador de otra agencia simplemente no se ve. Lo que se
    // comprueba es que la respuesta no insinúe que existe en algún sitio.
    const r = await fetch(
      new URL(`/api/v1/crm/oportunidades/${OPORTUNIDAD_CUALQUIERA}/etapa`, base),
      {
        method: 'PATCH',
        headers: comoAgencia(),
        body: JSON.stringify({ etapaId: '00000000-0000-4000-8000-00000000beef' }),
      },
    );
    // 404 de la oportunidad o 400 de la etapa: las dos son correctas y ninguna devuelve datos.
    expect([400, 404]).toContain(r.status);
    expect(r.status).not.toBe(500);
  });
});
