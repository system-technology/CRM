/**
 * Aceptar una cotización desde la pantalla (T-563).
 *
 * El paso «el viajero acepta» es el que abre el archivo de viaje, así que la decisión de si la
 * acción se ofrece —y de qué se le dice al asesor antes de pulsar— se escribe aquí, como funciones
 * puras, y no dentro del JSX. Dos cosas la gobiernan:
 *
 *  1. **El estado.** El invariante del dominio vive en la API
 *     (`apps/api/src/modules/quoting/domain/estado-de-cotizacion.ts`): solo `ENVIADA` transita a
 *     `ACEPTADA`; los otros tres estados son terminales. La web no inventa el suyo: lo repite, y
 *     nunca ofrece lo que el servidor rechazaría.
 *  2. **El permiso.** `POST /api/v1/cotizaciones/:id/estado` exige `cotizacion.escribir`
 *     (`@RequierePermiso` en `cotizaciones.controller.ts`), el mismo permiso con el que el
 *     cotizador deshabilita «Guardar cotización». No hay permiso nuevo: la aceptación es escribir
 *     sobre la cotización.
 *
 * La interfaz deshabilita por comodidad, nunca por seguridad: quien manda es la API (ADR-0011).
 */
import type { EstadoCotizacion } from '@viajapro/contracts';
import { explicacionFaltaPermiso, PERMISO_COTIZACION_ESCRIBIR } from './permisos';

/** Los estados sobre los que la aceptación no se ofrece, y por qué. */
export const ESTADOS_QUE_NO_ADMITEN_ACEPTACION: Readonly<
  Record<Exclude<EstadoCotizacion, 'ENVIADA'>, RazonSinOferta>
> = {
  BORRADOR: 'SIN_ENVIAR',
  ACEPTADA: 'YA_CERRADA',
  RECHAZADA: 'YA_CERRADA',
  VENCIDA: 'YA_CERRADA',
};

/** `SIN_ENVIAR`: el viajero todavía no la vio. `YA_CERRADA`: el ciclo terminó, en un sentido o en otro. */
export type RazonSinOferta = 'SIN_ENVIAR' | 'YA_CERRADA';

export type AccionAceptar =
  | { readonly ofrecida: false; readonly razon: RazonSinOferta }
  | { readonly ofrecida: true; readonly habilitada: true }
  | { readonly ofrecida: true; readonly habilitada: false; readonly explicacion: string };

export interface EntradaAccionAceptar {
  readonly estado: EstadoCotizacion;
  /** `cotizacion.escribir` de la sesión; el mismo que exige el endpoint. */
  readonly puedeEscribirCotizacion: boolean;
}

/**
 * Si la pantalla ofrece marcar aceptada, y en qué forma.
 *
 * El estado manda sobre el permiso: sobre una cotización ya cerrada no se pinta nada, ni siquiera
 * un botón apagado — no hay nada que pedirle al administrador.
 */
export function accionAceptarCotizacion(entrada: EntradaAccionAceptar): AccionAceptar {
  if (entrada.estado !== 'ENVIADA') {
    return { ofrecida: false, razon: ESTADOS_QUE_NO_ADMITEN_ACEPTACION[entrada.estado] };
  }
  if (!entrada.puedeEscribirCotizacion) {
    return {
      ofrecida: true,
      habilitada: false,
      explicacion: explicacionFaltaPermiso(PERMISO_COTIZACION_ESCRIBIR),
    };
  }
  return { ofrecida: true, habilitada: true };
}

// =============================================================================
// El archivo de viaje que nace de la aceptación
// =============================================================================

/**
 * El archivo de viaje NO viene en la respuesta de la aceptación: lo abre el consumidor del evento
 * `cotizacion.aceptada` (ADR-0024 §1), después de que la transacción confirma. Así que la pantalla
 * lo busca unas cuantas veces y, mientras no esté, lo dice tal cual. Nunca inventa el enlace.
 */
export type BusquedaDelArchivo =
  | { readonly fase: 'buscando' }
  | { readonly fase: 'encontrado'; readonly archivoId: string; readonly numero: number | null }
  | { readonly fase: 'demorada' };

/** Cuánto se espera entre intento e intento, en milisegundos. Seis intentos, unos 11 segundos. */
export const ESPERAS_DE_BUSQUEDA_DEL_ARCHIVO: readonly number[] = [
  500, 1_000, 1_500, 2_500, 2_500, 3_000,
];

type ArchivoParaBuscar = { id: string; numero: number | null; cotizacionId: string };

/**
 * El archivo nacido de esta cotización dentro de la lista que devolvió el servidor.
 *
 * `agotados` distingue las dos esperas que el asesor no debe confundir: «todavía estoy mirando» y
 * «ya miré bastante y no apareció». Ninguna de las dos devuelve un enlace.
 */
export function archivoTrasAceptar(
  archivos: readonly ArchivoParaBuscar[],
  cotizacionId: string,
  opciones: { agotados: boolean },
): BusquedaDelArchivo {
  const archivo = archivos.find((a) => a.cotizacionId === cotizacionId);
  if (archivo) {
    return { fase: 'encontrado', archivoId: archivo.id, numero: archivo.numero };
  }
  return opciones.agotados ? { fase: 'demorada' } : { fase: 'buscando' };
}
