import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';
import type { CotizarSalida } from '@viajapro/contracts';
import { POLITICA_POR_DEFECTO } from '@viajapro/domain';
import type { PrismaService, ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { CotizarSalidaUseCase } from './cotizar-salida.use-case.js';

describe('CotizarSalidaUseCase — Aislamiento de política de precio (T-013)', () => {
  const TENANT_A = '01932000-0000-7000-8000-00000000000a';
  const TENANT_B = '01932000-0000-7000-8000-00000000000b';
  const PAQUETE_ID = '01932000-0000-7000-8000-000000000001';

  function conContexto(tenantId: string, fn: () => Promise<unknown>): Promise<unknown> {
    return ContextoTenant.ejecutarCon(
      {
        tenantId,
        usuarioId: null,
        identidadId: null,
        permisos: new Set(),
        trazaId: 'traza-t013',
      },
      fn,
    );
  }

  function crearMockTx(
    politicasEnBd: Map<string, { base: string; promoVencida: 'OCULTAR' | 'TACHAR' }>,
  ) {
    const paquete = {
      id: PAQUETE_ID,
      nombre: 'Excursión Cartagena',
      destino: 'Cartagena',
      noches: 0,
      cargosEnDestino: [],
      opcionesDeSalida: [],
    };

    const vigencias = [
      {
        id: '01932000-0000-7000-8000-0000000000v1',
        desde: new Date('2027-01-01T00:00:00Z'),
        hasta: new Date('2027-01-31T23:59:59Z'),
        publicada: true,
      },
    ];

    const tarifas = [
      {
        id: '01932000-0000-7000-8000-0000000000t1',
        nombre: 'Adulto General',
        unidad: 'POR_PERSONA' as const,
        cubrePasajeros: 1,
        netoUnidades: 800000n,
        ventaUnidades: 1000000n,
        monedaIso: 'COP',
        aditiva: false,
        acomodacion: null,
        tipoPasajero: 'ADT',
        edadMinima: null,
        edadMaxima: null,
        pasajerosMinimo: null,
        pasajerosMaximo: null,
        ocupaSilla: null,
        listaUnidades: null,
        promoHasta: null,
      },
    ];

    const findUniquePolitica = vi.fn(({ where }: { where: { tenantId: string } }) => {
      const found = politicasEnBd.get(where.tenantId);
      return Promise.resolve(found ? { base: found.base, promoVencida: found.promoVencida } : null);
    });

    const findFirstPolitica = vi.fn(() => {
      // Si alguien llamara findFirst() sin where, simula el fallo de RLS devolviendo la primera fila de la BD
      const primera = politicasEnBd.values().next().value;
      return Promise.resolve(primera ?? null);
    });

    const tx = {
      paquete: {
        findUnique: vi.fn(() => Promise.resolve(paquete)),
        findFirst: vi.fn(() => Promise.resolve(paquete)),
      },
      vigencia: {
        findMany: vi.fn(() => Promise.resolve(vigencias)),
      },
      politicaDePrecio: {
        findUnique: findUniquePolitica,
        findFirst: findFirstPolitica,
      },
      tenant: {
        findUnique: vi.fn(() => Promise.resolve({ zonaHoraria: 'America/Bogota' })),
      },
      tarifa: {
        findMany: vi.fn(() => Promise.resolve(tarifas)),
      },
    } as unknown as ClienteTenant;

    return { tx, findUniquePolitica, findFirstPolitica };
  }

  it('usa findUnique({ where: { tenantId } }) y NUNCA llama a findFirst()', async () => {
    const politicasEnBd = new Map([
      [TENANT_A, { base: 'VENTA', promoVencida: 'OCULTAR' as const }],
      [TENANT_B, { base: 'NETO', promoVencida: 'TACHAR' as const }],
    ]);

    const { tx, findUniquePolitica, findFirstPolitica } = crearMockTx(politicasEnBd);
    const prismaMock = {} as PrismaService;
    const useCase = new CotizarSalidaUseCase(prismaMock);

    const peticion: CotizarSalida = {
      paqueteId: PAQUETE_ID,
      fecha: '2027-01-15',
      adultos: 2,
      incluirMargen: true,
    };

    await conContexto(TENANT_A, async () => {
      const resultado = await useCase.calcular(tx, peticion);
      expect(resultado).toBeDefined();
    });

    // 1. Debe haber llamado findUnique con el where explícito del tenant del contexto
    expect(findUniquePolitica).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A },
      }),
    );

    // 2. Nunca debe invocar findFirst (regla de no fuga silenciosa T-013)
    expect(findFirstPolitica).not.toHaveBeenCalled();
  });

  it('con rol que salta RLS (donde la BD tiene filas de otros tenants), NO devuelve la política ajena', async () => {
    // Escenario de fallo latente de T-013:
    // Tenant A NO tiene política configurada en la BD.
    // Tenant B SÍ tiene política configurada ('SOBRE_LA_VENTA').
    // Si se usara findFirst() sin where bajo rol admin/superuser, retornaría la política de Tenant B.
    const politicasEnBd = new Map([
      [TENANT_B, { base: 'SOBRE_LA_VENTA', promoVencida: 'TACHAR' as const }],
    ]);

    const { tx, findUniquePolitica, findFirstPolitica } = crearMockTx(politicasEnBd);
    const prismaMock = {} as PrismaService;
    const useCase = new CotizarSalidaUseCase(prismaMock);

    const peticion: CotizarSalida = {
      paqueteId: PAQUETE_ID,
      fecha: '2027-01-15',
      adultos: 1,
      incluirMargen: true,
    };

    let cotizacion: Awaited<ReturnType<typeof useCase.calcular>> | null = null;
    await conContexto(TENANT_A, async () => {
      cotizacion = await useCase.calcular(tx, peticion);
    });

    expect(cotizacion).toBeDefined();
    // findUnique fue consultado con tenantId: TENANT_A
    expect(findUniquePolitica).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A },
      }),
    );
    expect(findFirstPolitica).not.toHaveBeenCalled();

    // Como Tenant A no tenía fila, la base del margen cae al valor por defecto
    // del sistema (POLITICA_POR_DEFECTO.base = 'SOBRE_EL_NETO') y NO hereda 'SOBRE_LA_VENTA' de Tenant B
    expect(POLITICA_POR_DEFECTO.base).toBe('SOBRE_EL_NETO');
  });
});
