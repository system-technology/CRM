/**
 * T-132 — `cambiarEstado` y `guardar` añaden su fila al historial de estados en la MISMA
 * transacción, bajo el mismo bloqueo, y antes del UPDATE.
 *
 * Con una transacción doble: lo que se comprueba es el orden y el contenido de lo que se escribe
 * dentro del callback de `conTenant`, y que un fallo del historial hace salir la excepción del
 * callback (que es lo que hace que Prisma deshaga). Que la base lo deshaga de verdad, y que una
 * agencia no lea el historial de otra, lo prueba `historial-de-estados.e2e-spec.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import type { EstadoCotizacion } from '@viajapro/contracts';
import type { ClienteTenant, PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PuertoReferenciasDeCrm } from '../../../shared/puertos/puertos-hacia-crm.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { CotizacionesUseCase } from './cotizaciones.use-case.js';
import type { CotizarSalidaUseCase } from './cotizar-salida.use-case.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const COTIZACION = '33333333-3333-4333-8333-333333333333';

type Paso = { op: string; datos?: unknown };

function transaccionDoble(estadoActual: EstadoCotizacion | null, historialFalla = false) {
  const pasos: Paso[] = [];
  const tx = {
    $queryRaw: (partes: TemplateStringsArray, ...valores: unknown[]) => {
      pasos.push({ op: 'bloqueo', datos: { sql: partes.join('?'), valores } });
      return Promise.resolve(estadoActual === null ? [] : [{ estado: estadoActual }]);
    },
    cotizacionCambioEstado: {
      create: (a: { data: unknown }) => {
        pasos.push({ op: 'historial', datos: a.data });
        return historialFalla
          ? Promise.reject(new Error('historial caído'))
          : Promise.resolve({ id: 'h-1' });
      },
    },
    versionCotizacion: {
      aggregate: () => Promise.resolve({ _max: { numero: 2 } }),
    },
    cotizacion: {
      update: (a: { data: unknown }) => {
        pasos.push({ op: 'update', datos: a.data });
        return Promise.resolve({});
      },
    },
  };
  const prisma = {
    conTenant: <T>(fn: (t: ClienteTenant) => Promise<T>) => fn(tx as unknown as ClienteTenant),
  } as unknown as PrismaService;
  const caso = new CotizacionesUseCase(
    prisma,
    {} as CotizarSalidaUseCase,
    {} as PuertoReferenciasDeCrm,
  );
  // La relectura final no es lo que se prueba aquí.
  vi.spyOn(caso as unknown as { leerEn: () => Promise<unknown> }, 'leerEn').mockResolvedValue({});
  return { caso, pasos };
}

function enTenant<T>(usuarioId: string | null, fn: () => T): T {
  return ContextoTenant.ejecutarCon(
    { tenantId: TENANT, usuarioId, identidadId: null, permisos: new Set(), trazaId: 't' },
    fn,
  );
}

describe('CotizacionesUseCase.cambiarEstado — historial de estados (T-132)', () => {
  it.each([
    ['BORRADOR', 'ENVIADA'],
    ['ENVIADA', 'ACEPTADA'],
    ['ENVIADA', 'RECHAZADA'],
    ['ENVIADA', 'VENCIDA'],
  ] as const)('%s → %s: bloqueo, historial y UPDATE, en ese orden', async (desde, hasta) => {
    const { caso, pasos } = transaccionDoble(desde);
    await enTenant(ACTOR, () => caso.cambiarEstado(COTIZACION, hasta));

    expect(pasos.map((p) => p.op)).toEqual(['bloqueo', 'historial', 'update']);
    const bloqueo = pasos[0]?.datos as { sql: string; valores: unknown[] };
    expect(bloqueo.sql).toMatch(/tenant_id = \?::uuid/);
    expect(bloqueo.sql).toMatch(/FOR UPDATE/);
    expect(bloqueo.valores).toEqual([COTIZACION, TENANT]);
    expect(pasos[1]?.datos).toEqual({
      tenantId: TENANT,
      cotizacionId: COTIZACION,
      estadoDesde: desde,
      estadoHasta: hasta,
      usuarioId: ACTOR,
    });
  });

  it('sin usuario en la petición, la fila lleva usuario nulo', async () => {
    const { caso, pasos } = transaccionDoble('ENVIADA');
    await enTenant(null, () => caso.cambiarEstado(COTIZACION, 'ACEPTADA'));
    expect((pasos[1]?.datos as { usuarioId: unknown }).usuarioId).toBeNull();
  });

  it('una transición inválida no escribe historial ni cambia nada', async () => {
    const { caso, pasos } = transaccionDoble('BORRADOR');
    await expect(
      enTenant(ACTOR, () => caso.cambiarEstado(COTIZACION, 'ACEPTADA')),
    ).rejects.toThrow();
    expect(pasos.map((p) => p.op)).toEqual(['bloqueo']);
  });

  it('una cotización que no existe (o de otra agencia, o borrada) no escribe nada', async () => {
    const { caso, pasos } = transaccionDoble(null);
    await expect(
      enTenant(ACTOR, () => caso.cambiarEstado(COTIZACION, 'ENVIADA')),
    ).rejects.toThrow();
    expect(pasos.map((p) => p.op)).toEqual(['bloqueo']);
  });

  it('si el historial falla, no hay UPDATE y el error sale de la transacción', async () => {
    const { caso, pasos } = transaccionDoble('ENVIADA', true);
    await expect(enTenant(ACTOR, () => caso.cambiarEstado(COTIZACION, 'ACEPTADA'))).rejects.toThrow(
      'historial caído',
    );
    expect(pasos.map((p) => p.op)).not.toContain('update');
  });
});
describe('CotizacionesUseCase.guardar — fila de alta en BORRADOR (T-132)', () => {
  it('el alta escribe cabecera, versión 1 y la fila BORRADOR sin estado de origen', async () => {
    const pasos: Paso[] = [];
    const tx = {
      cotizacion: {
        create: () => {
          pasos.push({ op: 'cabecera' });
          return Promise.resolve({ id: COTIZACION });
        },
      },
      versionCotizacion: {
        create: () => {
          pasos.push({ op: 'version' });
          return Promise.resolve({});
        },
      },
      cotizacionCambioEstado: {
        create: (a: { data: unknown }) => {
          pasos.push({ op: 'historial', datos: a.data });
          return Promise.resolve({ id: 'h-1' });
        },
      },
    };
    const prisma = {
      conTenant: <T>(fn: (t: ClienteTenant) => Promise<T>) => fn(tx as unknown as ClienteTenant),
    } as unknown as PrismaService;
    const crm = {
      existeContacto: () => Promise.resolve(true),
    } as unknown as PuertoReferenciasDeCrm;
    const caso = new CotizacionesUseCase(prisma, {} as CotizarSalidaUseCase, crm);
    vi.spyOn(
      caso as unknown as { recalcular: () => Promise<unknown> },
      'recalcular',
    ).mockResolvedValue({});
    vi.spyOn(caso as unknown as { leerEn: () => Promise<unknown> }, 'leerEn').mockResolvedValue({});

    await enTenant(ACTOR, () =>
      caso.guardar(
        {
          contactoId: 'c-1',
          titulo: 'San Andrés',
          version: { paqueteId: 'p-1', fecha: '2027-03-15', adultos: 2 },
        },
        false,
      ),
    );

    expect(pasos.map((p) => p.op)).toEqual(['cabecera', 'version', 'historial']);
    expect(pasos[2]?.datos).toEqual({
      tenantId: TENANT,
      cotizacionId: COTIZACION,
      estadoDesde: null,
      estadoHasta: 'BORRADOR',
      usuarioId: ACTOR,
    });
  });
});
