/**
 * El alta del canal de prueba contra Neon, sin red de Meta: recorre el camino real del ADR-0008
 * (`viajapro_app` bajo RLS para cuenta y canal; `viajapro_altas` para el directorio) y comprueba
 * con el rol del trabajador que el número resuelve a SU agencia, que otra agencia no lo ve (R1),
 * que repetirlo no cambia nada y que otra agencia no puede quedarse con un número ya asignado.
 *
 * La pimienta se lee del entorno porque el directorio real se calcula con ella; los
 * identificadores son de ESTA prueba (aleatorios), no los de Meta.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolverCadena } from '../../../shared/prisma/guardia-de-rol.js';
import { claveDeEnrutamiento } from '../domain/clave-de-enrutamiento.js';
import {
  registrarCanalDePrueba,
  RegistroDeCanalDePruebaError,
} from './registro-de-canal-de-prueba.js';

const PIMIENTA = process.env['WHATSAPP_DIRECTORY_PEPPER'] ?? '';
const VERSION = Number(process.env['WHATSAPP_DIRECTORY_PEPPER_VERSION'] ?? '1');
const numero = (): string => String(Math.floor(Math.random() * 9e14) + 1e14);

const TENANT_A = `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_B = `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const SLUG_A = `fixture-aislamiento-canal-prueba-${TENANT_A.slice(-12)}`;
const SLUG_B = `fixture-aislamiento-canal-prueba-${TENANT_B.slice(-12)}`;
const PN = numero();
const WABA_A = numero();
const WABA_B = numero();

let admin: Client;
let app: PrismaClient;
let altas: PrismaClient;

const registrar = (slug: string, wabaId: string) =>
  registrarCanalDePrueba({
    app,
    altas,
    slugDeLaAgencia: slug,
    wabaId,
    phoneNumberId: PN,
    pimienta: PIMIENTA,
    pimientaVersion: VERSION,
  });

/** Lo que resuelve el trabajador (único rol con `resolver_enrutamiento`) para este número. */
async function resolver(): Promise<{ tenant: string; canal: string } | null> {
  await admin.query('BEGIN');
  try {
    await admin.query('SET LOCAL ROLE "viajapro_webhook"');
    const r = await admin.query(
      'SELECT tenant_resuelto_id, canal_id FROM resolver_enrutamiento($1)',
      [claveDeEnrutamiento(PIMIENTA, 'pn', PN)],
    );
    const fila = r.rows[0];
    return fila ? { tenant: fila.tenant_resuelto_id, canal: fila.canal_id } : null;
  } finally {
    await admin.query('ROLLBACK');
  }
}

async function canalesVistosPor(tenant: string): Promise<number> {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${tenant}::text, true)`;
    return tx.canal.count({ where: { phoneNumberId: PN } });
  });
}

beforeAll(async () => {
  if (!PIMIENTA) throw new Error('Falta WHATSAPP_DIRECTORY_PEPPER: sin ella no hay directorio.');
  admin = new Client({ connectionString: process.env['DATABASE_URL'] });
  await admin.connect();
  const bd = await admin.query('SELECT current_database() AS db');
  if (bd.rows[0].db !== 'neondb') throw new Error(`Base inesperada: ${bd.rows[0].db}.`);
  for (const [id, slug] of [
    [TENANT_A, SLUG_A],
    [TENANT_B, SLUG_B],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en)
       VALUES ($1, $2, $3, now(), now())`,
      [id, slug, `Agencia ${randomUUID().slice(0, 8)} del canal de prueba`],
    );
  }
  app = new PrismaClient({
    datasources: { db: { url: resolverCadena(process.env, 'DATABASE_APP_URL') } },
  });
  altas = new PrismaClient({
    datasources: { db: { url: resolverCadena(process.env, 'DATABASE_ALTAS_URL') } },
  });
});

afterAll(async () => {
  await app?.$disconnect();
  await altas?.$disconnect();
  if (admin) {
    try {
      await admin.query('SET ROLE "viajapro_enrutador"');
      await admin.query('DELETE FROM enrutamiento_canales WHERE tenant_resuelto_id = ANY($1)', [
        [TENANT_A, TENANT_B],
      ]);
      await admin.query('RESET ROLE');
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await admin.query('BEGIN');
      await modulo.borrarTenants(admin, [TENANT_A, TENANT_B]);
      await admin.query('COMMIT');
    } finally {
      await admin.end();
    }
  }
});

describe('registro del canal de prueba', () => {
  it('antes del alta, el número no resuelve a ninguna agencia', async () => {
    expect(await resolver()).toBeNull();
  });

  it('registra el canal: el número resuelve a la agencia, y otra agencia no lo ve', async () => {
    const r = await registrar(SLUG_A, WABA_A);
    expect(await resolver()).toEqual({ tenant: TENANT_A, canal: r.canalId });
    expect(await canalesVistosPor(TENANT_A)).toBe(1);
    expect(await canalesVistosPor(TENANT_B)).toBe(0);
  });

  it('es idempotente: repetirlo deja el mismo estado', async () => {
    const primero = await resolver();
    const otra = await registrar(SLUG_A, WABA_A);
    expect(otra.canalId).toBe(primero?.canal);
    expect(await resolver()).toEqual(primero);
    expect(await canalesVistosPor(TENANT_A)).toBe(1);
  });

  it('se niega si el número ya está asociado a otra agencia, y el directorio no cambia', async () => {
    const antes = await resolver();
    await expect(registrar(SLUG_B, WABA_B)).rejects.toBeInstanceOf(RegistroDeCanalDePruebaError);
    expect(await resolver()).toEqual(antes);
  });
});
