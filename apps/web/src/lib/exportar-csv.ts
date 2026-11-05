/**
 * Utilidades para exportación a CSV con formato es-CO (T-119).
 *
 * Requisitos y especificaciones de seguridad:
 * 1. Formato es-CO:
 *    - Separador: punto y coma (';'), estándar para Colombia y software en español.
 *    - Codificación: UTF-8 con BOM ('\uFEFF') para que Microsoft Excel y LibreOffice
 *      abran tildes, eñes y caracteres especiales directamente sin distorsión.
 *    - Fechas: formateadas en la zona horaria del tenant ('America/Bogota', R9).
 *    - Moneda e importes: en enteros de COP (R8) o formato local colombiano.
 *
 * 2. Protección contra Inyección de Fórmulas en CSV (CWE-1236 / CSV Injection):
 *    - Si una celda comienza por '=', '+', '-', '@', '\t' o '\r', se antepone un apóstrofo (')
 *      para forzar su interpretación como texto literal e impedir la ejecución de macros o DDE.
 *
 * 3. Filtrado estricto por permisos (R10 / ADR-0011):
 *    - En cotizaciones, las columnas «Tarifa neta» y «Margen comercial» solo se incluyen
 *      si el usuario cuenta explícitamente con el permiso 'cotizacion.ver_neto_y_margen'.
 */

import type { Contacto, Oportunidad, FilaDeCotizacion, Dinero } from '@viajapro/contracts';
import { formatearFecha, ZONA_HORARIA_COLOMBIA } from './formato';

export const BOM_UTF8 = '\uFEFF';
export const SEPARADOR_CSV_ES_CO = ';';

/** Caracteres que disparan la ejecución de fórmulas en hojas de cálculo (Excel, Calc) */
export const CARACTERES_DISPARADORES_FORMULA: readonly string[] = [
  '=',
  '+',
  '-',
  '@',
  '\t',
  '\r',
] as const;

export interface OpcionesGeneracionCSV {
  separador?: string | undefined;
  incluirBOM?: boolean | undefined;
}

export interface OpcionesExportacionCSV extends OpcionesGeneracionCSV {
  zonaHoraria?: string | undefined;
}

export interface OpcionesExportacionCotizacionesCSV extends OpcionesExportacionCSV {
  puedeVerNetoYMargen?: boolean | undefined;
}

/**
 * Aplica protección contra CSV Injection (CWE-1236).
 * Si el texto comienza por '=', '+', '-', '@', '\t' o '\r', le antepone un apóstrofo (').
 */
export function sanitizarInyeccionFormula(valor: string): string {
  if (!valor || valor.length === 0) {
    return valor;
  }
  const primerChar = valor.charAt(0);
  if (CARACTERES_DISPARADORES_FORMULA.includes(primerChar)) {
    return `'${valor}`;
  }
  return valor;
}

/**
 * Escapa y sanitiza un valor individual para ser emitido en una celda CSV.
 * - Sanitiza prefijos de fórmulas.
 * - Si contiene el separador, comillas dobles o saltos de línea, encierra entre comillas y dobla comillas internas.
 */
export function escaparCeldaCSV(valor: unknown, separador: string = SEPARADOR_CSV_ES_CO): string {
  if (valor === null || valor === undefined) {
    return '';
  }

  let texto: string;
  if (typeof valor === 'string') {
    texto = valor;
  } else if (typeof valor === 'number' || typeof valor === 'bigint' || typeof valor === 'boolean') {
    texto = String(valor);
  } else if (valor instanceof Date) {
    texto = valor.toISOString();
  } else if (
    typeof (valor as { toString?: () => string }).toString === 'function' &&
    (valor as { toString: () => string }).toString !== Object.prototype.toString
  ) {
    texto = (valor as { toString: () => string }).toString();
  } else {
    texto = JSON.stringify(valor) ?? '';
  }

  // Sanitización de fórmulas
  texto = sanitizarInyeccionFormula(texto);

  // Escapado RFC 4180 adaptado al separador configurado
  const requiereComillas =
    texto.includes(separador) ||
    texto.includes('"') ||
    texto.includes('\n') ||
    texto.includes('\r');

  if (requiereComillas) {
    return `"${texto.replace(/"/g, '""')}"`;
  }

  return texto;
}

/**
 * Genera el contenido de un archivo CSV a partir de encabezados y matriz de filas.
 */
export function generarCSV(
  encabezados: readonly string[],
  filas: readonly (readonly unknown[])[],
  opciones?: OpcionesGeneracionCSV,
): string {
  const separador = opciones?.separador ?? SEPARADOR_CSV_ES_CO;
  const incluirBOM = opciones?.incluirBOM ?? true;

  const lineaEncabezados = encabezados
    .map((col) => escaparCeldaCSV(col, separador))
    .join(separador);
  const lineasFilas = filas.map((fila) =>
    fila.map((celda) => escaparCeldaCSV(celda, separador)).join(separador),
  );

  const cuerpo = [lineaEncabezados, ...lineasFilas].join('\r\n');
  return incluirBOM ? `${BOM_UTF8}${cuerpo}` : cuerpo;
}

/**
 * Formatea un valor monetario Dinero (unidades enteras en COP) para presentación en CSV.
 */
function formatearDineroParaCSV(dinero: Dinero | null | undefined): string {
  if (!dinero) return '';
  return `$ ${Number(dinero.unidades).toLocaleString('es-CO')} ${dinero.moneda}`;
}

/**
 * Formatea una fecha en la zona horaria del tenant para el reporte CSV.
 */
function formatearFechaParaCSV(
  fecha: string | Date | null | undefined,
  zona?: string,
  conHora = true,
): string {
  if (!fecha) return '';
  return formatearFecha(fecha, {
    zona: zona ?? ZONA_HORARIA_COLOMBIA,
    estilo: 'completa',
    conHora,
  });
}

// =============================================================================
// Exportación de Contactos
// =============================================================================

export const ENCABEZADOS_CONTACTOS = [
  'ID',
  'Nombre',
  'Teléfono',
  'Correo electrónico',
  'Etiquetas',
  'Consentimientos',
  'Preferencias',
  'Fecha de creación',
  'Último contacto',
] as const;

export function exportarContactosCSV(
  contactos: readonly Contacto[],
  opciones?: OpcionesExportacionCSV,
): string {
  const zona = opciones?.zonaHoraria ?? ZONA_HORARIA_COLOMBIA;

  const filas = contactos.map((c) => [
    c.id,
    c.nombre ?? '',
    c.telefono,
    c.correo ?? '',
    c.etiquetas.join(', '),
    c.consentimientos.join(', '),
    c.preferencias ?? '',
    formatearFechaParaCSV(c.creadoEn, zona, true),
    formatearFechaParaCSV(c.ultimoContactoEn, zona, true),
  ]);

  return generarCSV(ENCABEZADOS_CONTACTOS, filas, opciones);
}

// =============================================================================
// Exportación de Oportunidades
// =============================================================================

export const ENCABEZADOS_OPORTUNIDADES = [
  'ID',
  'Título',
  'Destino',
  'Etapa',
  'Valor estimado',
  'Probabilidad (%)',
  'Asesor',
  'Contacto',
  'Fecha de salida',
  'Próxima tarea',
  'Vencimiento de tarea',
  'Motivo de pérdida',
  'Fecha de creación',
] as const;

export function exportarOportunidadesCSV(
  oportunidades: readonly Oportunidad[],
  opciones?: OpcionesExportacionCSV,
): string {
  const zona = opciones?.zonaHoraria ?? ZONA_HORARIA_COLOMBIA;

  const filas = oportunidades.map((o) => [
    o.id,
    o.titulo,
    o.destino ?? '',
    o.etapa.nombre,
    formatearDineroParaCSV(o.valorEstimado),
    o.probabilidad !== null ? `${o.probabilidad}%` : '',
    o.asesorNombre ?? '',
    o.contactoNombre ?? '',
    formatearFechaParaCSV(o.fechaSalida, zona, false),
    o.proximaTarea ? o.proximaTarea.descripcion : '',
    o.proximaTarea ? formatearFechaParaCSV(o.proximaTarea.venceEn, zona, true) : '',
    o.motivoPerdida ? `${o.motivoPerdida}${o.notaPerdida ? ` (${o.notaPerdida})` : ''}` : '',
    formatearFechaParaCSV(o.creadaEn, zona, true),
  ]);

  return generarCSV(ENCABEZADOS_OPORTUNIDADES, filas, opciones);
}

// =============================================================================
// Exportación de Cotizaciones
// =============================================================================

/**
 * Fila de cotización extendida que puede opcionalmente contener neto y margen
 * si fueron recuperados de la cotización completa.
 */
export type FilaCotizacionConMargenOpcional = FilaDeCotizacion & {
  neto?: Dinero | null | undefined;
  margen?: Dinero | null | undefined;
};

export function exportarCotizacionesCSV(
  cotizaciones: readonly FilaCotizacionConMargenOpcional[],
  opciones?: OpcionesExportacionCotizacionesCSV,
): string {
  const zona = opciones?.zonaHoraria ?? ZONA_HORARIA_COLOMBIA;
  const incluirNetoYMargen = opciones?.puedeVerNetoYMargen === true;

  // Construcción dinámica de columnas según permisos (R10 / ADR-0011)
  const encabezados = [
    'ID',
    'Título',
    'Destino / Paquete',
    'Estado',
    'Versiones',
    'Versión enviada',
    'Fecha de salida',
    'Total venta',
    ...(incluirNetoYMargen ? ['Tarifa neta', 'Margen comercial'] : []),
    'Fecha de creación',
    'Última versión',
  ];

  const filas = cotizaciones.map((c) => {
    const filaBase = [
      c.id,
      c.titulo,
      c.paqueteNombre,
      c.estado,
      c.numeroDeVersiones,
      c.versionEnviada ? `v${c.versionEnviada}` : 'Sin enviar',
      formatearFechaParaCSV(c.fechaSalida, zona, false),
      formatearDineroParaCSV(c.venta),
    ];

    const filaMargen = incluirNetoYMargen
      ? [formatearDineroParaCSV(c.neto), formatearDineroParaCSV(c.margen)]
      : [];

    const filaFechas = [
      formatearFechaParaCSV(c.creadaEn, zona, true),
      formatearFechaParaCSV(c.ultimaVersionEn, zona, true),
    ];

    return [...filaBase, ...filaMargen, ...filaFechas];
  });

  return generarCSV(encabezados, filas, opciones);
}

// =============================================================================
// Descarga en navegador
// =============================================================================

/**
 * Descarga en el navegador un archivo de texto/CSV con nombre especificado.
 * Crea un Blob de tipo text/csv;charset=utf-8 y simula el clic en un enlace temporal.
 */
export function descargarArchivoCSV(contenido: string, nombreArchivo: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const nombreFinal = nombreArchivo.endsWith('.csv') ? nombreArchivo : `${nombreArchivo}.csv`;
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', nombreFinal);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
