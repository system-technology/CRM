import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';
import type { CotizarSalida } from '@viajapro/contracts';
import type { ClienteTenant, PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { TarifasConCondicionNoEvaluableError } from '../domain/errors.js';
import { CotizarSalidaUseCase } from './cotizar-salida.use-case.js';

/** T-179: una familia cotiza con la tarifa de menor cuando se dan las edades. */
describe('CotizarSalidaUseCase: edades de los pasajeros (T-179)', () => {
  const TENANT = '01932000-0000-7000-8000-00000000000a';
  const PAQUETE_ID = '01932000-0000-7000-8000-000000000001';

  const tarifa = (id: string, nombre: string, venta: bigint, extra: Record<string, unknown>) => ({
    id,
    nombre,
    unidad: 'POR_PERSONA' as const,
    cubrePasajeros: 1,
    ventaUnidades: venta,
    monedaIso: 'COP',
    aditiva: false,
    acomodacion: null,
    tipoPasajero: null,
    edadMinima: null,
    edadMaxima: null,
    pasajerosMinimo: null,
    pasajerosMaximo: null,
    ocupaSilla: null,
    listaUnidades: null,
    promoHasta: null,
    ...extra,
  });

  const tarifas = [
    tarifa('t-menor', 'Menor de 2 a 11 años', 292000n, {
      tipoPasajero: 'CHD',
      edadMinima: 2,
      edadMaxima: 11,
    }),
    tarifa('t-adulto', 'Adulto', 389000n, { tipoPasajero: 'ADT' }),
  ];

  const paquete = {
    id: PAQUETE_ID,
    nombre: 'Puebleando',
    destino: 'Quindío',
    noches: 1,
    cargosEnDestino: [],
    opcionesDeSalida: [],
  };

  const tx = {
    paquete: { findFirst: vi.fn(() => Promise.resolve(paquete)) },
    vigencia: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            id: '01932000-0000-7000-8000-0000000000a1',
            desde: new Date('2026-10-03T00:00:00Z'),
            hasta: new Date('2026-10-03T00:00:00Z'),
            publicada: true,
          },
        ]),
      ),
    },
    politicaDePrecio: { findUnique: vi.fn(() => Promise.resolve(null)) },
    tenant: { findUnique: vi.fn(() => Promise.resolve({ zonaHoraria: 'America/Bogota' })) },
    tarifa: { findMany: vi.fn(() => Promise.resolve(tarifas)) },
  } as unknown as ClienteTenant;

  const calcular = (peticion: CotizarSalida) =>
    ContextoTenant.ejecutarCon(
      {
        tenantId: TENANT,
        usuarioId: null,
        identidadId: null,
        permisos: new Set(),
        trazaId: 'traza-t179',
      },
      () => new CotizarSalidaUseCase({} as PrismaService).calcular(tx, peticion),
    );

  const base = { paqueteId: PAQUETE_ID, fecha: '2026-10-03', incluirMargen: false };

  it('2 adultos + niño de 7: Adulto x2 y Menor x1, total 1.070.000', async () => {
    const r = await calcular({ ...base, adultos: 2, ninos: 1, edadesNinos: [7] });
    expect(r.lineas.map((l) => [l.nombre, l.veces])).toEqual([
      ['Menor de 2 a 11 años', 1],
      ['Adulto', 2],
    ]);
    expect(r.total.unidades).toBe('1070000');
  });

  it('un niño de 14 no cae en la tarifa de menor y queda explicado', async () => {
    const r = await calcular({ ...base, adultos: 2, ninos: 1, edadesNinos: [14] });
    expect(r.lineas.map((l) => l.nombre)).toEqual(['Adulto']);
    expect(r.noAplicables[0]?.motivo).toMatch(/de 2 a 11 años/);
  });

  it('sin edades, error tipado y no un total corto', async () => {
    await expect(calcular({ ...base, adultos: 2, ninos: 1 })).rejects.toBeInstanceOf(
      TarifasConCondicionNoEvaluableError,
    );
  });
});
