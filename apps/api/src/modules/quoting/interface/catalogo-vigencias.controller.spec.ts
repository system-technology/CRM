/**
 * Las seis rutas de vigencias y tarifas exigen `catalogo.administrar`, y enviar un neto sin
 * `cotizacion.ver_neto_y_margen` es 403 antes de llegar al aplicador.
 */
import 'reflect-metadata';

import { ForbiddenException, RequestMethod } from '@nestjs/common';
import type { Permiso } from '@viajapro/contracts';
import { describe, expect, it, vi } from 'vitest';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import type { AplicadorPorId } from '../application/aplicador-por-id.js';
import { CatalogoVigenciasController } from './catalogo-vigencias.controller.js';

const VERBOS = new Map<number, string>([
  [RequestMethod.GET, 'GET'],
  [RequestMethod.POST, 'POST'],
  [RequestMethod.PATCH, 'PATCH'],
  [RequestMethod.DELETE, 'DELETE'],
]);

const proto = CatalogoVigenciasController.prototype as unknown as Record<string, unknown>;
const metodos = Object.getOwnPropertyNames(proto).filter(
  (n) => n !== 'constructor' && typeof proto[n] === 'function',
);

describe('CatalogoVigenciasController', () => {
  it('expone exactamente las seis rutas del contrato', () => {
    const rutas = metodos.map((n) => {
      const manejador = proto[n] as object;
      const verbo = VERBOS.get(Reflect.getMetadata('method', manejador) as number);
      return `${verbo} ${String(Reflect.getMetadata('path', manejador))}`;
    });
    expect(rutas.sort()).toEqual(
      [
        'DELETE tarifas/:id',
        'GET paquetes/:id/vigencias',
        'PATCH tarifas/:id',
        'PATCH vigencias/:id',
        'POST vigencias',
        'POST vigencias/:id/tarifas',
      ].sort(),
    );
  });

  it('cada ruta declara @RequierePermiso(catalogo.administrar)', () => {
    for (const n of metodos) {
      const requeridos = Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto[n] as object);
      expect(requeridos, n).toEqual(['catalogo.administrar']);
    }
  });
});

describe('neto sin cotizacion.ver_neto_y_margen', () => {
  const aplicador = {
    crearVigencia: vi.fn(),
    crearTarifa: vi.fn(),
    editarTarifa: vi.fn(),
  };
  const controlador = new CatalogoVigenciasController(aplicador as unknown as AplicadorPorId);
  const dinero = { unidades: '700000', moneda: 'COP' as const };
  const tarifa = {
    nombre: 'Adulto',
    unidad: 'POR_PERSONA' as const,
    cubrePasajeros: 1,
    neto: dinero,
    venta: { unidades: '900000', moneda: 'COP' as const },
    mayoristaId: null,
    aditiva: false,
    condicion: {
      acomodacion: null,
      tipoPasajero: null,
      edadMinima: null,
      edadMaxima: null,
      pasajerosMinimo: null,
      pasajerosMaximo: null,
      ocupaSilla: null,
    },
  };

  const como = <T>(permisos: Permiso[], fn: () => Promise<T>) =>
    ContextoTenant.ejecutarCon(
      {
        tenantId: '01932000-0000-7000-8000-0000000000d1',
        usuarioId: null,
        identidadId: null,
        permisos: new Set(permisos),
        trazaId: 't',
      },
      fn,
    );

  it('crear vigencia, crear tarifa y editar tarifa con neto responden 403 y no llaman al aplicador', async () => {
    const solo: Permiso[] = ['catalogo.administrar'];
    await expect(
      como(solo, () =>
        controlador.crearVigencia({
          paqueteId: 'p',
          desde: '2027-01-01',
          hasta: '2027-01-31',
          publicada: false,
          cupoTotal: null,
          tarifas: [tarifa],
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(como(solo, () => controlador.crearTarifa('v', tarifa))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      como(solo, () => controlador.editarTarifa('t', { neto: dinero })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      como(solo, () => controlador.editarTarifa('t', { neto: null })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(aplicador.crearVigencia).not.toHaveBeenCalled();
    expect(aplicador.crearTarifa).not.toHaveBeenCalled();
    expect(aplicador.editarTarifa).not.toHaveBeenCalled();
  });

  it('con el permiso, el neto pasa; sin neto en el cuerpo no se exige', async () => {
    await como(['catalogo.administrar', 'cotizacion.ver_neto_y_margen'], () =>
      controlador.crearTarifa('v', tarifa),
    );
    await como(['catalogo.administrar'], () =>
      controlador.editarTarifa('t', { venta: { unidades: '1', moneda: 'COP' } }),
    );
    expect(aplicador.crearTarifa).toHaveBeenCalledTimes(1);
    expect(aplicador.editarTarifa).toHaveBeenCalledTimes(1);
  });
});
