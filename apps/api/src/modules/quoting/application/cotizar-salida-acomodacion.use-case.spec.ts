import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';
import type { CotizarSalida } from '@viajapro/contracts';
import type { ClienteTenant, PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  AcomodacionNoDisponibleError,
  AcomodacionRequeridaError,
  LineasEnMonedasDistintasError,
} from '../domain/errors.js';
import { CotizarSalidaUseCase } from './cotizar-salida.use-case.js';

/** T-188 (acomodación), T-189 (monedas) y T-216 (pasajeros sin tarifa). */
describe('CotizarSalidaUseCase: acomodación, monedas y pasajeros sin tarifa', () => {
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

  const adultoEn = (acomodacion: string, venta: bigint) =>
    tarifa(`t-${acomodacion}`, `Adulto ${acomodacion}`, venta, {
      acomodacion,
      tipoPasajero: 'ADT',
    });

  const hotel = [
    adultoEn('SENCILLA', 2290000n),
    adultoEn('DOBLE', 1590000n),
    adultoEn('TRIPLE', 1430000n),
    adultoEn('CUADRUPLE', 1340000n),
  ];

  const calcularCon = (tarifas: unknown[], peticion: CotizarSalida) => {
    const tx = {
      paquete: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            id: PAQUETE_ID,
            nombre: 'San Andrés',
            destino: 'San Andrés',
            noches: 3,
            cargosEnDestino: [],
            opcionesDeSalida: [],
          }),
        ),
      },
      vigencia: {
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              id: '01932000-0000-7000-8000-0000000000a1',
              desde: new Date('2027-02-01T00:00:00Z'),
              hasta: new Date('2027-06-15T00:00:00Z'),
              publicada: false,
            },
          ]),
        ),
      },
      politicaDePrecio: { findUnique: vi.fn(() => Promise.resolve(null)) },
      tenant: { findUnique: vi.fn(() => Promise.resolve({ zonaHoraria: 'America/Bogota' })) },
      tarifa: { findMany: vi.fn(() => Promise.resolve(tarifas)) },
    } as unknown as ClienteTenant;
    return ContextoTenant.ejecutarCon(
      {
        tenantId: TENANT,
        usuarioId: null,
        identidadId: null,
        permisos: new Set(),
        trazaId: 'traza-t188',
      },
      () => new CotizarSalidaUseCase({} as PrismaService).calcular(tx, peticion),
    );
  };

  const base = { paqueteId: PAQUETE_ID, fecha: '2027-03-10', incluirMargen: false };

  it('T-188: una pareja en DOBLE paga 2 x DOBLE, no la suma de las cuatro acomodaciones', async () => {
    const r = await calcularCon(hotel, { ...base, adultos: 2, acomodacion: 'DOBLE' });
    expect(r.lineas.map((l) => [l.nombre, l.veces])).toEqual([['Adulto DOBLE', 2]]);
    expect(r.total.unidades).toBe('3180000');
  });

  it('T-188: sin acomodación hay error tipado que lista las disponibles, en orden', async () => {
    const promesa = calcularCon([...hotel].reverse(), { ...base, adultos: 2 });
    await expect(promesa).rejects.toBeInstanceOf(AcomodacionRequeridaError);
    await expect(promesa).rejects.toMatchObject({
      code: 'ACOMODACION_REQUERIDA',
      disponibles: ['SENCILLA', 'DOBLE', 'TRIPLE', 'CUADRUPLE'],
    });
  });

  it('T-188: una acomodación sin tarifas es error tipado, no un total de solo traslados', async () => {
    const traslado = tarifa('t-tras', 'Traslado', 90000n, {});
    await expect(
      calcularCon([adultoEn('DOBLE', 1590000n), traslado], {
        ...base,
        adultos: 1,
        acomodacion: 'TRIPLE',
      }),
    ).rejects.toBeInstanceOf(AcomodacionNoDisponibleError);
  });

  it('T-188: la tarifa sin acomodación (traslado) se suma a la de la acomodación pedida', async () => {
    const traslado = tarifa('t-tras', 'Traslado', 90000n, {});
    const r = await calcularCon([...hotel, traslado], {
      ...base,
      adultos: 2,
      acomodacion: 'DOBLE',
    });
    expect(r.lineas.map((l) => l.nombre).sort()).toEqual(['Adulto DOBLE', 'Traslado']);
    expect(r.total.unidades).toBe(String(2 * 1590000 + 2 * 90000));
  });

  it('sin tarifas por acomodación no se exige acomodación', async () => {
    const r = await calcularCon([tarifa('t-a', 'Adulto', 389000n, {})], { ...base, adultos: 2 });
    expect(r.total.unidades).toBe('778000');
  });

  it('T-189: líneas en COP y USD son error tipado, no un total con la moneda de la primera fila', async () => {
    const promesa = calcularCon(
      [
        tarifa('t-cop', 'Adulto', 100000n, {}),
        tarifa('t-usd', 'Seguro', 20n, { monedaIso: 'USD' }),
      ],
      { ...base, adultos: 1 },
    );
    await expect(promesa).rejects.toBeInstanceOf(LineasEnMonedasDistintasError);
    await expect(promesa).rejects.toMatchObject({ code: 'LINEAS_EN_MONEDAS_DISTINTAS' });
  });

  it('T-216: sin tarifa de grupo que lo resuelva, el pasajero sin tarifa se nombra', async () => {
    const menor = tarifa('t-menor', 'Menor de 2 a 11', 292000n, {
      tipoPasajero: 'CHD',
      edadMinima: 2,
      edadMaxima: 11,
    });
    const adulto = tarifa('t-adulto', 'Adulto', 389000n, { tipoPasajero: 'ADT' });
    await expect(
      calcularCon([menor, adulto], { ...base, adultos: 2, ninos: 2, edadesNinos: [7, 14] }),
    ).rejects.toMatchObject({ code: 'PASAJEROS_SIN_TARIFA', pasajeros: ['niño 2 (14 años)'] });
  });

  it('T-216: una alternativa de grupo evita el error (se enseña, no se aplica sola)', async () => {
    const adulto = tarifa('t-adulto', 'Adulto', 389000n, { tipoPasajero: 'ADT' });
    const familiar = tarifa('t-fam', 'Plan familiar', 900000n, {
      unidad: 'POR_GRUPO',
      cubrePasajeros: 3,
    });
    const r = await calcularCon([adulto, familiar], {
      ...base,
      adultos: 2,
      ninos: 1,
      edadesNinos: [14],
    });
    expect(r.alternativas.map((a) => a.nombre)).toEqual(['Plan familiar']);
  });

  it('T-216: con todos cubiertos no hay error', async () => {
    const r = await calcularCon([tarifa('t-a', 'Adulto', 389000n, {})], {
      ...base,
      adultos: 2,
      ninos: 1,
      edadesNinos: [14],
    });
    expect(r.total.unidades).toBe('1167000');
  });
});
