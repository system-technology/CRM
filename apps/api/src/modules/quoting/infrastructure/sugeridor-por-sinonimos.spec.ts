import { PLANTILLAS_DE_SISTEMA } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { SugeridorPorSinonimos } from './sugeridor-por-sinonimos.js';

const sugeridor = new SugeridorPorSinonimos();

describe('SugeridorPorSinonimos', () => {
  it('con marcador y encabezados de la plantilla, todo con confianza 1', () => {
    const plantilla = PLANTILLAS_DE_SISTEMA.find((p) => p.formato === 'excursion-un-dia');
    const encabezados = plantilla?.columnas.map((c) => c.etiqueta) ?? [];
    const r = sugeridor.sugerir({
      encabezados,
      marcador: '#viajapro;plantilla=excursion-un-dia;version=1',
    });
    expect(r.formato).toBe('excursion-un-dia');
    expect(r.version).toBe(1);
    expect(Object.keys(r.columnas)).toHaveLength(encabezados.length);
    expect(Object.values(r.columnas).every((c) => c.confianza === 1)).toBe(true);
    expect(r.sinMapear).toEqual([]);
  });

  it('sin marcador mapea Tour, Precio, PVP, Valor y Fecha salida por sinónimos', () => {
    const a = sugeridor.sugerir({ encabezados: ['Tour', 'Fecha salida', 'Precio', 'Notas'] });
    expect(a.columnas['nombre']?.indice).toBe(0);
    expect(a.columnas['vigencia_desde']?.indice).toBe(1);
    expect(a.columnas['precio_venta']?.indice).toBe(2);
    expect(a.columnas['nombre']?.confianza).toBeLessThan(1);
    expect(a.sinMapear).toEqual([3]);
    expect(sugeridor.sugerir({ encabezados: ['PVP'] }).columnas['precio_venta']?.indice).toBe(0);
    expect(sugeridor.sugerir({ encabezados: ['Valor'] }).columnas['precio_venta']?.indice).toBe(0);
  });

  it('un encabezado desconocido queda sin mapear', () => {
    const r = sugeridor.sugerir({ encabezados: ['Tour', 'Color favorito'] });
    expect(r.sinMapear).toEqual([1]);
  });

  it('un marcador de formato desconocido cae al formato por defecto', () => {
    const r = sugeridor.sugerir({
      encabezados: ['Tour'],
      marcador: '#viajapro;plantilla=xx;version=1',
    });
    expect(r.formato).toBe('excursion-un-dia');
  });
});
