/**
 * ADR-0025 paso 2: el detalle de paquete muestra vigencias y tarifas (lo que lee el cotizador),
 * no temporadas. El neto solo viaja con `incluirMargen` (R10). La consulta real contra PostgreSQL
 * está en `paquetes-sin-margen.e2e-spec.ts`.
 */
import 'reflect-metadata';

import { DetalleDePaquete } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ListarPaquetesUseCase } from './listar-paquetes.use-case.js';

const ID = '01932000-0000-7000-8000-0000000000a1';

function montar() {
  const paquete = {
    id: ID,
    tenantId: '01932000-0000-7000-8000-0000000000d1',
    nombre: 'San Andrés',
    destino: 'San Andrés',
    paisIso: 'CO',
    dias: 4,
    noches: 3,
    planAlimentacion: 'TODO_INCLUIDO',
    inclusiones: [],
    exclusiones: [],
    descripcion: null,
    activo: true,
    mayoristaId: null,
    codigo: null,
    cargosEnDestino: [],
    camposPersonalizados: {},
    creadoEn: new Date('2026-02-01T10:00:00Z'),
    actualizadoEn: new Date('2026-02-02T10:00:00Z'),
    mayorista: null,
    formato: null,
    opcionesDeSalida: [],
    vigencias: [
      {
        id: '01932000-0000-7000-8000-0000000000b1',
        desde: new Date('2027-03-01'),
        hasta: new Date('2027-03-31'),
        publicada: false,
        cupoTotal: null,
        tarifas: [
          {
            id: '01932000-0000-7000-8000-0000000000c1',
            nombre: 'Adulto doble',
            unidad: 'POR_PERSONA',
            cubrePasajeros: 1,
            aditiva: false,
            netoUnidades: 1_000_000n,
            ventaUnidades: 1_200_000n,
            monedaIso: 'COP',
            mayoristaId: '01932000-0000-7000-8000-0000000000e1',
            acomodacion: 'DOBLE',
            tipoPasajero: 'ADT',
            edadMinima: null,
            edadMaxima: null,
            pasajerosMinimo: null,
            pasajerosMaximo: null,
            ocupaSilla: null,
          },
          {
            id: '01932000-0000-7000-8000-0000000000c2',
            nombre: 'Menor',
            unidad: 'POR_PERSONA',
            cubrePasajeros: 1,
            aditiva: false,
            netoUnidades: null,
            ventaUnidades: 800_000n,
            monedaIso: 'COP',
            mayoristaId: null,
            acomodacion: null,
            tipoPasajero: 'CHD',
            edadMinima: 2,
            edadMaxima: 11,
            pasajerosMinimo: null,
            pasajerosMaximo: null,
            ocupaSilla: null,
          },
        ],
      },
    ],
  };
  const tx = { paquete: { findFirst: () => Promise.resolve(paquete) } };
  const prisma = {
    conTenant: (fn: (t: typeof tx) => unknown) => fn(tx),
  } as unknown as PrismaService;
  return new ListarPaquetesUseCase(prisma);
}

describe('ListarPaquetesUseCase.detalle (ADR-0025)', () => {
  it('expone vigencias con tarifas y ya no temporadas', async () => {
    const d = await montar().detalle(ID);
    expect('temporadas' in d).toBe(false);
    expect(d.vigencias).toHaveLength(1);
    expect(d.vigencias[0]?.desde).toBe('2027-03-01');
    expect(d.vigencias[0]?.tarifas[1]?.condicion).toMatchObject({
      tipoPasajero: 'CHD',
      edadMinima: 2,
      edadMaxima: 11,
    });
  });

  it('sin incluirMargen no viaja el neto ni el mayorista de la tarifa', async () => {
    const d = await montar().detalle(ID);
    const texto = JSON.stringify(d.vigencias);
    expect(texto).not.toMatch(/neto|mayoristaId/);
    expect(d.vigencias[0]?.tarifas[0]?.venta).toEqual({ unidades: '1200000', moneda: 'COP' });
  });

  it('con incluirMargen viaja el neto, y null si el mayorista no lo entregó', async () => {
    const d = await montar().detalle(ID, true);
    expect(d.vigencias[0]?.tarifas[0]?.neto).toEqual({ unidades: '1000000', moneda: 'COP' });
    expect(d.vigencias[0]?.tarifas[1]?.neto).toBeNull();
    expect(JSON.stringify(d.vigencias)).not.toMatch(/mayoristaId/);
  });

  it('cumple el contrato DetalleDePaquete', async () => {
    const d = await montar().detalle(ID, true);
    expect(DetalleDePaquete.safeParse(JSON.parse(JSON.stringify(d))).success).toBe(true);
  });
});
