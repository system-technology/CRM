/**
 * Lógica pura y validaciones de accesibilidad (WCAG AA / 2.5.5) y comportamiento responsivo móvil.
 * Basado en `viajapro_diseno_ui_ux.json` (§responsive_and_accessibility y §validation_checklist).
 */

export interface MetricasObjetivoTactil {
  anchoPx: number;
  alturaPx: number;
}

export interface ElementoAccesible {
  etiqueta?: string;
  ariaLabel?: string;
  rol?: string;
  esSoloIcono?: boolean;
}

/**
 * Breakpoint móvil oficial de ViajaPro según viajapro_diseno_ui_ux.json (767 px).
 */
export const BREAKPOINT_MOVIL_MAX_PX = 767;

/**
 * Ancho mínimo de prueba móvil según el estándar de aceptación (375 px).
 */
export const ANCHO_MINIMO_TEST_MOVIL_PX = 375;

/**
 * Dimensión táctil mínima recomendada por WCAG 2.1 (Criterio 2.5.5 Target Size) en px.
 */
export const TAMANO_MINIMO_TACTIL_PX = 44;

/**
 * Valida si un elemento táctil (botón, chip, tab) cumple con el tamaño mínimo de 44 px.
 */
export function cumpleTamanoMinimoTactil(anchoPx: number, alturaPx: number): boolean {
  return anchoPx >= TAMANO_MINIMO_TACTIL_PX && alturaPx >= TAMANO_MINIMO_TACTIL_PX;
}

/**
 * Determina si una resolución dada corresponde a un viewport móvil.
 */
export function esViewportMovil(anchoPx: number): boolean {
  return anchoPx <= BREAKPOINT_MOVIL_MAX_PX;
}

/**
 * Valida que un botón o elemento interactivo tenga descripción accesible (texto o aria-label).
 */
export function validarAccesibilidadElemento(el: ElementoAccesible): {
  valido: boolean;
  motivo?: string;
} {
  const tieneTextoVisible = Boolean(el.etiqueta && el.etiqueta.trim().length > 0);
  const tieneAriaLabel = Boolean(el.ariaLabel && el.ariaLabel.trim().length > 0);

  if (el.esSoloIcono && !tieneAriaLabel && !tieneTextoVisible) {
    return {
      valido: false,
      motivo: 'Un botón de solo icono debe incluir un aria-label o etiqueta accesible.',
    };
  }

  return { valido: true };
}

/**
 * Retorna las clases estándar de Tailwind para garantizar foco visible accesible (WCAG 2.4.7).
 */
export function obtenerClasesFocoVisible(
  variante: 'primario' | 'input' | 'chip' = 'primario',
): string {
  switch (variante) {
    case 'input':
      return 'focus:outline-none focus:ring-2 focus:ring-acento-600 focus:border-acento-600 dark:focus:ring-acento-500';
    case 'chip':
      return 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900';
    case 'primario':
    default:
      return 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-950';
  }
}

/**
 * Selecciona los módulos esenciales para la barra de navegación táctil inferior en móviles.
 * Mantiene hasta N módulos clave (prioridad P0) y reserva espacio para búsqueda/menú.
 */
export function obtenerModulosBarraInferior<T extends { id: string }>(
  modulos: T[],
  idsPrioritarios: string[] = ['bandeja', 'pipeline', 'cotizador', 'viajes'],
): T[] {
  return modulos.filter((m) => idsPrioritarios.includes(m.id));
}
