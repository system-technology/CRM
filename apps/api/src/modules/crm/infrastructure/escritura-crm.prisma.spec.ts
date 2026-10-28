import { describe, expect, it } from 'vitest';
import type { ClienteTenant, PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PuertoExistenciaDePaquete } from '../../../shared/puertos/puertos-hacia-quoting.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { EscrituraCrmPrisma } from './escritura-crm.prisma.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const TX = { marca: 'tx' } as unknown as ClienteTenant;

class PaquetesDoble extends PuertoExistenciaDePaquete {
  llamadas: { tx: ClienteTenant; tenantId: string; paqueteId: string }[] = [];
  constructor(private readonly existentes: Set<string>) {
    super();
  }
  existePaquete(tx: ClienteTenant, tenantId: string, paqueteId: string): Promise<boolean> {
    this.llamadas.push({ tx, tenantId, paqueteId });
    return Promise.resolve(this.existentes.has(paqueteId));
  }
}

const prismaDoble = {
  conTenant: <T>(fn: (tx: ClienteTenant) => Promise<T>) => fn(TX),
} as unknown as PrismaService;

function enTenant<T>(fn: () => T): T {
  return ContextoTenant.ejecutarCon(
    {
      tenantId: TENANT,
      usuarioId: null,
      identidadId: null,
      permisos: new Set(),
      trazaId: 't',
    },
    fn,
  );
}

describe('EscrituraCrmPrisma.existePaquete (R4: por el puerto de quoting)', () => {
  it('delega en el puerto con la transacción y el tenant del contexto', async () => {
    const paquetes = new PaquetesDoble(new Set(['p-1']));
    const adaptador = new EscrituraCrmPrisma(prismaDoble, paquetes);

    expect(await enTenant(() => adaptador.existePaquete('p-1'))).toBe(true);
    expect(await enTenant(() => adaptador.existePaquete('p-2'))).toBe(false);
    expect(paquetes.llamadas[0]).toEqual({ tx: TX, tenantId: TENANT, paqueteId: 'p-1' });
  });
});
