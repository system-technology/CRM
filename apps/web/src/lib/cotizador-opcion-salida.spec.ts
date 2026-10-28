import { describe, expect, it } from 'vitest';
import { armarComposicionDeVersion } from './cotizaciones-logica';
import {
  faltaElegirOpcionDeSalida,
  interpretarErrorCotizacion,
  opcionDeSalidaAEnviar,
  opcionesActivasDeSalida,
} from './cotizador-logica';

const OP_A = '01932000-0000-7000-8000-0000000000a1';
const OP_B = '01932000-0000-7000-8000-0000000000a2';
const OP_OFF = '01932000-0000-7000-8000-0000000000a3';
const opciones = [
  { id: OP_B, activa: true, orden: 2 },
  { id: OP_OFF, activa: false, orden: 0 },
  { id: OP_A, activa: true, orden: 1 },
];

describe('opción de salida en el cotizador (T-063)', () => {
  it('solo ofrece las activas, en orden', () => {
    expect(opcionesActivasDeSalida(opciones).map((o) => o.id)).toEqual([OP_A, OP_B]);
  });

  it('con opciones activas obliga a elegir; sin opciones no cambia nada', () => {
    expect(faltaElegirOpcionDeSalida(opciones, '')).toBe(true);
    expect(faltaElegirOpcionDeSalida(opciones, OP_OFF)).toBe(true);
    expect(faltaElegirOpcionDeSalida(opciones, OP_A)).toBe(false);
    expect(faltaElegirOpcionDeSalida([], '')).toBe(false);
    expect(faltaElegirOpcionDeSalida(undefined, '')).toBe(false);
    expect(faltaElegirOpcionDeSalida([{ id: OP_OFF, activa: false, orden: 0 }], '')).toBe(false);
  });

  it('envía la opción elegida y nada cuando no aplica', () => {
    expect(opcionDeSalidaAEnviar(opciones, OP_B)).toBe(OP_B);
    expect(opcionDeSalidaAEnviar(opciones, OP_OFF)).toBeUndefined();
    expect(opcionDeSalidaAEnviar([], OP_B)).toBeUndefined();
  });

  it('guardar incluye opcionDeSalidaId solo si hay', () => {
    const base = {
      paqueteId: '01932000-0000-7000-8000-000000000010',
      fecha: '2026-10-15',
      adultos: 2,
    };
    expect(armarComposicionDeVersion({ ...base, opcionDeSalidaId: OP_A }).opcionDeSalidaId).toBe(
      OP_A,
    );
    expect(armarComposicionDeVersion(base)).not.toHaveProperty('opcionDeSalidaId');
  });

  it('explica el 422 OPCION_DE_SALIDA_REQUERIDA', () => {
    const r = interpretarErrorCotizacion({ code: 'OPCION_DE_SALIDA_REQUERIDA' });
    expect(r.codigo).toBe('OPCION_DE_SALIDA_REQUERIDA');
    expect(r.mensaje).toMatch(/elige una/i);
  });
});
