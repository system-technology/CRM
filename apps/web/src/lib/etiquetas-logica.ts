/**
 * Lógica pura de las etiquetas de conversación (T-326, HU-inbox-1): paleta, orden, textos de error
 * y filtro de la bandeja en la URL. Sin React ni red, para probarla sin montar nada.
 *
 * Los tipos vienen de `@viajapro/contracts` (R3). El nombre de una etiqueta es texto libre de la
 * agencia y puede ser el de una persona (R10): aquí se muestra al usuario, pero NUNCA se escribe
 * en un log ni en la consola.
 */

import {
  COLORES_DE_ETIQUETA,
  MAX_ETIQUETAS_EN_EL_FILTRO,
  MAX_ETIQUETAS_POR_AGENCIA,
  MAX_ETIQUETAS_POR_CONVERSACION,
  type ColorDeEtiqueta,
  type Etiqueta,
  type EtiquetaDeConversacion,
  type ModoDeFiltroDeEtiquetas,
} from '@viajapro/contracts';
import { esUuid, type LectorDeParametros } from './parametros-url';

// -----------------------------------------------------------------------------------------
// Paleta
// -----------------------------------------------------------------------------------------

export interface EstiloDeColor {
  /** Nombre que lee un lector de pantalla y que ve quien elige el color («Verde»). */
  nombre: string;
  /** Clases del chip: fondo claro + texto oscuro del mismo tono (tokens de `globals.css`). */
  chip: string;
  /** Clase del punto de color. */
  punto: string;
}

// Las clases se escriben completas (no se arman con plantillas) para que Tailwind las detecte.
export const PALETA_DE_ETIQUETAS: Readonly<Record<ColorDeEtiqueta, EstiloDeColor>> = {
  gris: {
    nombre: 'Gris',
    chip: 'bg-etiqueta-gris-fondo text-etiqueta-gris-texto',
    punto: 'bg-etiqueta-gris-punto',
  },
  azul: {
    nombre: 'Azul',
    chip: 'bg-etiqueta-azul-fondo text-etiqueta-azul-texto',
    punto: 'bg-etiqueta-azul-punto',
  },
  turquesa: {
    nombre: 'Turquesa',
    chip: 'bg-etiqueta-turquesa-fondo text-etiqueta-turquesa-texto',
    punto: 'bg-etiqueta-turquesa-punto',
  },
  verde: {
    nombre: 'Verde',
    chip: 'bg-etiqueta-verde-fondo text-etiqueta-verde-texto',
    punto: 'bg-etiqueta-verde-punto',
  },
  ambar: {
    nombre: 'Ámbar',
    chip: 'bg-etiqueta-ambar-fondo text-etiqueta-ambar-texto',
    punto: 'bg-etiqueta-ambar-punto',
  },
  naranja: {
    nombre: 'Naranja',
    chip: 'bg-etiqueta-naranja-fondo text-etiqueta-naranja-texto',
    punto: 'bg-etiqueta-naranja-punto',
  },
  rosa: {
    nombre: 'Rosa',
    chip: 'bg-etiqueta-rosa-fondo text-etiqueta-rosa-texto',
    punto: 'bg-etiqueta-rosa-punto',
  },
  dorado: {
    nombre: 'Dorado',
    chip: 'bg-etiqueta-dorado-fondo text-etiqueta-dorado-texto',
    punto: 'bg-etiqueta-dorado-punto',
  },
};

export { COLORES_DE_ETIQUETA, MAX_ETIQUETAS_POR_AGENCIA, MAX_ETIQUETAS_POR_CONVERSACION };

export function estiloDeColor(color: ColorDeEtiqueta): EstiloDeColor {
  return PALETA_DE_ETIQUETAS[color];
}

// -----------------------------------------------------------------------------------------
// Orden y conjuntos
// -----------------------------------------------------------------------------------------

/**
 * Pone las etiquetas de una conversación en el orden del catálogo de la agencia («siempre en el
 * mismo sitio», HU §4.1). Las que el catálogo aún no conoce van al final, en su orden de llegada.
 */
export function ordenarSegunCatalogo(
  etiquetas: readonly EtiquetaDeConversacion[],
  catalogo: readonly Etiqueta[],
): EtiquetaDeConversacion[] {
  const posicion = new Map(catalogo.map((e, i) => [e.id, i] as const));
  return etiquetas
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const pa = posicion.get(a.e.id) ?? Number.MAX_SAFE_INTEGER;
      const pb = posicion.get(b.e.id) ?? Number.MAX_SAFE_INTEGER;
      return pa - pb || a.i - b.i;
    })
    .map(({ e }) => e);
}

export function aEtiquetaDeConversacion(
  e: Etiqueta | EtiquetaDeConversacion,
): EtiquetaDeConversacion {
  return { id: e.id, nombre: e.nombre, color: e.color };
}

/** La conversación con la etiqueta puesta (o quitada), sin duplicar y en el orden del catálogo. */
export function conEtiqueta(
  actuales: readonly EtiquetaDeConversacion[],
  etiqueta: EtiquetaDeConversacion,
  puesta: boolean,
  catalogo: readonly Etiqueta[],
): EtiquetaDeConversacion[] {
  const sin = actuales.filter((e) => e.id !== etiqueta.id);
  return puesta ? ordenarSegunCatalogo([...sin, etiqueta], catalogo) : sin;
}

/**
 * Devuelve a su sitio una etiqueta que se había quitado y el servidor rechazó: en su posición
 * original y, si el catálogo la conoce, en su orden. Sin catálogo cargado queda donde estaba.
 */
export function reponerEtiqueta(
  actuales: readonly EtiquetaDeConversacion[],
  etiqueta: EtiquetaDeConversacion,
  indiceOriginal: number,
  catalogo: readonly Etiqueta[],
): EtiquetaDeConversacion[] {
  const sin = actuales.filter((e) => e.id !== etiqueta.id);
  const i = Math.max(0, Math.min(indiceOriginal, sin.length));
  return ordenarSegunCatalogo([...sin.slice(0, i), etiqueta, ...sin.slice(i)], catalogo);
}

/** Lo que muestra una fila de la lista: como mucho `max` chips y cuántos quedan fuera. */
export function recortarParaFila(
  etiquetas: readonly EtiquetaDeConversacion[],
  max = 2,
): { visibles: EtiquetaDeConversacion[]; ocultas: EtiquetaDeConversacion[] } {
  return { visibles: etiquetas.slice(0, max), ocultas: etiquetas.slice(max) };
}

// -----------------------------------------------------------------------------------------
// Errores: qué pasó y qué hacer (nunca el texto crudo del servidor)
// -----------------------------------------------------------------------------------------

export type AccionSobreEtiqueta = 'poner' | 'quitar' | 'crear' | 'renombrar' | 'ordenar' | 'borrar';

export interface AvisoDeEtiqueta {
  /** Texto para la persona: qué pasó y qué hacer. */
  mensaje: string;
  /** `reintentar`: ofrecer el botón; `recargar`: la lista ya no es la de la agencia; `ninguna`. */
  siguiente: 'reintentar' | 'recargar' | 'ninguna';
  /** Código del error tipado, por si la pantalla decide algo (no se muestra). */
  codigo: string;
}

const VERBO: Record<AccionSobreEtiqueta, string> = {
  poner: 'poner',
  quitar: 'quitar',
  crear: 'crear',
  renombrar: 'renombrar',
  ordenar: 'cambiar el orden de',
  borrar: 'borrar',
};

function codigoDe(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const c = err.code;
    if (typeof c === 'string') return c;
  }
  return 'DESCONOCIDO';
}

/**
 * Traduce un error de la API de etiquetas a un aviso accionable. `nombre` es el de la etiqueta que
 * se tocaba, si se conoce (los mensajes del servidor no lo traen, a propósito).
 */
export function interpretarErrorDeEtiqueta(
  err: unknown,
  accion: AccionSobreEtiqueta,
  nombre?: string,
): AvisoDeEtiqueta {
  const codigo = codigoDe(err);
  const cual = nombre ? `“${nombre}”` : 'la etiqueta';
  switch (codigo) {
    case 'ERROR_CONEXION':
      return {
        codigo,
        siguiente: 'reintentar',
        mensaje: `No se pudo ${VERBO[accion]} ${cual}: sin conexión. Toca para reintentar.`,
      };
    case 'ETIQUETA_NO_ENCONTRADA':
      return {
        codigo,
        siguiente: 'recargar',
        mensaje: nombre
          ? `La etiqueta “${nombre}” ya no existe: otra persona la borró. Se actualizó la lista.`
          : 'Esa etiqueta ya no existe: otra persona la borró. Se actualizó la lista.',
      };
    case 'CONVERSACION_NO_ENCONTRADA':
      return {
        codigo,
        siguiente: 'ninguna',
        mensaje: 'Ya no tienes acceso a esta conversación.',
      };
    case 'TOPE_DE_ETIQUETAS_DE_LA_CONVERSACION':
      return {
        codigo,
        siguiente: 'ninguna',
        mensaje: `Una conversación admite hasta ${MAX_ETIQUETAS_POR_CONVERSACION} etiquetas. Quita una para poner ${cual}.`,
      };
    case 'TOPE_DE_ETIQUETAS_DE_LA_AGENCIA':
      return {
        codigo,
        siguiente: 'ninguna',
        mensaje: `La agencia ya tiene ${MAX_ETIQUETAS_POR_AGENCIA} etiquetas. Borra una que no uses para crear otra.`,
      };
    case 'ETIQUETA_DUPLICADA':
      return {
        codigo,
        siguiente: 'ninguna',
        mensaje: nombre
          ? `Ya existe “${nombre}”. Usa otro nombre.`
          : 'Ya existe una etiqueta con ese nombre. Usa otro nombre.',
      };
    case 'ETIQUETA_INVALIDA':
      return {
        codigo,
        siguiente: 'ninguna',
        mensaje:
          'El nombre o el color no son válidos. Escribe de 1 a 30 caracteres y elige un color de la paleta.',
      };
    case 'PERMISO_DENEGADO':
      return {
        codigo,
        siguiente: 'ninguna',
        mensaje:
          accion === 'poner' || accion === 'quitar'
            ? 'Tu rol no puede poner ni quitar etiquetas. Pídele a quien administra la agencia el permiso «Operar bandeja».'
            : 'Tu rol no puede gestionar etiquetas. Pídele a quien administra la agencia el permiso «Administrar etiquetas».',
      };
    default:
      return {
        codigo,
        siguiente: 'reintentar',
        mensaje: `No se pudo ${VERBO[accion]} ${cual}. Intenta de nuevo en unos segundos.`,
      };
  }
}

// -----------------------------------------------------------------------------------------
// Filtro de la bandeja en la URL (`?etiquetas=<uuid,uuid>&modo=cualquiera|todas`)
// -----------------------------------------------------------------------------------------

export interface FiltroDeEtiquetasEnUrl {
  /** Solo UUID válidos, sin repetir, hasta el tope del contrato. */
  ids: string[];
  modo: ModoDeFiltroDeEtiquetas;
  /** La URL traía algo que no se pudo usar (id mal formado, de más o modo desconocido). */
  hayBasura: boolean;
}

/**
 * Lee el filtro de la URL con la validación de `parametros-url`: un valor que no es UUID nunca llega
 * a la consulta (la URL es entrada del usuario). Acepta `a,b` y `etiquetas=a&etiquetas=b`.
 */
export function leerFiltroDeEtiquetasDeUrl(
  params: LectorDeParametros & { getAll?: (nombre: string) => string[] },
): FiltroDeEtiquetasEnUrl {
  const crudos = (params.getAll ? params.getAll('etiquetas') : [params.get('etiquetas') ?? ''])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v !== '');
  const ids: string[] = [];
  let hayBasura = false;
  for (const crudo of crudos) {
    if (!esUuid(crudo) || ids.includes(crudo.toLowerCase())) {
      hayBasura = true;
      continue;
    }
    if (ids.length >= MAX_ETIQUETAS_EN_EL_FILTRO) {
      hayBasura = true;
      continue;
    }
    ids.push(crudo.toLowerCase());
  }
  const modoCrudo = params.get('modo');
  const modo: ModoDeFiltroDeEtiquetas = modoCrudo === 'todas' ? 'todas' : 'cualquiera';
  if (modoCrudo !== null && modoCrudo !== 'todas' && modoCrudo !== 'cualquiera') hayBasura = true;
  return { ids, modo, hayBasura };
}

/**
 * La cadena de consulta con el filtro puesto; conserva cualquier otro parámetro. Sin etiquetas no
 * deja ni `etiquetas` ni `modo`; `cualquiera` es el valor por defecto y no ensucia la URL.
 */
export function consultaConFiltroDeEtiquetas(
  actual: { toString(): string },
  ids: readonly string[],
  modo: ModoDeFiltroDeEtiquetas,
): string {
  const q = new URLSearchParams(actual.toString());
  q.delete('etiquetas');
  q.delete('modo');
  if (ids.length > 0) {
    q.set('etiquetas', ids.join(','));
    if (modo === 'todas' && ids.length > 1) q.set('modo', 'todas');
  }
  return q.toString();
}

/**
 * `push` al empezar a filtrar (Atrás vuelve a la bandeja sin filtro) y `replace` al ajustar un filtro
 * que ya existe o al limpiar la basura de la URL: no se llena el historial con cada casilla.
 */
export function modoDeNavegacionDelFiltro(
  antes: readonly string[],
  despues: readonly string[],
): 'push' | 'replace' {
  return antes.length === 0 && despues.length > 0 ? 'push' : 'replace';
}

/** `/bandeja[/id]` conservando el filtro de etiquetas (y solo ese) al abrir o volver de un chat. */
export function hrefConFiltro(ruta: string, consulta: string): string {
  return consulta ? `${ruta}?${consulta}` : ruta;
}

/** De una consulta cualquiera, solo los parámetros del filtro de etiquetas. */
export function soloFiltroDeEtiquetas(actual: { toString(): string }): string {
  const q = new URLSearchParams(actual.toString());
  const salida = new URLSearchParams();
  const ids = q.get('etiquetas');
  const modo = q.get('modo');
  if (ids) salida.set('etiquetas', ids);
  if (ids && modo) salida.set('modo', modo);
  return salida.toString();
}

/** Texto del estado «filtro sin resultados» (HU §4.5). */
export function textoSinResultadosDelFiltro(
  seleccionadas: readonly Pick<Etiqueta, 'nombre'>[],
  modo: ModoDeFiltroDeEtiquetas,
): string {
  if (seleccionadas.length === 1) {
    return `Ninguna conversación tiene “${seleccionadas[0]?.nombre ?? ''}”.`;
  }
  return modo === 'todas'
    ? 'Ninguna conversación tiene todas las etiquetas elegidas.'
    : 'Ninguna conversación tiene alguna de las etiquetas elegidas.';
}

// -----------------------------------------------------------------------------------------
// Configuración: subir y bajar
// -----------------------------------------------------------------------------------------

/**
 * Los cambios de `orden` para mover una etiqueta una posición. La API fija `orden` tal cual (no
 * intercambia) y admite empates, así que se renumera 0..n-1 y solo se manda lo que cambia: casi
 * siempre dos peticiones. Devuelve `[]` si ya está en el borde.
 */
export function cambiosDeOrdenAlMover(
  catalogo: readonly Pick<Etiqueta, 'id' | 'orden'>[],
  id: string,
  direccion: 'subir' | 'bajar',
): { id: string; orden: number }[] {
  const indice = catalogo.findIndex((e) => e.id === id);
  const destino = direccion === 'subir' ? indice - 1 : indice + 1;
  if (indice < 0 || destino < 0 || destino >= catalogo.length) return [];
  const nuevo = [...catalogo];
  const [movida] = nuevo.splice(indice, 1);
  if (!movida) return [];
  nuevo.splice(destino, 0, movida);
  return nuevo.flatMap((e, i) => (e.orden === i ? [] : [{ id: e.id, orden: i }]));
}
