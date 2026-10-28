/**
 * Lógica pura de importación de catálogo y plantillas CSV (T-029 y T-030).
 *
 * Funciones sin efectos secundarios ni dependencias de DOM/React:
 * - Generación de contenido CSV para plantillas de sistema (con marcador oficial #viajapro).
 * - Parser de CSV a TablaDeImportacion con detección de marcadores y delimitadores.
 * - Sugeridor local de mapeo de columnas con cálculo de confianza.
 * - Clasificación y conteo de filas de previsualización (Válidas, Advertencias, Errores).
 */

import type {
  DescriptorDePlantilla,
  TablaDeImportacion,
  MapeoDeColumnas,
  SugerenciaDeMapeo,
  InformeDeCatalogo,
  ElementoDeInforme,
} from '@viajapro/contracts';

/**
 * Genera el texto CSV estándar para una plantilla de producto turístico (T-030).
 *
 * Estructura oficial (ADR-0017 §4.2):
 * - Fila 1: Marcador `#viajapro;plantilla=<formato>;version=<version>`
 * - Fila 2: Encabezados legibles en español
 * - Fila 3: Fila de ejemplo con datos verosímiles
 */
export function generarCsvPlantilla(plantilla: DescriptorDePlantilla): string {
  const lineaMarcador = `#viajapro;plantilla=${plantilla.formato};version=${plantilla.version}`;
  const encabezados = plantilla.columnas.map((col) => col.etiqueta).join(',');
  const ejemplos = plantilla.columnas
    .map((col) => {
      // Si contiene comas o saltos de línea, se entrecomilla
      if (col.ejemplo.includes(',') || col.ejemplo.includes('\n')) {
        return `"${col.ejemplo.replace(/"/g, '""')}"`;
      }
      return col.ejemplo;
    })
    .join(',');

  return `${lineaMarcador}\n${encabezados}\n${ejemplos}\n`;
}

export interface MarcadorDetectado {
  formato: string;
  version: number;
}

/**
 * Extrae el marcador oficial de ViajaPro si está presente en la primera línea.
 * Ejemplo: `#viajapro;plantilla=excursion-un-dia;version=1`
 */
export function extraerMarcadorViajaPro(linea: string): MarcadorDetectado | null {
  const trimmed = linea.trim();
  if (!trimmed.startsWith('#viajapro;')) return null;

  const partes = trimmed.slice('#viajapro;'.length).split(';');
  let formato: string | undefined;
  let version = 1;

  for (const parte of partes) {
    if (parte.startsWith('plantilla=')) {
      formato = parte.slice('plantilla='.length).trim();
    } else if (parte.startsWith('version=')) {
      const v = parseInt(parte.slice('version='.length).trim(), 10);
      if (!isNaN(v) && v > 0) version = v;
    }
  }

  if (!formato) return null;
  return { formato, version };
}

/**
 * Divide una línea CSV respetando comillas dobles escapadas.
 */
export function dividirLineaCsv(linea: string, delimitador = ','): string[] {
  const celdas: string[] = [];
  let celdaActual = '';
  let dentroDeComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const char = linea[i];

    if (char === '"') {
      if (dentroDeComillas && linea[i + 1] === '"') {
        celdaActual += '"';
        i++; // saltar comilla escapada
      } else {
        dentroDeComillas = !dentroDeComillas;
      }
    } else if (char === delimitador && !dentroDeComillas) {
      celdas.push(celdaActual.trim());
      celdaActual = '';
    } else {
      celdaActual += char;
    }
  }

  celdas.push(celdaActual.trim());
  return celdas;
}

export interface ResultadoParseoCsv {
  tabla: TablaDeImportacion;
  marcador: MarcadorDetectado | null;
  marcadorCrudo?: string | undefined;
}

/**
 * Parsea el contenido en texto plano de un CSV a TablaDeImportacion.
 */
export function parsearCsvAImportacion(textoCsv: string): ResultadoParseoCsv {
  const lineas = textoCsv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lineas.length === 0) {
    throw new Error('El archivo CSV está completamente vacío');
  }

  let indiceInicio = 0;
  let marcador: MarcadorDetectado | null = null;
  let marcadorCrudo: string | undefined;

  const primeraLinea = lineas[0]!;
  if (primeraLinea.startsWith('#viajapro;')) {
    marcador = extraerMarcadorViajaPro(primeraLinea);
    marcadorCrudo = primeraLinea;
    indiceInicio = 1;
  }

  if (lineas.length <= indiceInicio) {
    throw new Error('El archivo no contiene encabezados tras el marcador');
  }

  // Detectar delimitador habitual (, o ;)
  const lineaEncabezados = lineas[indiceInicio]!;
  const delimitador = lineaEncabezados.includes(';') && !lineaEncabezados.includes(',') ? ';' : ',';

  const encabezados = dividirLineaCsv(lineaEncabezados, delimitador);
  if (encabezados.length === 0 || encabezados.every((e) => e === '')) {
    throw new Error('No se detectaron columnas válidas en los encabezados');
  }

  const filas: string[][] = [];
  for (let i = indiceInicio + 1; i < lineas.length; i++) {
    const celdas = dividirLineaCsv(lineas[i]!, delimitador);
    // Rellenar o recortar celdas para que coincidan con encabezados
    while (celdas.length < encabezados.length) {
      celdas.push('');
    }
    filas.push(celdas.slice(0, encabezados.length));
  }

  const tabla: TablaDeImportacion = {
    encabezados,
    filas,
    filaInicial: indiceInicio + 2,
  };

  return {
    tabla,
    marcador,
    marcadorCrudo,
  };
}

/**
 * Normaliza cadenas para comparación fonética/sinónimos aproximados.
 */
function normalizarTexto(txt: string): string {
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Sugiere correspondencia de columnas localmente cuando la API esté offline o para feedback instantáneo.
 */
export function sugerirMapeoLocal(
  encabezados: string[],
  plantilla: DescriptorDePlantilla,
): SugerenciaDeMapeo {
  const columnas: Record<string, { indice: number; confianza: number }> = {};
  const usados = new Set<number>();

  for (const col of plantilla.columnas) {
    const claveNorm = normalizarTexto(col.clave);
    const etiquetaNorm = normalizarTexto(col.etiqueta);

    let mejorIndice = -1;
    let mejorConfianza = 0;

    for (let i = 0; i < encabezados.length; i++) {
      if (usados.has(i)) continue;
      const encNorm = normalizarTexto(encabezados[i]!);

      if (encNorm === etiquetaNorm || encNorm === claveNorm) {
        mejorIndice = i;
        mejorConfianza = 1.0;
        break;
      } else if (encNorm.includes(etiquetaNorm) || etiquetaNorm.includes(encNorm)) {
        if (mejorConfianza < 0.8) {
          mejorIndice = i;
          mejorConfianza = 0.8;
        }
      } else if (encNorm.includes(claveNorm) || claveNorm.includes(encNorm)) {
        if (mejorConfianza < 0.7) {
          mejorIndice = i;
          mejorConfianza = 0.7;
        }
      }
    }

    if (mejorIndice !== -1 && mejorConfianza >= 0.7) {
      columnas[col.clave] = { indice: mejorIndice, confianza: mejorConfianza };
      usados.add(mejorIndice);
    }
  }

  const sinMapear: number[] = [];
  for (let i = 0; i < encabezados.length; i++) {
    if (!usados.has(i)) {
      sinMapear.push(i);
    }
  }

  return {
    formato: plantilla.formato,
    version: plantilla.version,
    columnas,
    sinMapear,
  };
}

/**
 * Convierte un mapa de sugerencia o edición en el objeto estricto MapeoDeColumnas.
 */
export function construirMapeoDeColumnas(
  formato: string,
  mapeoManual: Record<string, number>,
  moneda: 'COP' | 'USD' | 'EUR' | 'MXN' = 'COP',
  formatoDeFecha: 'DD/MM/AAAA' | 'MM/DD/AAAA' = 'DD/MM/AAAA',
): MapeoDeColumnas {
  return {
    formato,
    columnas: mapeoManual,
    moneda,
    formatoDeFecha,
  };
}

export interface ResumenClasificacionFilas {
  total: number;
  creados: number;
  actualizados: number;
  sinCambios: number;
  errores: ElementoDeInforme[];
  advertencias: ElementoDeInforme[];
  tieneErroresBloqueantes: boolean;
}

/**
 * Clasifica los elementos de un informe de propuesta de catálogo.
 */
export function clasificarInformeDeImportacion(
  informe: InformeDeCatalogo,
): ResumenClasificacionFilas {
  const errores = informe.elementos.filter((f) => f.nivel === 'ERROR');
  const advertencias = informe.elementos.filter((f) => f.nivel === 'AVISO');

  return {
    total: informe.elementos.length,
    creados: informe.resumen.creados,
    actualizados: informe.resumen.actualizados,
    sinCambios: informe.resumen.sinCambios,
    errores,
    advertencias,
    tieneErroresBloqueantes: informe.resumen.errores > 0 || errores.length > 0,
  };
}
