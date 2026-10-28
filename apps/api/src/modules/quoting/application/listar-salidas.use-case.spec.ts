/**
 * T-066: el «desde» de una salida es uno por moneda; nunca se mezclan COP y USD en un número.
 * La consulta real contra PostgreSQL está en `catalogo.e2e-spec.ts`.
 */
import 'reflect-metadata';

import { SalidaPublicada } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ListarSalidasUseCase } from './listar-salidas.use-case.js';

const TENANT = '01932000-0000-7000-8000-0000000000d1';

interface FilaTarifa {
  ventaUnidades: bigint;
  monedaIso: string;
  unidad: 'POR_PERSONA' | 'POR_GRUPO';
  cubrePasajeros: number;
  aditiva: boolean;
  tipoPasajero: 'ADT' | 'CHD' | 'INF' | null;
  edadMinima: number | null;
  edadMaxima: number | null;
  ocupaSilla: boolean | null;
  listaUnidades: bigint | null;
  promoHasta: Date | null;
}

const tarifa = (venta: bigint, moneda: string, extra: Partial<FilaTarifa> = {}): FilaTarifa => ({
  ventaUnidades: venta,
  monedaIso: moneda,
  unidad: 'POR_PERSONA',
  cubrePasajeros: 1,
  aditiva: false,
  tipoPasajero: null,
  edadMinima: null,
  edadMaxima: null,
  ocupaSilla: null,
  listaUnidades: null,
  promoHasta: null,
  ...extra,
});

function montar(tarifas: FilaTarifa[]) {
  const vigencia = {
    id: '01932000-0000-7000-8000-0000000000a1',
    desde: new Date('2027-01-10'),
    cupoTotal: 20,
    paquete: {
      id: '01932000-0000-7000-8000-0000000000b1',
      nombre: 'Isla Palma',
      destino: 'Cartagena',
      noches: 0,
    },
    tarifas,
  };
  const tx = {
    tenant: { findUnique: () => Promise.resolve({ zonaHoraria: 'America/Bogota' }) },
    politicaDePrecio: {
      findFirst: () => Promise.resolve(null),
      findUnique: () => Promise.resolve(null),
    },
    vigencia: { findMany: () => Promise.resolve([vigencia]) },
  };
  const prisma = {
    conTenant: (fn: (t: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  return new ListarSalidasUseCase(prisma);
}

const ejecutar = (uc: ListarSalidasUseCase) =>
  ContextoTenant.ejecutarCon(
    { tenantId: TENANT, usuarioId: null, identidadId: null, permisos: new Set(), trazaId: 't' },
    () => uc.ejecutar({ desde: '2027-01-01', hasta: null, paqueteId: null, limite: 10 }),
  );

describe('ListarSalidasUseCase: «desde» por moneda (T-066)', () => {
  it('una salida con COP y USD devuelve un mínimo por moneda, sin mezclarlas', async () => {
    const [salida] = await ejecutar(
      montar([
        tarifa(320000n, 'COP'),
        tarifa(410000n, 'COP', { tipoPasajero: 'ADT' }),
        tarifa(90n, 'USD'),
        tarifa(75n, 'USD', { tipoPasajero: 'ADT' }),
      ]),
    );

    expect(salida?.desdePorMoneda).toEqual([
      { unidades: '320000', moneda: 'COP' },
      { unidades: '75', moneda: 'USD' },
    ]);
    // El «desde» suelto es el primero por código: nunca un valor que no esté en la lista.
    expect(salida?.desde).toEqual({ unidades: '320000', moneda: 'COP' });
    expect(salida?.presentacionPorMoneda).toHaveLength(2);
    expect(salida?.presentacion).toEqual(salida?.presentacionPorMoneda?.[0]);
  });

  it('con una sola moneda la lista tiene un elemento y coincide con desde', async () => {
    const [salida] = await ejecutar(montar([tarifa(320000n, 'COP')]));
    expect(salida?.desdePorMoneda).toEqual([salida?.desde]);
    expect(salida?.presentacionPorMoneda).toHaveLength(1);
  });

  it('desdeEsDeGrupo es verdadero si el mínimo de cualquier moneda sale de una tarifa de grupo', async () => {
    const [salida] = await ejecutar(
      montar([
        tarifa(320000n, 'COP'),
        tarifa(160n, 'USD', { unidad: 'POR_GRUPO', cubrePasajeros: 2 }),
      ]),
    );
    expect(salida?.desdePorMoneda).toEqual([
      { unidades: '320000', moneda: 'COP' },
      { unidades: '80', moneda: 'USD' },
    ]);
    expect(salida?.desdeEsDeGrupo).toBe(true);
  });

  it('la respuesta cumple el contrato SalidaPublicada (R3)', async () => {
    const salidas = await ejecutar(montar([tarifa(320000n, 'COP'), tarifa(90n, 'USD')]));
    for (const s of salidas) expect(SalidaPublicada.safeParse(s).success).toBe(true);
  });

  it('una salida sin tarifa base no se anuncia', async () => {
    expect(await ejecutar(montar([]))).toEqual([]);
  });
});
