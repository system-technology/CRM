import { describe, expect, it } from 'vitest';
import {
  ACCIONES,
  NAVEGACION,
  moduloActivo,
  tituloDeDocumento,
  tituloDeDocumentoParaRuta,
} from './navegacion';

const ORDEN_DEL_MENU = [
  'Hoy',
  'Conversaciones',
  'Oportunidades',
  'Cotizaciones',
  'Archivos de viaje',
  'Seguimientos',
  'Contactos',
  'Catálogo',
  'Reportes',
  'Configuración',
];

describe('NAVEGACION', () => {
  it('ids y rutas son únicos', () => {
    expect(new Set(NAVEGACION.map((e) => e.id)).size).toBe(NAVEGACION.length);
    expect(new Set(NAVEGACION.map((e) => e.ruta)).size).toBe(NAVEGACION.length);
  });

  it('sigue el orden del menú objetivo', () => {
    expect(NAVEGACION.map((e) => e.etiqueta)).toEqual(ORDEN_DEL_MENU);
  });

  it('tiene exactamente 3 entradas en la barra móvil: Hoy, Conversaciones y Archivos de viaje', () => {
    const barra = NAVEGACION.filter((e) => e.movil === 'barra').map((e) => e.etiqueta);
    expect(barra).toEqual(['Hoy', 'Conversaciones', 'Archivos de viaje']);
  });

  it('la etiqueta corta está contenida en la etiqueta', () => {
    for (const e of NAVEGACION) {
      if (e.etiquetaCorta) expect(e.etiqueta).toContain(e.etiquetaCorta);
    }
  });

  it('Hoy, Cotizaciones y Seguimientos quedan fuera del menú hasta T-317', () => {
    const fuera = NAVEGACION.filter((e) => !e.enMenu).map((e) => e.etiqueta);
    expect(fuera).toEqual(['Hoy', 'Cotizaciones', 'Seguimientos']);
  });

  it('expone la acción Cotizar hacia /cotizador', () => {
    expect(ACCIONES).toContainEqual({ id: 'cotizar', etiqueta: 'Cotizar', ruta: '/cotizador' });
  });
});

describe('moduloActivo', () => {
  const casos: [string, string | null][] = [
    ['/', 'Hoy'],
    ['/bandeja', 'Conversaciones'],
    ['/bandeja/abc', 'Conversaciones'],
    ['/bandeja/', 'Conversaciones'],
    ['/pipeline', 'Oportunidades'],
    ['/cotizador', 'Cotizaciones'],
    ['/cotizaciones', 'Cotizaciones'],
    ['/cotizaciones/123', 'Cotizaciones'],
    ['/viajes?id=abc', 'Archivos de viaje'],
    ['/seguimientos', 'Seguimientos'],
    ['/contactos/9', 'Contactos'],
    ['/catalogo', 'Catálogo'],
    ['/reportes', 'Reportes'],
    ['/configuracion', 'Configuración'],
    ['/configuracion/whatsapp', 'Configuración'],
    ['/bienvenida', 'Configuración'],
    ['/bandejas', null],
    ['/ensayo', null],
  ];
  it.each(casos)('%s -> %s', (ruta, etiqueta) => {
    expect(moduloActivo(ruta)?.etiqueta ?? null).toBe(etiqueta);
  });
});

describe('tituloDeDocumento', () => {
  it('compone «{pantalla} · ViajaPro»', () => {
    expect(tituloDeDocumento('Conversaciones')).toBe('Conversaciones · ViajaPro');
    expect(tituloDeDocumentoParaRuta('/cotizador')).toBe('Cotizaciones · ViajaPro');
  });
  it('sin pantalla devuelve solo la marca', () => {
    expect(tituloDeDocumento()).toBe('ViajaPro');
    expect(tituloDeDocumentoParaRuta('/ensayo')).toBe('ViajaPro');
  });
});
