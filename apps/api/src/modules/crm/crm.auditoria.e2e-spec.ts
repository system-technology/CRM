/**
 * Prueba de auditoría R10: lectura de datos sensibles de contactos escribe en
 * `registros_auditoria` y respeta el aislamiento entre tenants.
 *
 * Afirma:
 *   · al leer una ficha de contacto con `preferencias` (dato sensible), se crea una fila
 *     en `registros_auditoria` con `tenant_id`, `usuario_id`, `accion`, `entidad`,
 *     `entidad_id` y `detalle` que lista los campos sensibles SIN copiar su valor;
 *   · el `detalle` NO contiene el valor de `preferencias`, solo el nombre del campo;
 *   · otro tenant NO ve la fila de auditoría (RLS funciona).
 */
import 'reflect-metadata';

import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaWebhookService } from '../../shared/prisma/prisma-webhook.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { CrmPrisma } from './infrastructure/crm.prisma.js';
import { ContextoTenant } from '../../shared/tenant/contexto-tenant.js';
import type { ClienteTenant } from '../../shared/prisma/prisma.service.js';

const idDeTenant = (): string => `01932000-0000-7000-8000-${randomBytes(6).toString('hex')}`;
const TENANT_A = idDeTenant();
const TENANT_B = idDeTenant();
const USUARIO_A = randomUUID();
const TELEFONO = `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`;

let admin: Client;
let prisma: PrismaWebhookService;
let contactoA: string;
let crm: CrmPrisma;

// Interfaz mínima que CrmPrisma necesita de PrismaService
interface PrismaConTenant {
  conTenant: <T>(fn: (tx: ClienteTenant) => Promise<T>) => Promise<T>;
}

// Wrapper para que CrmPrisma use PrismaWebhookService con tenant fijo
function crearCrmConTenant(fijoTenantId: string): CrmPrisma {
  const adapter: PrismaConTenant = {
    conTenant: <T>(fn: (tx: ClienteTenant) => Promise<T>) =>
      prisma.conTenantResuelto(fijoTenantId, fn),
  };
  return new CrmPrisma(adapter as unknown as PrismaService);
}

beforeAll(async () => {
  // Verificar que hay variables de entorno para la base de datos
  if (!process.env['DATABASE_URL'] || !process.env['DATABASE_WEBHOOK_URL']) {
    console.log('Saltando test e2e de auditoría: faltan DATABASE_URL o DATABASE_WEBHOOK_URL');
    return;
  }

  admin = new Client({ connectionString: process.env['DATABASE_URL'] });
  await admin.connect();
  const bd = await admin.query('SELECT current_database() AS db');
  if (bd.rows[0].db !== 'neondb') {
    throw new Error(`Base inesperada: ${bd.rows[0].db}.`);
  }

  // Crear dos tenants de prueba
  for (const [id, letra] of [
    [TENANT_A, 'a'],
    [TENANT_B, 'b'],
  ] as const) {
    await admin.query(
      `INSERT INTO tenants (id, slug, nombre, creado_en, actualizado_en) VALUES ($1, $2, $3, now(), now())`,
      [id, `fixture-auditoria-${letra}-${id.slice(-8)}`, `Agencia ${letra}`],
    );
  }

  // Crear usuario en tenant A (para tener usuario_id en la auditoría)
  await admin.query(
    `INSERT INTO usuarios (id, tenant_id, identidad_id, nombre, correo, estado, creado_en, actualizado_en)
     VALUES ($1, $2, $3, 'Usuario Test A', 'test-a@example.com', 'ACTIVO', now(), now())`,
    [USUARIO_A, TENANT_A, randomUUID()],
  );

  // Crear contacto en tenant A CON preferencias (dato sensible R10)
  contactoA = randomUUID();
  await admin.query(
    `INSERT INTO contactos (id, tenant_id, telefono_e164, nombre, preferencias, creado_en, actualizado_en)
     VALUES ($1, $2, $3, 'Contacto Con Preferencias', 'Alergia a penicilina, asiento ventana', now(), now())`,
    [contactoA, TENANT_A, TELEFONO],
  );

  // Inicializar Prisma con el rol del trabajador (RLS activa)
  prisma = new PrismaWebhookService();
  await prisma.onModuleInit();

  // Crear instancia de CrmPrisma que use el tenant A
  crm = crearCrmConTenant(TENANT_A);
}, 60_000);

afterAll(async () => {
  if (!prisma) return;

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

describe('Auditoría R10: lectura de datos sensibles de contacto', () => {
  beforeEach(() => {
    // Mock del contexto de tenant para cada test
    vi.spyOn(ContextoTenant, 'obtener').mockReturnValue({
      tenantId: TENANT_A,
      usuarioId: USUARIO_A,
      identidadId: randomUUID(),
      permisos: new Set(),
      trazaId: randomUUID(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('escribe en registros_auditoria al leer ficha con preferencias', async () => {
    if (!prisma) return; // Test saltado si no hay BD

    // Leer la ficha del contacto (esto debe disparar la auditoría)
    const ficha = await crm.fichaDeContacto(contactoA);
    expect(ficha).not.toBeNull();
    expect(ficha!.contacto.preferencias).toBe('Alergia a penicilina, asiento ventana');

    // Verificar que se escribió en registros_auditoria
    const auditorias = await prisma.conTenantResuelto(TENANT_A, async (tx) => {
      return tx.registroAuditoria.findMany({
        where: { entidadId: contactoA, accion: 'LECTURA_DATOS_SENSIBLES' },
        orderBy: { ocurridoEn: 'desc' },
      });
    });

    expect(auditorias).toHaveLength(1);
    const audit = auditorias[0];
    expect(audit).toBeDefined();
    if (!audit) return;
    expect(audit.tenantId).toBe(TENANT_A);
    expect(audit.usuarioId).toBe(USUARIO_A);
    expect(audit.accion).toBe('LECTURA_DATOS_SENSIBLES');
    expect(audit.entidad).toBe('Contacto');
    expect(audit.entidadId).toBe(contactoA);
    expect(audit.detalle).toEqual({ camposSensibles: ['preferencias'] });
    // IMPORTANTE: el detalle NO debe contener el valor sensible
    expect(JSON.stringify(audit.detalle)).not.toContain('penicilina');
    expect(JSON.stringify(audit.detalle)).not.toContain('ventana');
  });

  it('otro tenant NO ve la fila de auditoría (RLS)', async () => {
    if (!prisma) return; // Test saltado si no hay BD

    // Consultar auditorías desde tenant B
    const auditorias = await prisma.conTenantResuelto(TENANT_B, async (tx) => {
      return tx.registroAuditoria.findMany({
        where: { entidadId: contactoA, accion: 'LECTURA_DATOS_SENSIBLES' },
      });
    });

    // Debe estar vacío porque RLS filtra por tenant_id
    expect(auditorias).toHaveLength(0);
  });

  it('NO escribe auditoría si el contacto no tiene preferencias (no hay dato sensible)', async () => {
    if (!prisma) return; // Test saltado si no hay BD

    // Crear contacto SIN preferencias
    const contactoSinPreferencias = randomUUID();
    await admin!.query(
      `INSERT INTO contactos (id, tenant_id, telefono_e164, nombre, preferencias, creado_en, actualizado_en)
       VALUES ($1, $2, $3, 'Contacto Sin Preferencias', NULL, now(), now())`,
      [contactoSinPreferencias, TENANT_A, `+57300${Math.floor(Math.random() * 9e6 + 1e6)}`],
    );

    const ficha = await crm.fichaDeContacto(contactoSinPreferencias);
    expect(ficha).not.toBeNull();
    expect(ficha!.contacto.preferencias).toBeNull();

    // Verificar que NO se escribió en registros_auditoria
    const auditorias = await prisma.conTenantResuelto(TENANT_A, async (tx) => {
      return tx.registroAuditoria.findMany({
        where: { entidadId: contactoSinPreferencias, accion: 'LECTURA_DATOS_SENSIBLES' },
      });
    });

    expect(auditorias).toHaveLength(0);
  });
});
