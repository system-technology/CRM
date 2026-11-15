/**
 * ADR-0015, concreción 5: la bandeja busca por el NOMBRE y el TELÉFONO del contacto, nunca en el
 * texto de los mensajes (va cifrado; una búsqueda SQL sobre él no encuentra nada). Sin base: la
 * transacción es un doble que captura el `where` que el adaptador manda a Prisma.
 *
 * Existe por una regresión: dos e2e buscaban un hilo abierto por el webhook por una palabra del
 * mensaje; el contacto que crea el webhook se llama como el perfil de WhatsApp, así que esa
 * búsqueda ya no podía encontrarlo. Quien busca un hilo nuevo lo busca por el teléfono.
 */
import { randomBytes } from 'node:crypto';
import { ConsultarBandeja } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { CifradoDeCampos } from '../../../shared/cifrado/cifrado-de-campos.js';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import type { PuertoNotasDeConversacion } from '../../../shared/puertos/puertos-hacia-crm.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ConversacionesPrisma } from './conversaciones.prisma.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';

async function whereDeLaBusqueda(buscar: string): Promise<unknown> {
  let capturado: unknown;
  const tx = {
    conversacion: {
      findMany: (args: { where: unknown }) => {
        capturado = args.where;
        return Promise.resolve([]);
      },
    },
    registroAuditoria: { create: () => Promise.resolve({}) },
  };
  const prisma = {
    conTenant: <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  } as unknown as PrismaService;
  const adaptador = new ConversacionesPrisma(
    prisma,
    {} as PuertoNotasDeConversacion,
    new CifradoDeCampos({ version: 1, actual: randomBytes(32), anterior: null }),
  );
  await ContextoTenant.ejecutarCon(
    { tenantId: TENANT, usuarioId: null, identidadId: null, permisos: new Set(), trazaId: 't' },
    () =>
      adaptador.listar({ alcance: 'TODAS' }, null, ConsultarBandeja.parse({ buscar }), new Date()),
  );
  return capturado;
}

describe('ConversacionesPrisma.listar — la búsqueda (ADR-0015)', () => {
  it('busca en el nombre y en el teléfono del contacto', async () => {
    const where = JSON.stringify(await whereDeLaBusqueda('+573021234567'));
    expect(where).toContain('"nombre":{"contains":"+573021234567","mode":"insensitive"}');
    expect(where).toContain('"telefonoE164":{"contains":"+573021234567"}');
  });

  it('no busca en los mensajes ni en ninguna columna de texto cifrado', async () => {
    const where = JSON.stringify(await whereDeLaBusqueda('Cartagena'));
    expect(where).not.toContain('mensajes');
    expect(where).not.toMatch(/texto/i);
  });
});
