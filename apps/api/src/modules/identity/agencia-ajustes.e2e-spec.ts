/**
 * `GET /api/v1/agencia/ajustes` contra PostgreSQL con RLS: dos agencias, cada una lee solo la suya
 * (zona horaria, moneda y país propios). El PATCH cambia la zona por la función SECURITY DEFINER
 * (ADR-0027) y no toca a la otra agencia. El 403 sin `usuarios.administrar` no se puede probar por
 * HTTP (el atajo de desarrollo concede todos los permisos): lo fija `agencia-ajustes.controller.spec.ts`.
 *
 * T-261: el RNT vive en `perfiles_de_agencia`. Aquí se prueba, por HTTP y contra la base: que cada
 * agencia lee y escribe solo el suyo, que ningún cuerpo puede fijar la verificación, y que solo la
 * plataforma (el dueño de la tabla, `adminPg`) la pone y el cambio de RNT la anula.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { AjustesDeAgencia } from '@viajapro/contracts';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../app.module.js';
import { DominioExcepcionFilter } from '../../shared/filtros/dominio-excepcion.filter.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const USUARIO = randomUUID();

let app: INestApplication;
let base: string;
let admin: PrismaClient;
let adminPg: Client;

const leer = (tenantId: string) =>
  fetch(new URL('/api/v1/agencia/ajustes', base), {
    headers: { 'x-dev-tenant-id': tenantId, 'x-dev-usuario-id': USUARIO },
  });

const cambiar = (tenantId: string, cuerpo: unknown) =>
  fetch(new URL('/api/v1/agencia/ajustes', base), {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-dev-tenant-id': tenantId,
      'x-dev-usuario-id': USUARIO,
    },
    body: JSON.stringify(cuerpo),
  });

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  await admin.tenant.create({
    data: {
      id: TENANT_A,
      slug: `fixture-aislamiento-zona-a-${TENANT_A.slice(-8)}`,
      nombre: 'Agencia A',
    },
  });
  await admin.tenant.create({
    data: {
      id: TENANT_B,
      slug: `fixture-aislamiento-zona-b-${TENANT_B.slice(-8)}`,
      nombre: 'Agencia B',
      paisIso: 'MX',
      monedaIso: 'MXN',
      zonaHoraria: 'America/Mexico_City',
    },
  });

  Logger.overrideLogger(false);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalFilters(new DominioExcepcionFilter());
  await app.listen(0);
  base = await app.getUrl();
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
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('GET /api/v1/agencia/ajustes', () => {
  it('cada agencia lee solo la suya', async () => {
    const a = await leer(TENANT_A);
    expect(a.status).toBe(200);
    expect(AjustesDeAgencia.parse(await a.json())).toEqual({
      nombre: 'Agencia A',
      paisIso: 'CO',
      monedaIso: 'COP',
      zonaHoraria: 'America/Bogota',
      rnt: null,
      rntVerificado: false,
    });
    const b = AjustesDeAgencia.parse(await (await leer(TENANT_B)).json());
    expect(b).toMatchObject({ nombre: 'Agencia B', zonaHoraria: 'America/Mexico_City' });
  });

  it('sin agencia en el contexto no responde 200', async () => {
    const r = await fetch(new URL('/api/v1/agencia/ajustes', base));
    expect(r.status).not.toBe(200);
  });
});

describe('PATCH /api/v1/agencia/ajustes', () => {
  it('cambia la zona de la agencia A y no toca a la B', async () => {
    const r = await cambiar(TENANT_A, { zonaHoraria: 'America/Lima' });
    expect(r.status).toBe(200);
    expect(AjustesDeAgencia.parse(await r.json())).toMatchObject({
      nombre: 'Agencia A',
      zonaHoraria: 'America/Lima',
    });
    const a = AjustesDeAgencia.parse(await (await leer(TENANT_A)).json());
    expect(a.zonaHoraria).toBe('America/Lima');
    const b = AjustesDeAgencia.parse(await (await leer(TENANT_B)).json());
    expect(b.zonaHoraria).toBe('America/Mexico_City');
  });

  it('zona inexistente: 422 ZONA_HORARIA_INVALIDA y la zona no cambia', async () => {
    // Estado propio: no depender del orden de las pruebas.
    expect((await cambiar(TENANT_A, { zonaHoraria: 'America/Lima' })).status).toBe(200);
    const r = await cambiar(TENANT_A, { zonaHoraria: 'Marte/Olympus_Mons' });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ error: { code: 'ZONA_HORARIA_INVALIDA' } });
    const a = AjustesDeAgencia.parse(await (await leer(TENANT_A)).json());
    expect(a.zonaHoraria).toBe('America/Lima');
  });

  it('un alias que Intl no conoce (posix/) también es 422', async () => {
    const r = await cambiar(TENANT_A, { zonaHoraria: 'posix/America/Bogota' });
    expect(r.status).toBe(422);
  });

  it('cuerpo con campos ajenos o sin espacios válidos: 4xx y B intacta', async () => {
    const r = await cambiar(TENANT_A, { zonaHoraria: 'America/Lima', tenantId: TENANT_B });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    const b = AjustesDeAgencia.parse(await (await leer(TENANT_B)).json());
    expect(b.zonaHoraria).toBe('America/Mexico_City');
  });
});

describe('RNT en /api/v1/agencia/ajustes (T-261)', () => {
  const ajustes = async (tenantId: string) =>
    AjustesDeAgencia.parse(await (await leer(tenantId)).json());

  /**
   * La plataforma verifica el RNT que COMPROBÓ: `AND rnt = $2` y exigir una fila, para no
   * verificar un RNT que la agencia cambió entre la comprobación y el UPDATE. Como el dueño de la
   * tabla no se salta RLS si no es superusuario, se fija el contexto de la agencia.
   */
  const verificarComoPlataforma = async (tenantId: string, rnt: string) => {
    await adminPg.query('BEGIN');
    try {
      await adminPg.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
      const r = await adminPg.query(
        'UPDATE perfiles_de_agencia SET verificado_en = now() WHERE tenant_id = $1 AND rnt = $2',
        [tenantId, rnt],
      );
      expect(r.rowCount).toBe(1);
      await adminPg.query('COMMIT');
    } catch (error) {
      await adminPg.query('ROLLBACK');
      throw error;
    }
  };

  it('una agencia sin perfil: rnt nulo y sin verificar', async () => {
    expect(await ajustes(TENANT_B)).toMatchObject({ rnt: null, rntVerificado: false });
  });

  it('guarda el RNT de la agencia A, sale sin verificar y no aparece en la B', async () => {
    const r = await cambiar(TENANT_A, { rnt: '48213' });
    expect(r.status).toBe(200);
    expect(AjustesDeAgencia.parse(await r.json())).toMatchObject({
      rnt: '48213',
      rntVerificado: false,
    });
    expect(await ajustes(TENANT_A)).toMatchObject({ rnt: '48213', rntVerificado: false });
    expect(await ajustes(TENANT_B)).toMatchObject({ rnt: null, rntVerificado: false });
  });

  it('la agencia B escribe el suyo y el de A queda intacto', async () => {
    expect((await cambiar(TENANT_A, { rnt: '48213' })).status).toBe(200);
    expect((await cambiar(TENANT_B, { rnt: '99999' })).status).toBe(200);
    expect(await ajustes(TENANT_A)).toMatchObject({ rnt: '48213' });
    expect(await ajustes(TENANT_B)).toMatchObject({ rnt: '99999' });
  });

  it.each(['ABC', '12 34', '48.213', '12345678901', ''])(
    'RNT inválido %j: 4xx y el guardado no cambia',
    async (malo) => {
      expect((await cambiar(TENANT_A, { rnt: '48213' })).status).toBe(200);
      const r = await cambiar(TENANT_A, { rnt: malo });
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
      expect(await ajustes(TENANT_A)).toMatchObject({ rnt: '48213' });
    },
  );

  it('ningún cuerpo puede fijar la verificación: 4xx y sigue sin verificar', async () => {
    expect((await cambiar(TENANT_A, { rnt: '48213' })).status).toBe(200);
    for (const cuerpo of [
      { rnt: '48213', rntVerificado: true },
      { rnt: '48213', verificadoEn: '2026-11-20T12:00:00Z' },
      { rnt: '48213', verificado_en: '2026-11-20T12:00:00Z' },
      { rntVerificado: true },
    ]) {
      const r = await cambiar(TENANT_A, cuerpo);
      expect(r.status, JSON.stringify(cuerpo)).toBeGreaterThanOrEqual(400);
      expect(r.status, JSON.stringify(cuerpo)).toBeLessThan(500);
    }
    expect(await ajustes(TENANT_A)).toMatchObject({ rnt: '48213', rntVerificado: false });
  });

  it('la plataforma verifica; guardar lo mismo o tocar la zona conserva la verificación; cambiar el RNT la anula', async () => {
    expect((await cambiar(TENANT_A, { rnt: '48213' })).status).toBe(200);
    await verificarComoPlataforma(TENANT_A, '48213');
    expect(await ajustes(TENANT_A)).toMatchObject({ rnt: '48213', rntVerificado: true });

    // Guardar el MISMO RNT no la pierde (el upsert de la API escribe rnt y actualizado_en)...
    expect((await cambiar(TENANT_A, { rnt: '48213' })).status).toBe(200);
    expect(await ajustes(TENANT_A)).toMatchObject({ rnt: '48213', rntVerificado: true });
    // ...ni cambiar solo la zona horaria...
    expect((await cambiar(TENANT_A, { zonaHoraria: 'America/Lima' })).status).toBe(200);
    expect(await ajustes(TENANT_A)).toMatchObject({ rnt: '48213', rntVerificado: true });
    // ...y la verificación de A no se filtra a la agencia B.
    expect(await ajustes(TENANT_B)).toMatchObject({ rntVerificado: false });

    // Cambiar el RNT la deja sin verificar.
    const r = await cambiar(TENANT_A, { rnt: '48214' });
    expect(AjustesDeAgencia.parse(await r.json())).toMatchObject({
      rnt: '48214',
      rntVerificado: false,
    });
  });

  it('rnt: null borra el RNT y la verificación', async () => {
    expect((await cambiar(TENANT_A, { rnt: '48213' })).status).toBe(200);
    await verificarComoPlataforma(TENANT_A, '48213');
    const r = await cambiar(TENANT_A, { rnt: null });
    expect(r.status).toBe(200);
    expect(AjustesDeAgencia.parse(await r.json())).toMatchObject({
      rnt: null,
      rntVerificado: false,
    });
  });

  it('con zona y RNT en el mismo cuerpo se guardan los dos; con zona inválida no se guarda ni el RNT', async () => {
    expect((await cambiar(TENANT_A, { rnt: '11111' })).status).toBe(200);
    const bien = await cambiar(TENANT_A, { zonaHoraria: 'America/Lima', rnt: '22222' });
    expect(bien.status).toBe(200);
    expect(AjustesDeAgencia.parse(await bien.json())).toMatchObject({
      zonaHoraria: 'America/Lima',
      rnt: '22222',
    });
    const mal = await cambiar(TENANT_A, { zonaHoraria: 'Marte/Olympus_Mons', rnt: '33333' });
    expect(mal.status).toBe(422);
    expect(await ajustes(TENANT_A)).toMatchObject({ zonaHoraria: 'America/Lima', rnt: '22222' });
  });
});
