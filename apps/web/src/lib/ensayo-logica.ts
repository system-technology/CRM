/**
 * Lógica pura de la lista de ensayo de jornada para el piloto de Fase 1 (T-115).
 *
 * Evalúa el cumplimiento del criterio de salida de Fase 1 definido en
 * `docs/08-roadmap/04-ruta-al-entregable-fase-1.md`:
 *  1. >= 20 conversaciones de viajeros atendidas.
 *  2. >= 5 cotizaciones enviadas desde ViajaPro.
 *  3. Seguimientos con fecha programada cubriendo las conversaciones sin cerrar (mínimo 1).
 *  4. Cero datos de demostración visibles cuando la agencia opera en modo real.
 */

export const META_CONVERSACIONES_ATENDIDAS_FASE_1 = 20;
export const META_COTIZACIONES_ENVIADAS_FASE_1 = 5;
export const META_SEGUIMIENTOS_MINIMOS_FASE_1 = 1;

export interface EntradaEnsayoJornada {
  /** Cantidad de conversaciones reales atendidas en la jornada. */
  conversacionesAtendidas: number;
  /** Cantidad de cotizaciones reales en estado ENVIADA o ACEPTADA (o con fecha de envío). */
  cotizacionesEnviadas: number;
  /** Cantidad de seguimientos comerciales con fecha programada (`programadoPara`). */
  seguimientosFechados: number;
  /** Cantidad de conversaciones abiertas que aún no cerraron (por defecto 1 si no se especifica). */
  conversacionesSinCerrar?: number | undefined;
  /** Indica si la aplicación está en modo demostración (`NEXT_PUBLIC_DEMO_MODE=true`). */
  modoDemo?: boolean | undefined;
  /**
   * Indica si la fuente de los datos provino de un almacén simulado (mock).
   * En modo real (`modoDemo = false`), cualquier dato marcado como mock se descarta a 0.
   */
  origenDatosEsDemo?: boolean | undefined;
}

export interface IndicadorCriterioEnsayo {
  id: 'conversaciones' | 'cotizaciones' | 'seguimientos';
  titulo: string;
  descripcion: string;
  actual: number;
  meta: number;
  porcentaje: number;
  cumplido: boolean;
}

export interface ResultadoEnsayoJornada {
  conversacionesAtendidas: number;
  cotizacionesEnviadas: number;
  seguimientosFechados: number;
  metaConversaciones: number;
  metaCotizaciones: number;
  metaSeguimientos: number;
  conversacionesCumplido: boolean;
  cotizacionesCumplido: boolean;
  seguimientosCumplido: boolean;
  /** Verdadero cuando los 3 contadores alcanzan o superan la meta de Fase 1. */
  metasContadoresCumplidas: boolean;
  /**
   * Verdadero cuando se cumplen todas las metas de Fase 1 con datos reales
   * (sin datos de demostración infiltrados).
   */
  criterioFase1Cumplido: boolean;
  /** Verdadero si se intentó inyectar datos demo estando en modo real y fueron bloqueados. */
  datosDemoDescartadosEnModoReal: boolean;
  modoDemo: boolean;
  indicadores: readonly [IndicadorCriterioEnsayo, IndicadorCriterioEnsayo, IndicadorCriterioEnsayo];
}

function normalizarEnteroNoNegativo(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0) {
    return 0;
  }
  return Math.floor(valor);
}

function calcularPorcentaje(actual: number, meta: number): number {
  if (meta <= 0) return 100;
  return Math.min(100, Math.round((actual / meta) * 100));
}

/**
 * Calcula de forma pura los contadores, metas y estado de cumplimiento del ensayo de jornada
 * para el piloto de Fase 1.
 *
 * Garantía de modo real: si `modoDemo` es `false` y `origenDatosEsDemo` es `true`,
 * todos los contadores se fuerzan a `0` para impedir que datos de demostración aparezcan
 * como métricas reales del piloto.
 */
export function calcularEstadoEnsayoJornada(entrada: EntradaEnsayoJornada): ResultadoEnsayoJornada {
  const modoDemo = Boolean(entrada.modoDemo);
  const origenDatosEsDemo = Boolean(entrada.origenDatosEsDemo);
  const datosDemoDescartadosEnModoReal = !modoDemo && origenDatosEsDemo;

  const conversacionesAtendidas = datosDemoDescartadosEnModoReal
    ? 0
    : normalizarEnteroNoNegativo(entrada.conversacionesAtendidas);

  const cotizacionesEnviadas = datosDemoDescartadosEnModoReal
    ? 0
    : normalizarEnteroNoNegativo(entrada.cotizacionesEnviadas);

  const seguimientosFechados = datosDemoDescartadosEnModoReal
    ? 0
    : normalizarEnteroNoNegativo(entrada.seguimientosFechados);

  const conversacionesSinCerrar = datosDemoDescartadosEnModoReal
    ? 0
    : normalizarEnteroNoNegativo(
        entrada.conversacionesSinCerrar ?? META_SEGUIMIENTOS_MINIMOS_FASE_1,
      );

  const metaConversaciones = META_CONVERSACIONES_ATENDIDAS_FASE_1;
  const metaCotizaciones = META_COTIZACIONES_ENVIADAS_FASE_1;
  const metaSeguimientos = Math.max(META_SEGUIMIENTOS_MINIMOS_FASE_1, conversacionesSinCerrar);

  const conversacionesCumplido = conversacionesAtendidas >= metaConversaciones;
  const cotizacionesCumplido = cotizacionesEnviadas >= metaCotizaciones;
  const seguimientosCumplido = seguimientosFechados >= metaSeguimientos;

  const metasContadoresCumplidas =
    conversacionesCumplido && cotizacionesCumplido && seguimientosCumplido;

  // El criterio de salida de Fase 1 exige operar en modo real sin datos de demostración
  const criterioFase1Cumplido =
    metasContadoresCumplidas && !modoDemo && !datosDemoDescartadosEnModoReal;

  const indicadores: readonly [
    IndicadorCriterioEnsayo,
    IndicadorCriterioEnsayo,
    IndicadorCriterioEnsayo,
  ] = [
    {
      id: 'conversaciones',
      titulo: 'Conversaciones atendidas',
      descripcion:
        'Conversaciones reales de viajeros atendidas en la bandeja compartida (entrantes y salientes).',
      actual: conversacionesAtendidas,
      meta: metaConversaciones,
      porcentaje: calcularPorcentaje(conversacionesAtendidas, metaConversaciones),
      cumplido: conversacionesCumplido,
    },
    {
      id: 'cotizaciones',
      titulo: 'Cotizaciones enviadas',
      descripcion:
        'Cotizaciones armadas con el catálogo de la agencia y enviadas al viajero desde ViajaPro.',
      actual: cotizacionesEnviadas,
      meta: metaCotizaciones,
      porcentaje: calcularPorcentaje(cotizacionesEnviadas, metaCotizaciones),
      cumplido: cotizacionesCumplido,
    },
    {
      id: 'seguimientos',
      titulo: 'Seguimientos fechados',
      descripcion:
        'Recordatorios con fecha programada creados para cada conversación que no cerró en el momento.',
      actual: seguimientosFechados,
      meta: metaSeguimientos,
      porcentaje: calcularPorcentaje(seguimientosFechados, metaSeguimientos),
      cumplido: seguimientosCumplido,
    },
  ];

  return {
    conversacionesAtendidas,
    cotizacionesEnviadas,
    seguimientosFechados,
    metaConversaciones,
    metaCotizaciones,
    metaSeguimientos,
    conversacionesCumplido,
    cotizacionesCumplido,
    seguimientosCumplido,
    metasContadoresCumplidas,
    criterioFase1Cumplido,
    datosDemoDescartadosEnModoReal,
    modoDemo,
    indicadores,
  };
}

export interface CotizacionResumenEnsayo {
  estado: string;
  enviadaEn?: string | null | undefined;
}

export interface SeguimientoResumenEnsayo {
  venceEn?: string | null | undefined;
  programadoPara?: string | null | undefined;
}

/**
 * Cuenta cuántas cotizaciones del listado han sido efectivamente enviadas al viajero.
 */
export function contarCotizacionesEnviadas(
  cotizaciones: readonly CotizacionResumenEnsayo[],
): number {
  return cotizaciones.filter(
    (c) =>
      c.estado === 'ENVIADA' ||
      c.estado === 'ACEPTADA' ||
      (typeof c.enviadaEn === 'string' && c.enviadaEn.trim().length > 0),
  ).length;
}

/**
 * Cuenta cuántos seguimientos tienen fecha programada válida (`venceEn` o `programadoPara`).
 */
export function contarSeguimientosFechados(
  seguimientos: readonly SeguimientoResumenEnsayo[],
): number {
  return seguimientos.filter((s) => {
    const fecha = s.venceEn ?? s.programadoPara;
    return (
      typeof fecha === 'string' &&
      fecha.trim().length > 0 &&
      !Number.isNaN(new Date(fecha).getTime())
    );
  }).length;
}
