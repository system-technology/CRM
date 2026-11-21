import { describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { TituloDePantalla } from '../components/comun/titulo-de-pantalla';
import { ACCIONES_RAPIDAS } from './buscador-global-logica';
import {
  ACCIONES,
  NAVEGACION,
  elementosDeBarraMovil,
  entradaDe,
  entradaParaUsuario,
  entradasDeHojaMas,
  entradasDelMenu,
  etiquetaDeBarra,
  esDetalleMovilDeBandeja,
  esVisiblePara,
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
  'Cobros',
  'Seguimientos',
  'Contactos',
  'Catálogo',
  'Reportes de la agencia',
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

  it('tiene exactamente 3 módulos en la barra móvil: Hoy, Conversaciones y Archivos de viaje', () => {
    const barra = NAVEGACION.filter((e) => e.movil === 'barra').map((e) => e.etiqueta);
    expect(barra).toEqual(['Hoy', 'Conversaciones', 'Archivos de viaje']);
  });

  it('la barra móvil es Hoy · Conversaciones · Cotizar · Archivos (y «Más» la añade la barra)', () => {
    const rotulos = elementosDeBarraMovil().map((e) =>
      e.tipo === 'modulo' ? etiquetaDeBarra(e.entrada) : e.accion.etiqueta,
    );
    expect(rotulos).toEqual(['Hoy', 'Conversaciones', 'Cotizar', 'Archivos']);
    const cotizar = elementosDeBarraMovil().find((e) => e.tipo === 'accion');
    expect(cotizar?.tipo === 'accion' && cotizar.accion.ruta).toBe('/cotizador');
  });

  it('la hoja «Más» tiene el resto del menú, en orden, y ninguno de la barra', () => {
    const mas = entradasDeHojaMas().map((e) => e.etiqueta);
    expect(mas).toEqual([
      'Oportunidades',
      'Cotizaciones',
      'Cobros',
      'Seguimientos',
      'Contactos',
      'Catálogo',
      'Reportes de la agencia',
      'Configuración',
    ]);
    // Cada módulo del menú está en la barra o en la hoja: ninguno se queda sin camino en móvil.
    const enBarra = NAVEGACION.filter((e) => e.movil === 'barra').length;
    expect(enBarra + mas.length).toBe(entradasDelMenu().length);
  });

  it('la etiqueta corta está contenida en la etiqueta', () => {
    for (const e of NAVEGACION) {
      if (e.etiquetaCorta) expect(e.etiqueta).toContain(e.etiquetaCorta);
    }
  });

  it('el menú es el objetivo: Hoy primero y Seguimientos entre Archivos de viaje y Contactos', () => {
    expect(NAVEGACION.filter((e) => !e.enMenu)).toEqual([]);
    expect(entradasDelMenu().map((e) => e.etiqueta)).toEqual([
      'Hoy',
      'Conversaciones',
      'Oportunidades',
      'Cotizaciones',
      'Archivos de viaje',
      'Cobros',
      'Seguimientos',
      'Contactos',
      'Catálogo',
      'Reportes de la agencia',
      'Configuración',
    ]);
  });

  it('etiqueta del menú = comando de la paleta = H1 (una sola fuente)', () => {
    const titulosPaleta = new Map(ACCIONES_RAPIDAS.map((a) => [a.id, a.titulo]));
    for (const e of NAVEGACION) {
      expect(titulosPaleta.get(`nav-${e.id}`)).toBe(e.etiqueta);
      cleanup();
      render(React.createElement(TituloDePantalla, { modulo: e.id }));
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(e.etiqueta);
    }
    cleanup();
  });

  it('el cotizador no es módulo: es la acción «Cotizar» y activa Cotizaciones', () => {
    expect(NAVEGACION.some((e) => e.etiqueta.toLowerCase().includes('cotizador'))).toBe(false);
    expect(moduloActivo('/cotizador')?.id).toBe('cotizaciones');
  });

  it('expone la acción Cotizar hacia /cotizador', () => {
    const cotizar = ACCIONES.find((a) => a.id === 'cotizar');
    expect(cotizar).toMatchObject({ etiqueta: 'Cotizar', ruta: '/cotizador', movil: 'barra' });
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
    ['/reportes', 'Reportes de la agencia'],
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

describe('permiso', () => {
  const tiene =
    (...concedidos: string[]) =>
    (p: string) =>
      concedidos.includes(p);

  it('Reportes no lleva permiso: lo ven todos los roles (D3)', () => {
    const reportes = entradaDe('reportes');
    expect(reportes.permiso).toBeUndefined();
    expect(esVisiblePara(reportes, tiene())).toBe(true);
  });

  it('Configuración se muestra con cualquiera de sus tres permisos y se oculta sin ellos', () => {
    const config = entradaDe('configuracion');
    expect(esVisiblePara(config, tiene())).toBe(false);
    expect(esVisiblePara(config, tiene('conversaciones.responder'))).toBe(false);
    for (const p of ['usuarios.administrar', 'roles.administrar', 'catalogo.administrar']) {
      expect(esVisiblePara(config, tiene(p))).toBe(true);
    }
  });

  it('un permiso suelto exige ese permiso', () => {
    const e = { ...entradaDe('catalogo'), permiso: 'catalogo.administrar' as const };
    expect(esVisiblePara(e, tiene())).toBe(false);
    expect(esVisiblePara(e, tiene('catalogo.administrar'))).toBe(true);
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

describe('tituloDeDocumento', () => {
  it('compone «{pantalla} · ViajaPro»', () => {
    expect(tituloDeDocumento('Conversaciones')).toBe('Conversaciones · ViajaPro');
    expect(tituloDeDocumentoParaRuta('/cotizador')).toBe('Cotizaciones · ViajaPro');
  });
  it('moduloActivo tolera null y undefined', () => {
    expect(moduloActivo(null)).toBeNull();
    expect(moduloActivo(undefined)).toBeNull();
  });
  it('sin pantalla devuelve solo la marca', () => {
    expect(tituloDeDocumento()).toBe('ViajaPro');
    expect(tituloDeDocumentoParaRuta('/ensayo')).toBe('ViajaPro');
  });
});

describe('entradaParaUsuario: una sola entrada de reportes, dos títulos (ADR-0035 §5)', () => {
  const reportes = entradaDe('reportes');

  it('sin reportes.ver_agencia se titula «Mis números»', () => {
    const e = entradaParaUsuario(reportes, () => false);
    expect(e.etiqueta).toBe('Mis números');
    expect(etiquetaDeBarra(e)).toBe('Mis números');
    expect(e.ruta).toBe('/reportes');
  });

  it('con reportes.ver_agencia, «Reportes de la agencia»', () => {
    const e = entradaParaUsuario(reportes, (p) => p === 'reportes.ver_agencia');
    expect(e.etiqueta).toBe('Reportes de la agencia');
  });

  it('sin sesión no afirma nada: queda la etiqueta general', () => {
    expect(entradaParaUsuario(reportes, null).etiqueta).toBe('Reportes de la agencia');
  });

  it('solo hay una entrada a /reportes en el menú', () => {
    expect(entradasDelMenu().filter((e) => e.ruta === '/reportes')).toHaveLength(1);
  });

  it('las demás entradas no cambian', () => {
    const hoy = entradaDe('hoy');
    expect(entradaParaUsuario(hoy, () => false)).toBe(hoy);
  });
});
