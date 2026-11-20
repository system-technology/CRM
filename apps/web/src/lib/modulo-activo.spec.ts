import { describe, expect, it } from 'vitest';
import { esDetalleMovilDeBandeja, moduloActivo } from './modulo-activo';

describe('moduloActivo', () => {
  it.each([
    ['/bandeja', 'bandeja'],
    ['/bandeja/abc', 'bandeja'],
    ['/pipeline', 'pipeline'],
    ['/cotizador', 'cotizador'],
    ['/viajes', 'viajes'],
    ['/viajes?id=abc', 'viajes'],
    ['/contactos', 'contactos'],
    ['/contactos/c-1', 'contactos'],
    ['/catalogo', 'catalogo'],
    ['/reportes', 'reportes'],
    ['/configuracion', 'configuracion'],
    ['/configuracion/whatsapp', 'configuracion'],
    ['/bienvenida', 'configuracion'],
  ])('%s activa %s', (ruta, esperado) => {
    expect(moduloActivo(ruta)).toBe(esperado);
  });

  it.each([
    ['/', 'Hoy no es ítem del menú todavía'],
    ['/seguimientos', 'Seguimientos no es ítem todavía'],
    ['/cotizaciones', 'Cotizaciones no es ítem todavía'],
    ['/cotizaciones/x', 'Cotizaciones no es ítem todavía'],
    ['/ensayo', 'privada fuera del menú'],
    ['/bandejas', 'el prefijo exige límite de segmento'],
    ['', 'vacía'],
  ])('%s no activa ningún módulo (%s)', (ruta) => {
    expect(moduloActivo(ruta)).toBeNull();
  });

  it('null y undefined no activan nada', () => {
    expect(moduloActivo(null)).toBeNull();
    expect(moduloActivo(undefined)).toBeNull();
  });
});

describe('esDetalleMovilDeBandeja', () => {
  it('solo /bandeja/[id]', () => {
    expect(esDetalleMovilDeBandeja('/bandeja/abc')).toBe(true);
    expect(esDetalleMovilDeBandeja('/bandeja')).toBe(false);
    expect(esDetalleMovilDeBandeja('/pipeline')).toBe(false);
    expect(esDetalleMovilDeBandeja(null)).toBe(false);
  });
});
