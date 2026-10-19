/**
 * Los puertos que `crm` ofrece a `inbox` y `quoting`, contra la base real: lo que importa es que
 * corren DENTRO de la transacción del llamador y que, por tanto, **respetan el tenant** de esa
 * transacción aunque el argumento `tenantId` diga otra cosa.
 *
 * Afirma:
 *   · un contacto de la agencia A existe para A y NO existe para B;
 *   · RLS manda aunque se le pase al puerto el `tenantId` equivocado: con la sesión de B y el
 *     predicado de A, tampoco aparece (la defensa en profundidad es de verdad una segunda
 *     barrera, no un adorno);
 *   · `asegurarContacto` en B con el teléfono de un contacto de A crea un contacto PROPIO de B y no
 *     toca el de A;
 *   · `asegurarContacto` es idempotente y no sobrescribe el nombre de un contacto que ya existe;
 *   · una oportunidad inexistente no pertenece a ningún contacto.
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { ContactosDeCrm, ReferenciasDeCrm } from './infrastructure/puertos-de-crm.prisma.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const TELEFONO = `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`;

let admin: Client;
let prisma: PrismaWebhookService;
let contactoA: string;
const contactos = new ContactosDeCrm();
const referencias = new ReferenciasDeCrm();

beforeAll(async () => {
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
      [id, `fixture-aislamiento-puertos-${letra}-${id.slice(-8)}`, `Agencia ${letra}`],
    );
  }
  contactoA = randomUUID();
  await admin.query(
    `INSERT INTO contactos (id, tenant_id, telefono_e164, nombre, creado_en, actualizado_en)
     VALUES ($1, $2, $3, 'Nombre de A', now(), now())`,
    [contactoA, TENANT_A, TELEFONO],
  );

  // Con el rol del trabajador (RLS activa), el mismo con el que corre `inbox` en producción.
  prisma = new PrismaWebhookService();
  await prisma.onModuleInit();
});

afterAll(async () => {
  await prisma?.onModuleDestroy();
  if (admin) {
    try {
      type Limpiador = (c: Client, ids: string[]) => Promise<unknown>;
      const ruta = '../../../../../packages/database/scripts/borrar-tenants.mjs';
      const modulo = (await import(ruta)) as { borrarTenants: Limpiador };
      await admin.query('BEGIN');
      await modulo.borrarTenants(admin, [TENANT_A, TENANT_B]);
      await admin.query('COMMIT');
    } finally {
      await admin.end();
    }
  }
});

describe('puertos de crm: respetan el tenant de la transacción', () => {
  it('un contacto de A existe para A y no existe para B', async () => {
    expect(
      await prisma.conTenantResuelto(TENANT_A, (tx) =>
        referencias.existeContacto(tx, TENANT_A, contactoA),
      ),
    ).toBe(true);
    expect(
      await prisma.conTenantResuelto(TENANT_B, (tx) =>
        referencias.existeContacto(tx, TENANT_B, contactoA),
      ),
    ).toBe(false);
  });

  it('RLS manda aunque al puerto le pasen el tenantId equivocado', async () => {
    // Sesión de B, predicado de A: sin RLS aparecería. Con RLS no.
    expect(
      await prisma.conTenantResuelto(TENANT_B, (tx) =>
        referencias.existeContacto(tx, TENANT_A, contactoA),
      ),
    ).toBe(false);
  });

  it('asegurarContacto en B con el teléfono de un contacto de A crea uno PROPIO de B', async () => {
    const deB = await prisma.conTenantResuelto(TENANT_B, (tx) =>
      contactos.asegurarContacto(tx, {
        tenantId: TENANT_B,
        telefonoE164: TELEFONO,
        nombrePerfil: 'Perfil en B',
      }),
    );
    expect(deB.id).not.toBe(contactoA);

    const filas = await admin.query(
      'SELECT id, tenant_id, nombre FROM contactos WHERE telefono_e164 = $1 ORDER BY tenant_id',
      [TELEFONO],
    );
    expect(filas.rows).toHaveLength(2);
    const a = filas.rows.find((f: { tenant_id: string }) => f.tenant_id === TENANT_A);
    expect(a).toMatchObject({ id: contactoA, nombre: 'Nombre de A' });
  });

  it('asegurarContacto es idempotente y no sobrescribe el nombre existente', async () => {
    const entrada = { tenantId: TENANT_A, telefonoE164: TELEFONO, nombrePerfil: 'Otro nombre' };
    const una = await prisma.conTenantResuelto(TENANT_A, (tx) =>
      contactos.asegurarContacto(tx, entrada),
    );
    const otra = await prisma.conTenantResuelto(TENANT_A, (tx) =>
      contactos.asegurarContacto(tx, entrada),
    );
    expect(una.id).toBe(contactoA);
    expect(otra.id).toBe(contactoA);
    const n = await admin.query('SELECT nombre FROM contactos WHERE id = $1', [contactoA]);
    expect(n.rows[0].nombre).toBe('Nombre de A');
  });

  it('una oportunidad inexistente no pertenece a ningún contacto', async () => {
    expect(
      await prisma.conTenantResuelto(TENANT_A, (tx) =>
        referencias.existeOportunidadDelContacto(tx, TENANT_A, randomUUID(), contactoA),
      ),
    ).toBe(false);
  });
});
