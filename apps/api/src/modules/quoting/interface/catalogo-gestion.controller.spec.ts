/**
 * Las tres rutas de gestión exigen `catalogo.administrar` y no existe ruta DELETE de paquete.
 * El guard global lee esta metadata; con ella, sin el permiso la respuesta es 403
 * (`permisos.spec.ts` prueba el guard). Aquí se fija que ninguna ruta se quede sin declararla.
 */
import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { CatalogoGestionController } from './catalogo-gestion.controller.js';

const MENSAJES = new Map<number, string>([
  [RequestMethod.GET, 'GET'],
  [RequestMethod.POST, 'POST'],
  [RequestMethod.PATCH, 'PATCH'],
  [RequestMethod.DELETE, 'DELETE'],
]);

describe('CatalogoGestionController', () => {
  const proto = CatalogoGestionController.prototype as unknown as Record<string, unknown>;
  const metodos = Object.getOwnPropertyNames(proto).filter(
    (n) => n !== 'constructor' && typeof proto[n] === 'function',
  );

  it('expone exactamente alta, edición y desactivación', () => {
    const rutas = metodos.map((n) => {
      const manejador = proto[n] as object;
      const verbo = MENSAJES.get(Reflect.getMetadata('method', manejador) as number);
      return `${verbo} ${String(Reflect.getMetadata('path', manejador))}`;
    });
    expect(rutas.sort()).toEqual(['PATCH :id', 'POST /', 'POST :id/desactivar']);
  });

  it('cada ruta declara @RequierePermiso(catalogo.administrar)', () => {
    for (const n of metodos) {
      const requeridos = Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto[n] as object);
      expect(requeridos, n).toEqual(['catalogo.administrar']);
    }
  });
});
