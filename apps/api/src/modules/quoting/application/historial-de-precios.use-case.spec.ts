import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import { CambioDePrecio } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { TarifaNoEncontradaError } from '../domain/errores-de-gestion.js';
import { HistorialDePreciosController as Controlador } from '../interface/historial-de-precios.controller.js';
import { HistorialDePreciosUseCase } from './historial-de-precios.use-case.js';
import { type FilaDeHistorial, LectorDeHistorial } from './puertos-de-historial.js';

const USUARIO = '01932000-0000-7000-8000-000000000001';
const CLAVE = '01932000-0000-7000-8000-0000000000aa';

const fila = (
  id: number,
  detalle: unknown,
  accion = 'catalogo.tarifa.modificada',
  actor: Pick<FilaDeHistorial, 'usuarioId' | 'tipoDeActor' | 'claveDeApiId'> = {
    usuarioId: USUARIO,
    tipoDeActor: 'USUARIO',
    claveDeApiId: null,
  },
): FilaDeHistorial => ({
  id: String(id),
  ocurridoEn: new Date(Date.UTC(2026, 9, 1, 0, 0, id)),
  ...actor,
  accion,
  detalle,
});

const cambio = (campo: string, antes: string | null, despues: string | null) => ({
  campo,
  antes,
  despues,
  moneda: 'COP',
  origen: 'PANTALLA',
  huella: 'h',
});

/** Lector en memoria: las filas ya vienen de la más nueva a la más antigua. */
class LectorFalso extends LectorDeHistorial {
  constructor(private readonly filas: FilaDeHistorial[] | null) {
    super();
  }
  leer(_t: string, tope: number, cursor: string | undefined) {
    if (this.filas === null) return Promise.resolve(null);
    const visibles = this.filas.filter(
      (f) => cursor === undefined || Number(f.id) < Number(cursor),
    );
    return Promise.resolve(visibles.slice(0, tope));
  }
}

const FILAS = [
  fila(5, cambio('neto', '700000', '720000')),
  fila(4, cambio('venta', '950000', '990000')),
  fila(3, cambio('venta', '900000', '950000')),
  fila(2, { origen: 'PANTALLA', venta: '990000', moneda: 'COP' }, 'catalogo.tarifa.eliminada'),
  fila(1, { cualquier: 'cosa' }),
];

describe('HistorialDePreciosUseCase', () => {
  it('devuelve las entradas de la más reciente a la más antigua con antes, después y origen', async () => {
    const uc = new HistorialDePreciosUseCase(new LectorFalso(FILAS));
    const r = await uc.ejecutar('t', { limite: 20 }, true);
    expect(r.datos.map((d) => d.id)).toEqual(['5', '4', '3', '2']);
    expect(r.datos[1]).toMatchObject({
      campo: 'venta',
      antes: '950000',
      despues: '990000',
      moneda: 'COP',
      origen: 'PANTALLA',
      usuarioId: USUARIO,
      instante: '2026-10-01T00:00:04.000Z',
    });
    expect(r.datos[3]).toMatchObject({ campo: 'venta', antes: '990000', despues: null });
    expect(r.siguienteCursor).toBeNull();
  });

  it('sin permiso de neto, la entrada de neto no lleva antes ni después (la clave se omite)', async () => {
    const uc = new HistorialDePreciosUseCase(new LectorFalso(FILAS));
    const r = await uc.ejecutar('t', { limite: 20 }, false);
    const neto = r.datos[0];
    expect(neto?.campo).toBe('neto');
    expect(neto).not.toHaveProperty('antes');
    expect(neto).not.toHaveProperty('despues');
    expect(JSON.stringify(r)).not.toContain('720000');
    expect(JSON.stringify(r)).not.toContain('700000');
  });

  it('pagina por cursor sin repetir ni saltar entradas', async () => {
    const uc = new HistorialDePreciosUseCase(new LectorFalso(FILAS));
    const p1 = await uc.ejecutar('t', { limite: 2 }, true);
    expect(p1.datos.map((d) => d.id)).toEqual(['5', '4']);
    expect(p1.siguienteCursor).toBe('4');
    const p2 = await uc.ejecutar('t', { limite: 2, cursor: p1.siguienteCursor ?? '' }, true);
    expect(p2.datos.map((d) => d.id)).toEqual(['3', '2']);
    expect(p2.siguienteCursor).toBe('2');
    const p3 = await uc.ejecutar('t', { limite: 2, cursor: '2' }, true);
    expect(p3.datos).toEqual([]);
    expect(p3.siguienteCursor).toBeNull();
  });

  it('dice si actuó un usuario o una clave de API, sin datos personales; null en lo anterior a T-071', async () => {
    const uc = new HistorialDePreciosUseCase(
      new LectorFalso([
        fila(3, cambio('venta', '1', '2'), 'catalogo.tarifa.modificada', {
          usuarioId: null,
          tipoDeActor: 'CLAVE_DE_API',
          claveDeApiId: CLAVE,
        }),
        fila(2, cambio('venta', '0', '1')),
        fila(1, cambio('venta', null, '0'), 'catalogo.tarifa.creada', {
          usuarioId: USUARIO,
          tipoDeActor: null,
          claveDeApiId: null,
        }),
      ]),
    );
    const r = await uc.ejecutar('t', { limite: 20 }, true);
    expect(r.datos.map((d) => [d.usuarioId, d.actor])).toEqual([
      [null, { tipo: 'CLAVE_DE_API', claveDeApiId: CLAVE }],
      [USUARIO, { tipo: 'USUARIO', claveDeApiId: null }],
      [USUARIO, null],
    ]);
    // Lo que sale cumple el contrato, y del actor solo viajan tipo e identificadores opacos.
    for (const d of r.datos) {
      expect(CambioDePrecio.parse(d)).toEqual(d);
      expect(Object.keys(d.actor ?? {}).sort()).toEqual(d.actor ? ['claveDeApiId', 'tipo'] : []);
    }
  });

  it('una tarifa inexistente es TarifaNoEncontradaError (404)', async () => {
    const uc = new HistorialDePreciosUseCase(new LectorFalso(null));
    await expect(uc.ejecutar('t', { limite: 20 }, true)).rejects.toBeInstanceOf(
      TarifaNoEncontradaError,
    );
  });
});

describe('HistorialDePreciosController', () => {
  it('es GET tarifas/:id/historial y exige catalogo.administrar', () => {
    const manejador = (Controlador.prototype as unknown as Record<string, object>)['listar'] ?? {};
    expect(Reflect.getMetadata('method', manejador)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('path', manejador)).toBe('tarifas/:id/historial');
    expect(Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, manejador)).toEqual([
      'catalogo.administrar',
    ]);
  });
});
