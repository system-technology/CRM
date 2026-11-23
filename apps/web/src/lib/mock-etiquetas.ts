/**
 * Catálogo de etiquetas del MODO DEMO (T-326, HU-inbox-1 §3): las tres que siembra la API en toda
 * agencia (Pagado, Pago pendiente, Seguimiento), con los mismos topes y errores tipados que la API
 * real. Solo vive en memoria y solo se usa en demo: el modo real nunca lo toca (sin mezclar fuentes).
 *
 * No importa `mock-inbox`: `mock-inbox` arma sus conversaciones con este catálogo, y un ciclo de
 * importación dejaría constantes sin inicializar. Lo que toca conversaciones (poner, quitar, borrar
 * en todas, renombrar en todas) está en `mock-etiquetas-conversaciones.ts`.
 */

import {
  MAX_ETIQUETAS_POR_AGENCIA,
  normalizarNombreDeEtiqueta,
  type ColorDeEtiqueta,
  type Etiqueta,
  type EtiquetaDeConversacion,
} from '@viajapro/contracts';

/** Error tipado con el mismo `code` que la API (ver `etiquetas-api.ts`). */
export class ErrorDeEtiquetaMock extends Error {
  constructor(
    readonly code: string,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDeEtiquetaMock';
  }
}

const uuid = (n: number) => `00000000-0004-4000-8000-${n.toString(16).padStart(12, '0')}`;

export const ID_ETIQUETA_PAGADO = uuid(1);
export const ID_ETIQUETA_PAGO_PENDIENTE = uuid(2);
export const ID_ETIQUETA_SEGUIMIENTO = uuid(3);

const SEMILLA: readonly Etiqueta[] = [
  { id: ID_ETIQUETA_PAGADO, nombre: 'Pagado', color: 'verde', orden: 0 },
  { id: ID_ETIQUETA_PAGO_PENDIENTE, nombre: 'Pago pendiente', color: 'ambar', orden: 1 },
  { id: ID_ETIQUETA_SEGUIMIENTO, nombre: 'Seguimiento', color: 'azul', orden: 2 },
];

let catalogo: Etiqueta[] = SEMILLA.map((e) => ({ ...e }));
let siguienteId = 100;

/** Solo para pruebas: vuelve al catálogo sembrado. */
export function reiniciarCatalogoMock(): void {
  catalogo = SEMILLA.map((e) => ({ ...e }));
  siguienteId = 100;
}

export function listarEtiquetasMock(): Etiqueta[] {
  return catalogo
    .toSorted((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
    .map((e) => ({ ...e }));
}

export function etiquetaMockPorId(id: string): Etiqueta | undefined {
  return catalogo.find((e) => e.id === id);
}

/** Comparación como la de la base: sin mayúsculas ni espacios a los lados (`lower(btrim(nombre))`). */
const clave = (nombre: string) => nombre.trim().toLowerCase();

function normalizarONegar(nombre: string): string {
  const r = normalizarNombreDeEtiqueta(nombre);
  if (!r.ok) {
    throw new ErrorDeEtiquetaMock('ETIQUETA_INVALIDA', 'El nombre de la etiqueta no es válido.');
  }
  return r.nombre;
}

export function crearEtiquetaMock(entrada: { nombre: string; color: ColorDeEtiqueta }): Etiqueta {
  const nombre = normalizarONegar(entrada.nombre);
  if (catalogo.length >= MAX_ETIQUETAS_POR_AGENCIA) {
    throw new ErrorDeEtiquetaMock(
      'TOPE_DE_ETIQUETAS_DE_LA_AGENCIA',
      'La agencia alcanzó el máximo de etiquetas.',
    );
  }
  if (catalogo.some((e) => clave(e.nombre) === clave(nombre))) {
    throw new ErrorDeEtiquetaMock('ETIQUETA_DUPLICADA', 'Ya existe una etiqueta con ese nombre.');
  }
  const orden = catalogo.reduce((m, e) => Math.max(m, e.orden), -1) + 1;
  const nueva: Etiqueta = { id: uuid(siguienteId++), nombre, color: entrada.color, orden };
  catalogo.push(nueva);
  return { ...nueva };
}

export function actualizarEtiquetaMock(
  id: string,
  cambios: {
    nombre?: string | undefined;
    color?: ColorDeEtiqueta | undefined;
    orden?: number | undefined;
  },
): Etiqueta {
  const e = etiquetaMockPorId(id);
  if (!e) throw new ErrorDeEtiquetaMock('ETIQUETA_NO_ENCONTRADA', 'La etiqueta no existe.');
  if (cambios.nombre !== undefined) {
    const nombre = normalizarONegar(cambios.nombre);
    if (catalogo.some((o) => o.id !== id && clave(o.nombre) === clave(nombre))) {
      throw new ErrorDeEtiquetaMock('ETIQUETA_DUPLICADA', 'Ya existe una etiqueta con ese nombre.');
    }
    e.nombre = nombre;
  }
  if (cambios.color !== undefined) e.color = cambios.color;
  // Como la API: `orden` se fija tal cual; los empates se resuelven por nombre al listar.
  if (cambios.orden !== undefined) e.orden = cambios.orden;
  return { ...e };
}

export function borrarEtiquetaDelCatalogoMock(id: string): void {
  if (!etiquetaMockPorId(id)) {
    throw new ErrorDeEtiquetaMock('ETIQUETA_NO_ENCONTRADA', 'La etiqueta no existe.');
  }
  catalogo = catalogo.filter((e) => e.id !== id);
}

/** Las etiquetas de una conversación de demo a partir de ids del catálogo, en el orden del catálogo. */
export function etiquetasDeConversacionMock(ids: readonly string[]): EtiquetaDeConversacion[] {
  return listarEtiquetasMock()
    .filter((e) => ids.includes(e.id))
    .map(({ id, nombre, color }) => ({ id, nombre, color }));
}
