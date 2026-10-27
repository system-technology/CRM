/**
 * Las dos rutas de importación exigen `catalogo.administrar` (el guard global lee esta metadata y
 * responde 403 sin el permiso; `permisos.spec.ts` prueba el guard), y los topes de la tabla
 * responden 413 antes de validar ninguna fila.
 */
import 'reflect-metadata';

import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { ImportacionesController, verificarTopesDeLaTabla } from './importaciones.controller.js';

describe('ImportacionesController', () => {
  const proto = ImportacionesController.prototype as unknown as Record<string, unknown>;
  const metodos = Object.getOwnPropertyNames(proto).filter(
    (n) => n !== 'constructor' && typeof proto[n] === 'function',
  );

  it('expone confirmar, previsualizar y sugerir-mapeo, todas con catalogo.administrar', () => {
    const rutas = metodos.map((n) => String(Reflect.getMetadata('path', proto[n] as object)));
    expect(rutas.sort()).toEqual(['confirmar', 'previsualizar', 'sugerir-mapeo']);
    for (const n of metodos) {
      expect(Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto[n] as object), n).toEqual([
        'catalogo.administrar',
      ]);
    }
  });
});

describe('verificarTopesDeLaTabla', () => {
  const estadoDe = (cuerpo: unknown): number | null => {
    try {
      verificarTopesDeLaTabla(cuerpo);
      return null;
    } catch (e) {
      return e instanceof HttpException ? e.getStatus() : -1;
    }
  };

  it('2.001 filas, 41 columnas o 41 encabezados son 413', () => {
    expect(estadoDe({ tabla: { encabezados: ['a'], filas: Array(2001).fill(['x']) } })).toBe(413);
    expect(estadoDe({ tabla: { encabezados: ['a'], filas: [Array(41).fill('x')] } })).toBe(413);
    expect(estadoDe({ tabla: { encabezados: Array(41).fill('a'), filas: [] } })).toBe(413);
  });

  it('2.000 filas pasan y lo que no es tabla lo deja a Zod', () => {
    expect(estadoDe({ tabla: { encabezados: ['a'], filas: Array(2000).fill(['x']) } })).toBeNull();
    expect(estadoDe({ propuesta: {} })).toBeNull();
    expect(estadoDe('basura')).toBeNull();
  });
});
