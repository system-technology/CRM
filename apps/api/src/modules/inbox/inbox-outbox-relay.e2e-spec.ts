/**
 * El relay del outbox contra PostgreSQL, con el rol del trabajador (`viajapro_webhook`) y RLS.
 *
 * El mensaje entrante escribe su evento en el outbox EN LA MISMA transacción (`BandejaPrisma`);
 * el relay lo lee de ahí, lo publica y lo marca. Afirma:
 *   · el evento sale una vez, con solo identificadores (ni texto ni teléfono), y queda marcado;
 *   · si publicar falla, NADA queda marcado y el siguiente intento lo publica;
 *   · vaciar una agencia no toca los eventos de otra (RLS);
 *   · dos relés a la vez no publican lo mismo (`FOR UPDATE SKIP LOCKED`);
 *   · el barrido recorre las agencias y encuentra lo que un aviso perdido dejó.
 *
 * Sin Redis: el publicador es un doble que apunta los eventos.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContactosDeCrm } from '../crm/infrastructure/puertos-de-crm.prisma.js';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { RelevarOutbox } from './application/relevar-outbox.js';
import { PuertoPublicadorDeEventos } from './application/puertos-de-eventos.js';
import type { EventoDeDominio } from './domain/evento-de-dominio.js';
import { TIPO_MENSAJE_RECIBIDO } from './domain/evento-de-dominio.js';
import { BandejaPrisma } from './infrastructure/bandeja.prisma.js';
import { OutboxPrisma } from './infrastructure/outbox.prisma.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const TEXTO_PRIVADO = `Pasaporte AB${randomBytes(3).toString('hex')} de la viajera`;

let admin: PrismaClient;
let adminPg: Client;
let prismaWebhook: PrismaWebhookService;
let bandeja: BandejaPrisma;
let outbox: OutboxAcotado;
const canal: Record<'A' | 'B', string> = { A: '', B: '' };

/**
 * El barrido de verdad recorre TODAS las agencias activas de la base, y esta es compartida: un
 * barrido de prueba marcaría como publicados (en un doble) los eventos de agencias ajenas. Se
 * acota a las dos de fixture.
 */
class OutboxAcotado extends OutboxPrisma {
  override tenantsParaBarrer(): Promise<string[]> {
    return Promise.resolve([TENANT_A, TENANT_B]);
  }
}

class Apunta extends PuertoPublicadorDeEventos {
  publicados: EventoDeDominio[] = [];
  fallar = false;
  publicar(evento: EventoDeDominio): Promise<void> {
    if (this.fallar) return Promise.reject(new Error('Redis caído'));
    this.publicados.push(evento);
    return Promise.resolve();
  }
}

async function agencia(id: string, sufijo: string): Promise<string> {
  await admin.tenant.create({
    data: { id, slug: `fixture-aislamiento-outbox-${id.slice(-12)}`, nombre: `Agencia ${sufijo}` },
  });
  const cuenta = await admin.cuentaWhatsapp.create({
    data: { tenantId: id, wabaId: `waba-ob-${randomBytes(4).toString('hex')}`, nombre: 'WABA' },
  });
  const c = await admin.canal.create({
    data: {
      tenantId: id,
      cuentaId: cuenta.id,
      phoneNumberId: String(Math.floor(Math.random() * 9e14) + 1e14),
      numeroE164: `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`,
    },
  });
  return c.id;
}

/** Un mensaje entrante por el camino real: escribe mensaje, conversación y evento. */
async function entrante(tenantId: string, canalId: string): Promise<void> {
  const r = await bandeja.registrarEntrante(tenantId, canalId, {
    wamid: `wamid.ob.${randomUUID()}`,
    deTelefono: `+57302${Math.floor(Math.random() * 9e6 + 1e6)}`,
    nombrePerfil: 'Viajera',
    instante: new Date(),
    tipo: 'TEXTO',
    texto: TEXTO_PRIVADO,
    medioId: null,
    nombreArchivo: null,
    mimeType: null,
    respondeA: null,
    reaccionaA: null,
  });
  expect(r).toBe('CREADO');
}

const pendientes = async (tenantId: string): Promise<number> =>
  Number(
    (
      await adminPg.query<{ n: string }>(
        'SELECT count(*) AS n FROM outbox WHERE tenant_id = $1 AND publicado_en IS NULL',
        [tenantId],
      )
    ).rows[0]?.n,
  );

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: process.env['DATABASE_URL'] ?? '' } } });
  const [bd] = await admin.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (bd?.db !== 'neondb') throw new Error(`Base inesperada: ${bd?.db}. No se escribe.`);
  adminPg = new Client({ connectionString: process.env['DATABASE_URL'] });
  await adminPg.connect();

  canal.A = await agencia(TENANT_A, 'A');
  canal.B = await agencia(TENANT_B, 'B');

  prismaWebhook = new PrismaWebhookService();
  await prismaWebhook.onModuleInit();
  bandeja = new BandejaPrisma(prismaWebhook, new ContactosDeCrm());
  outbox = new OutboxAcotado(prismaWebhook);
});

afterAll(async () => {
  await prismaWebhook?.onModuleDestroy();
  if (adminPg) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await adminPg.query('BEGIN');
      await modulo.borrarTenants(adminPg, [TENANT_A, TENANT_B]);
      await adminPg.query('COMMIT');
    } finally {
      await adminPg.end();
    }
  }
  await admin?.$disconnect();
});

describe('relay del outbox', () => {
  it('publica el evento una vez, solo con identificadores, y lo marca publicado', async () => {
    await entrante(TENANT_A, canal.A);
    expect(await pendientes(TENANT_A)).toBe(1);

    const publicador = new Apunta();
    const relevo = new RelevarOutbox(outbox, publicador);
    expect(await relevo.vaciar(TENANT_A)).toBe(1);

    expect(publicador.publicados).toHaveLength(1);
    const e = publicador.publicados[0]!;
    expect(e.tipo).toBe(TIPO_MENSAJE_RECIBIDO);
    expect(e.tenantId).toBe(TENANT_A);
    expect(Object.keys(e.payload).sort()).toEqual(['canalId', 'conversacionId']);
    // R10: ni el texto del viajero ni su teléfono viajan en el evento.
    expect(JSON.stringify(e)).not.toContain(TEXTO_PRIVADO);
    expect(JSON.stringify(e)).not.toMatch(/\+57\d{9,}/);
    expect(await pendientes(TENANT_A)).toBe(0);

    // Idempotente: no hay nada más que publicar.
    expect(await relevo.vaciar(TENANT_A)).toBe(0);
    expect(publicador.publicados).toHaveLength(1);
  });

  it('si publicar falla no queda NADA marcado, y el siguiente intento lo publica', async () => {
    await entrante(TENANT_A, canal.A);
    const publicador = new Apunta();
    const relevo = new RelevarOutbox(outbox, publicador);

    publicador.fallar = true;
    await expect(relevo.vaciar(TENANT_A)).rejects.toThrow();
    expect(await pendientes(TENANT_A)).toBe(1);

    publicador.fallar = false;
    expect(await relevo.vaciar(TENANT_A)).toBe(1);
    expect(await pendientes(TENANT_A)).toBe(0);
  });

  it('vaciar una agencia no toca los eventos de otra', async () => {
    await entrante(TENANT_A, canal.A);
    await entrante(TENANT_B, canal.B);
    const publicador = new Apunta();
    await new RelevarOutbox(outbox, publicador).vaciar(TENANT_A);

    expect(publicador.publicados.every((e) => e.tenantId === TENANT_A)).toBe(true);
    expect(await pendientes(TENANT_A)).toBe(0);
    expect(await pendientes(TENANT_B)).toBe(1);
  });

  it('el barrido encuentra lo que un aviso perdido dejó, en todas las agencias', async () => {
    await entrante(TENANT_A, canal.A);
    const publicador = new Apunta();
    await new RelevarOutbox(outbox, publicador).barrer();

    expect(await pendientes(TENANT_A)).toBe(0);
    expect(await pendientes(TENANT_B)).toBe(0);
    expect(new Set(publicador.publicados.map((e) => e.tenantId))).toEqual(
      new Set([TENANT_A, TENANT_B]),
    );
  });

  it('dos relés a la vez no publican el mismo evento', async () => {
    for (let i = 0; i < 6; i += 1) await entrante(TENANT_A, canal.A);
    const p1 = new Apunta();
    const p2 = new Apunta();
    await Promise.all([
      new RelevarOutbox(outbox, p1).vaciar(TENANT_A),
      new RelevarOutbox(outbox, p2).vaciar(TENANT_A),
    ]);

    const ids = [...p1.publicados, ...p2.publicados].map((e) => e.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(await pendientes(TENANT_A)).toBe(0);
  });

  it('un tenant que falla en el barrido no impide a los demás', async () => {
    await entrante(TENANT_A, canal.A);
    await entrante(TENANT_B, canal.B);
    const publicador = new Apunta();
    const original = publicador.publicar.bind(publicador);
    publicador.publicar = (e) =>
      e.tenantId === TENANT_A ? Promise.reject(new Error('falla A')) : original(e);

    await new RelevarOutbox(outbox, publicador).barrer();

    expect(await pendientes(TENANT_A)).toBe(1);
    expect(await pendientes(TENANT_B)).toBe(0);
  });
});
