/**
 * e2e de T-075 y T-077 contra la aplicación ensamblada. Escrito pero NO ejecutado en el PR que lo
 * introdujo: necesita Postgres con la agencia demo sembrada (`pnpm db:migrate && pnpm db:seed`),
 * igual que `crm.e2e-spec.ts`.
 */
import 'reflect-metadata';

import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

let app: INestApplication;
let base: string;
let tenantId: string;

beforeAll(async () => {
  process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] ??= 'token-solo-de-esta-prueba';
  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();
  const agencias = await app
    .get(PrismaService)
    .sinTenantPorqueEsPlataforma('prueba e2e: localizar la agencia demo', (tx) =>
      tx.tenant.findMany({ orderBy: { creadoEn: 'asc' }, take: 1, select: { id: true } }),
    );
  const primera = agencias[0];
  if (!primera) throw new Error('No hay ninguna agencia sembrada: corre `pnpm db:seed`.');
  tenantId = primera.id;
}, 60_000);

afterAll(async () => {
  await app?.close();
});

const cabeceras = (): Record<string, string> => ({
  'x-dev-tenant-id': tenantId,
  'content-type': 'application/json',
});

const enviar = (ruta: string, metodo: string, cuerpo?: unknown): Promise<Response> =>
  fetch(new URL(ruta, base), {
    method: metodo,
    headers: cabeceras(),
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });

describe('contactos y oportunidades (T-075)', () => {
  const telefono = `+5730${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  let contactoId = '';

  it('crea un contacto normalizando el teléfono y rechaza el duplicado con 409', async () => {
    const r = await enviar('/api/v1/crm/contactos', 'POST', {
      telefono: telefono.replace('+57', '+57 '),
      nombre: 'Prueba e2e',
    });
    expect(r.status).toBe(201);
    const c = (await r.json()) as { id: string; telefono: string };
    expect(c.telefono).toBe(telefono);
    contactoId = c.id;

    const dup = await enviar('/api/v1/crm/contactos', 'POST', { telefono });
    expect(dup.status).toBe(409);
  });

  it('un teléfono sin código de país es 422 o 400, nunca 201', async () => {
    const r = await enviar('/api/v1/crm/contactos', 'POST', { telefono: '3001234567' });
    expect([400, 422]).toContain(r.status);
  });

  it('edita parcialmente', async () => {
    const r = await enviar(`/api/v1/crm/contactos/${contactoId}`, 'PATCH', { nombre: 'Editado' });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { nombre: string }).nombre).toBe('Editado');
  });

  it('crea una oportunidad en la etapa inicial', async () => {
    const r = await enviar('/api/v1/crm/oportunidades', 'POST', {
      contactoId,
      titulo: 'Oportunidad e2e',
    });
    expect(r.status).toBe(201);
  });

  it('una conversación inexistente es 404', async () => {
    const r = await enviar(
      '/api/v1/crm/conversaciones/00000000-0000-4000-8000-000000000000/oportunidades',
      'POST',
      { titulo: 'X' },
    );
    expect(r.status).toBe(404);
  });
});

describe('seguimientos (T-077)', () => {
  it('pendientes del día responde con la forma del contrato', async () => {
    const r = await enviar('/api/v1/crm/seguimientos/pendientes-del-dia', 'GET');
    expect(r.status).toBe(200);
    const c = (await r.json()) as { fecha: string; vencidos: unknown[]; deHoy: unknown[] };
    expect(c.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(c.vencidos)).toBe(true);
    expect(Array.isArray(c.deHoy)).toBe(true);
  });

  it('crear sin oportunidad ni conversación es 400', async () => {
    const r = await enviar('/api/v1/crm/seguimientos', 'POST', {
      descripcion: 'x',
      venceEn: new Date().toISOString(),
    });
    expect(r.status).toBe(400);
  });

  it('sobre una conversación inexistente responde 404', async () => {
    const r = await enviar('/api/v1/crm/seguimientos', 'POST', {
      descripcion: 'x',
      venceEn: new Date().toISOString(),
      conversacionId: '00000000-0000-4000-8000-000000000000',
    });
    expect(r.status).toBe(404);
  });
});
