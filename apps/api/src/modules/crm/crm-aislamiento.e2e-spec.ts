/**
 * T-197: aislamiento HTTP entre agencias en las MUTACIONES del CRM, con la aplicación ensamblada y
 * dos agencias de fixture. La agencia B usa ids reales de la A y debe recibir 404 (el filtro global
 * traduce `*_NO_ENCONTRAD[OA]` a 404; mismo error para «no existe» y «no la ves»), y la fila de A
 * debe quedar intacta, comprobado LEYENDO COMO A por la propia API.
 *
 * Necesita Postgres migrado (`DATABASE_URL`) y `APP_ENV=local`, igual que `etapas.e2e-spec.ts`.
 * El atajo `x-dev-tenant-id` concede todos los permisos: aquí se prueba RLS/filtrado, no roles.
 */
import 'reflect-metadata';

import { randomBytes } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Contacto,
  EtapaDefinida,
  FichaDeContacto,
  Oportunidad,
  Seguimiento,
} from '@viajapro/contracts';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();

let app: INestApplication;
let base: string;
let admin: Client;

/** Lo que A tiene sembrado vía API, y que B va a intentar tocar con sus ids. */
const deA = {
  contacto: null as unknown as Contacto,
  oportunidad: null as unknown as Oportunidad,
  seguimiento: null as unknown as Seguimiento,
  etapaGanadaId: '',
  etapaInicialId: '',
};
const deB = { contactoId: '' };

const consentimiento = {
  finalidad: 'TRANSACCIONAL',
  canal: 'whatsapp',
  prueba: 'whatsapp:wamid.aislamiento',
  textoMostrado: 'Autorizo el tratamiento de mis datos para atender mi solicitud de viaje.',
  versionAviso: 'v0-borrador',
};

const como = (tenant: string, ruta: string, metodo: string, cuerpo?: unknown): Promise<Response> =>
  fetch(new URL(ruta, base), {
    method: metodo,
    headers: { 'x-dev-tenant-id': tenant, 'content-type': 'application/json' },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

const telefono = (): string => `+5730${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

async function crear<T>(tenant: string, ruta: string, cuerpo: unknown): Promise<T> {
  const r = await como(tenant, ruta, 'POST', cuerpo);
  if (r.status !== 201) throw new Error(`Fixture ${ruta} dio ${r.status}: ${await r.text()}`);
  return (await r.json()) as T;
}

/** La ficha de A leída como A: contacto, oportunidad actual y consentimientos. */
async function fichaDeA(): Promise<FichaDeContacto> {
  const r = await como(TENANT_A, `/api/v1/crm/contactos/${deA.contacto.id}/ficha`, 'GET');
  expect(r.status).toBe(200);
  return FichaDeContacto.parse(await r.json());
}

async function seguimientoDeA(): Promise<Seguimiento> {
  const r = await como(
    TENANT_A,
    `/api/v1/crm/seguimientos?estado=TODOS&oportunidadId=${deA.oportunidad.id}`,
    'GET',
  );
  expect(r.status).toBe(200);
  const { datos } = (await r.json()) as { datos: unknown[] };
  const fila = datos.map((d) => Seguimiento.parse(d)).find((s) => s.id === deA.seguimiento.id);
  if (!fila) throw new Error('El seguimiento de A desapareció');
  return fila;
}

async function etapasDe(tenant: string): Promise<EtapaDefinida[]> {
  const r = await como(tenant, '/api/v1/crm/etapas', 'GET');
  return ((await r.json()) as unknown[]).map((e) => EtapaDefinida.parse(e));
}

beforeAll(async () => {
  process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] ??= 'token-solo-de-esta-prueba';
  admin = new Client({ connectionString: process.env['DATABASE_URL'] });
  await admin.connect();
  const bd = await admin.query('SELECT current_database() AS db');
  if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);
  for (const [id, letra] of [
    [TENANT_A, 'a'],
    [TENANT_B, 'b'],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
      [id, `fixture-crm-aisl-${letra}-${id.slice(-8)}`, `Agencia ${letra}`],
    );
    await admin.query(
      `INSERT INTO etapas_pipeline (id, tenant_id, nombre, orden, es_ganada, es_perdida) VALUES
         (gen_random_uuid(), $1, 'Nuevo', 0, false, false),
         (gen_random_uuid(), $1, 'Cerrada', 1, true, false)`,
      [id],
    );
  }

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();

  // Fixture de A, por la propia API: contacto con consentimiento, oportunidad y seguimiento.
  deA.contacto = Contacto.parse(
    await crear(TENANT_A, '/api/v1/crm/contactos', { telefono: telefono(), nombre: 'Original A' }),
  );
  await crear(TENANT_A, `/api/v1/crm/contactos/${deA.contacto.id}/consentimientos`, consentimiento);
  deA.oportunidad = Oportunidad.parse(
    await crear(TENANT_A, '/api/v1/crm/oportunidades', {
      contactoId: deA.contacto.id,
      titulo: 'Oportunidad de A',
    }),
  );
  deA.etapaInicialId = deA.oportunidad.etapa.id;
  const etapasA = await etapasDe(TENANT_A);
  const ganada = etapasA.find((e) => e.nombre === 'Cerrada');
  if (!ganada) throw new Error('No se sembró la etapa ganada de A');
  deA.etapaGanadaId = ganada.id;
  deA.seguimiento = Seguimiento.parse(
    await crear(TENANT_A, '/api/v1/crm/seguimientos', {
      descripcion: 'Llamar a la clienta de A',
      venceEn: new Date(Date.now() + 86_400_000).toISOString(),
      oportunidadId: deA.oportunidad.id,
    }),
  );

  // Un contacto de B, para el caso «B crea una oportunidad con su propio contacto» (control).
  deB.contactoId = Contacto.parse(
    await crear(TENANT_B, '/api/v1/crm/contactos', { telefono: telefono() }),
  ).id;
}, 90_000);

afterAll(async () => {
  await app?.close();
  if (admin) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(new URL(ruta, import.meta.url).href)) as {
        borrarTenants: Limpiador;
      };
      await admin.query('BEGIN');
      await modulo.borrarTenants(admin, [TENANT_A, TENANT_B]);
      await admin.query('COMMIT');
    } finally {
      await admin.end();
    }
  }
});

describe('aislamiento entre agencias en las mutaciones del CRM (T-197)', () => {
  it('B no puede editar un contacto de A: 404 y el contacto de A queda intacto', async () => {
    const r = await como(TENANT_B, `/api/v1/crm/contactos/${deA.contacto.id}`, 'PATCH', {
      nombre: 'Hackeado por B',
      correo: 'b@ajeno.test',
      etiquetas: ['VIP-de-B'],
    });
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      'CONTACTO_NO_ENCONTRADO',
    );

    const { contacto } = await fichaDeA();
    expect(contacto.nombre).toBe('Original A');
    expect(contacto.correo).toBeNull();
    expect(contacto.etiquetas).toEqual([]);
  });

  it('B no ve la ficha de un contacto de A: 404 sin datos', async () => {
    const r = await como(TENANT_B, `/api/v1/crm/contactos/${deA.contacto.id}/ficha`, 'GET');
    expect(r.status).toBe(404);
    const texto = await r.text();
    expect(texto).not.toContain('Original A');
    expect(texto).not.toContain(deA.contacto.telefono);
  });

  it('el listado de contactos de B no incluye los de A', async () => {
    const r = await como(TENANT_B, '/api/v1/crm/contactos', 'GET');
    const { datos } = (await r.json()) as { datos: { id: string }[] };
    expect(datos.map((c) => c.id)).not.toContain(deA.contacto.id);
  });

  it('B no puede otorgar un consentimiento a un contacto de A: 404 y no cambia los de A', async () => {
    const r = await como(
      TENANT_B,
      `/api/v1/crm/contactos/${deA.contacto.id}/consentimientos`,
      'POST',
      { ...consentimiento, finalidad: 'PROMOCIONAL' },
    );
    expect(r.status).toBe(404);
    expect((await fichaDeA()).contacto.consentimientos).toEqual(['TRANSACCIONAL']);
  });

  it('B no puede revocar el consentimiento de un contacto de A: 404 y A conserva el suyo', async () => {
    const r = await como(
      TENANT_B,
      `/api/v1/crm/contactos/${deA.contacto.id}/consentimientos/revocar`,
      'POST',
      { finalidad: 'TRANSACCIONAL' },
    );
    expect(r.status).toBe(404);
    // Si esto fallara, el trabajador de envíos dejaría de escribirle a la clienta de A por una
    // orden de otra agencia.
    expect((await fichaDeA()).contacto.consentimientos).toEqual(['TRANSACCIONAL']);
  });

  it('B no puede completar un seguimiento de A: 404 y sigue pendiente', async () => {
    const r = await como(
      TENANT_B,
      `/api/v1/crm/seguimientos/${deA.seguimiento.id}/completar`,
      'POST',
    );
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      'SEGUIMIENTO_NO_ENCONTRADO',
    );
    const despues = await seguimientoDeA();
    expect(despues.completadoEn).toBeNull();
  });

  it('el listado de seguimientos de B no incluye los de A', async () => {
    const r = await como(TENANT_B, '/api/v1/crm/seguimientos?estado=TODOS', 'GET');
    const { datos } = (await r.json()) as { datos: { id: string }[] };
    expect(datos.map((s) => s.id)).not.toContain(deA.seguimiento.id);
  });

  it('B no puede mover una oportunidad de A a una etapa de A: 404 y no cambia de etapa', async () => {
    const r = await como(
      TENANT_B,
      `/api/v1/crm/oportunidades/${deA.oportunidad.id}/etapa`,
      'PATCH',
      {
        etapaId: deA.etapaGanadaId,
      },
    );
    expect(r.status).toBe(404);
    expect((await fichaDeA()).oportunidadActual?.etapa.id).toBe(deA.etapaInicialId);
  });

  it('B no puede mover una oportunidad de A a una etapa propia: 404 y A no cambia', async () => {
    const etapaDeB = (await etapasDe(TENANT_B))[1];
    const r = await como(
      TENANT_B,
      `/api/v1/crm/oportunidades/${deA.oportunidad.id}/etapa`,
      'PATCH',
      {
        etapaId: etapaDeB?.id,
      },
    );
    expect(r.status).toBe(404);
    expect((await fichaDeA()).oportunidadActual?.etapa.id).toBe(deA.etapaInicialId);
  });

  it('B no puede crear una oportunidad sobre un contacto de A: 404 y A no gana oportunidades', async () => {
    const antes = (await fichaDeA()).oportunidadActual?.id;
    const r = await como(TENANT_B, '/api/v1/crm/oportunidades', 'POST', {
      contactoId: deA.contacto.id,
      titulo: 'Colada de B',
    });
    expect(r.status).toBe(404);
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe(
      'CONTACTO_NO_ENCONTRADO',
    );
    expect((await fichaDeA()).oportunidadActual?.id).toBe(antes);

    // Ninguna fila nueva en ninguna agencia con ese título (leído como superusuario).
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM oportunidades WHERE titulo = 'Colada de B'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('control: B sí crea una oportunidad sobre su propio contacto (el 404 no es un 404 universal)', async () => {
    const r = await como(TENANT_B, '/api/v1/crm/oportunidades', 'POST', {
      contactoId: deB.contactoId,
      titulo: 'Propia de B',
    });
    expect(r.status).toBe(201);
  });

  it('B no puede crear un seguimiento sobre una oportunidad de A: 404', async () => {
    const r = await como(TENANT_B, '/api/v1/crm/seguimientos', 'POST', {
      descripcion: 'Seguimiento colado',
      venceEn: new Date(Date.now() + 86_400_000).toISOString(),
      oportunidadId: deA.oportunidad.id,
    });
    expect(r.status).toBe(404);
    const { rows } = await admin.query(
      `SELECT count(*)::int AS n FROM seguimientos WHERE descripcion = 'Seguimiento colado'`,
    );
    expect(rows[0].n).toBe(0);
  });
});
