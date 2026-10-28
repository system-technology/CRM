import { describe, it, expect } from 'vitest';
import {
  cumpleTamanoMinimoTactil,
  esViewportMovil,
  validarAccesibilidadElemento,
  obtenerModulosBarraInferior,
  BREAKPOINT_MOVIL_MAX_PX,
  ANCHO_MINIMO_TEST_MOVIL_PX,
  TAMANO_MINIMO_TACTIL_PX,
  ATAJOS_BANDEJA,
  coincideAtajo,
  validarContrasteWCAG,
} from './accesibilidad-logica';

describe('accesibilidad-logica (WCAG AA & Directrices Móviles, T-024)', () => {
  it('valida correctamente el tamaño mínimo táctil de 44 px (WCAG 2.5.5)', () => {
    expect(TAMANO_MINIMO_TACTIL_PX).toBe(44);
    // Chip defectuoso de 24px según DISENO-BANDEJA.md
    expect(cumpleTamanoMinimoTactil(80, 24)).toBe(false);
    expect(cumpleTamanoMinimoTactil(32, 32)).toBe(false);
    // Chip corregido móvil >= 44px
    expect(cumpleTamanoMinimoTactil(44, 44)).toBe(true);
    expect(cumpleTamanoMinimoTactil(80, 48)).toBe(true);
  });

  it('detecta viewports móviles <= 767 px y prueba mínima de 375 px', () => {
    expect(BREAKPOINT_MOVIL_MAX_PX).toBe(767);
    expect(ANCHO_MINIMO_TEST_MOVIL_PX).toBe(375);

    expect(esViewportMovil(375)).toBe(true);
    expect(esViewportMovil(767)).toBe(true);
    expect(esViewportMovil(768)).toBe(false); // Tablet iPad portrait
    expect(esViewportMovil(1024)).toBe(false); // Desktop
  });

  it('exige descripción accesible en botones de solo icono', () => {
    // Botón solo icono sin etiqueta ni aria-label
    const botonInvalido = validarAccesibilidadElemento({
      esSoloIcono: true,
      ariaLabel: '',
      etiqueta: '',
    });
    expect(botonInvalido.valido).toBe(false);
    expect(botonInvalido.motivo).toContain('aria-label');

    // Botón solo icono con aria-label
    const botonValidoAria = validarAccesibilidadElemento({
      esSoloIcono: true,
      ariaLabel: 'Buscar conversaciones (Cmd+K)',
    });
    expect(botonValidoAria.valido).toBe(true);

    // Botón con texto visible
    const botonTexto = validarAccesibilidadElemento({
      etiqueta: 'Enviar cotización',
    });
    expect(botonTexto.valido).toBe(true);
  });

  it('filtra módulos prioritarios para la barra de navegación móvil inferior', () => {
    const todos = [
      { id: 'bandeja', nombre: 'Bandeja' },
      { id: 'pipeline', nombre: 'Pipeline' },
      { id: 'cotizador', nombre: 'Cotizador' },
      { id: 'viajes', nombre: 'Viajes' },
      { id: 'contactos', nombre: 'Contactos' },
      { id: 'catalogo', nombre: 'Catálogo' },
      { id: 'reportes', nombre: 'Reportes' },
      { id: 'configuracion', nombre: 'Configuración' },
    ];

    const inferiores = obtenerModulosBarraInferior(todos);
    expect(inferiores.length).toBe(4);
    expect(inferiores.map((m) => m.id)).toEqual(['bandeja', 'pipeline', 'cotizador', 'viajes']);
  });

  it('declara y valida atajos de teclado oficiales para la bandeja (T-024)', () => {
    expect(ATAJOS_BANDEJA.length).toBeGreaterThanOrEqual(8);
    expect(ATAJOS_BANDEJA.some((a) => a.tecla === 'j')).toBe(true);
    expect(ATAJOS_BANDEJA.some((a) => a.tecla === 'k')).toBe(true);
    expect(ATAJOS_BANDEJA.some((a) => a.tecla === 'p' && a.modificador === 'Alt')).toBe(true);
    expect(ATAJOS_BANDEJA.some((a) => a.tecla === 'Escape')).toBe(true);

    const atajoAltP = ATAJOS_BANDEJA.find((a) => a.tecla === 'p' && a.modificador === 'Alt')!;
    expect(coincideAtajo({ key: 'p', altKey: true }, atajoAltP)).toBe(true);
    expect(coincideAtajo({ key: 'p', altKey: false }, atajoAltP)).toBe(false);

    const atajoJ = ATAJOS_BANDEJA.find((a) => a.tecla === 'j')!;
    expect(coincideAtajo({ key: 'j' }, atajoJ)).toBe(true);
    expect(coincideAtajo({ key: 'j', altKey: true }, atajoJ)).toBe(false);
  });

  it('valida ratios de contraste WCAG AA (4.5:1 / 3:1) y AAA (7:1 / 4.5:1)', () => {
    // Contraste insuficiente (< 4.5 para texto normal)
    const ratioBajo = validarContrasteWCAG(3.2);
    expect(ratioBajo.nivelAA).toBe(false);
    expect(ratioBajo.nivelAAA).toBe(false);

    // Texto grande con ratio 3.2 cumple AA pero no AAA
    const ratioGrande = validarContrasteWCAG(3.2, true);
    expect(ratioGrande.nivelAA).toBe(true);
    expect(ratioGrande.nivelAAA).toBe(false);

    // Contraste alto (7.5) cumple AA y AAA
    const ratioAlto = validarContrasteWCAG(7.5);
    expect(ratioAlto.nivelAA).toBe(true);
    expect(ratioAlto.nivelAAA).toBe(true);
  });
});
