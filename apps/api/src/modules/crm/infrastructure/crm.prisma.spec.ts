import { describe, expect, it, vi } from 'vitest';
import type { ClienteTenant, PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { cifradoDePrueba } from '../../../shared/cifrado/cifrado-de-prueba.js';
import { CrmPrisma } from './crm.prisma.js';

const TENANT = '11111111-1111-4111-8111-111111111111';

describe('CrmPrisma.listarContactos (T-227)', () => {
  const crearAuditoria = vi.fn();
  it('no descifra ni audita preferencias: el listado no las devuelve', async () => {
    const tx = {
      contacto: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: '22222222-2222-4222-8222-222222222222',
            tenantId: TENANT,
            nombre: 'Ana',
            telefonoE164: '+573001234567',
            correo: null,
            etiquetas: [],
            creadoEn: new Date('2026-12-01T00:00:00Z'),
            ultimoContactoEn: null,
            consentimientos: [],
            // Un criptograma ilegible: si el listado intentara abrirlo, lanzaría.
            preferenciasCifrado: Buffer.from('basura'),
            preferenciasNonce: Buffer.alloc(12),
            preferenciasTag: Buffer.alloc(16),
            preferenciasClaveVersion: 1,
          },
        ]),
      },
      $executeRaw: vi.fn(),
      registroAuditoria: { create: crearAuditoria, createMany: crearAuditoria },
    } as unknown as ClienteTenant;
    const prisma = {
      conTenant: <T>(fn: (t: ClienteTenant) => Promise<T>) => fn(tx),
    } as unknown as PrismaService;
    const descifrar = vi.fn();
    const cifrado = cifradoDePrueba();
    cifrado.descifrarDeFila = descifrar;
    cifrado.descifrar = descifrar;

    const adaptador = new CrmPrisma(prisma, cifrado);
    const lista = await ContextoTenant.ejecutarCon(
      { tenantId: TENANT, usuarioId: null, identidadId: null, permisos: new Set(), trazaId: 't' },
      () => adaptador.listarContactos({ buscar: null, limite: 50 }),
    );

    expect(lista).toHaveLength(1);
    expect(lista[0]).not.toHaveProperty('preferencias');
    expect(lista[0]?.nombre).toBe('Ana');
    expect(descifrar).not.toHaveBeenCalled();
    expect(crearAuditoria).not.toHaveBeenCalled();
  });
});
