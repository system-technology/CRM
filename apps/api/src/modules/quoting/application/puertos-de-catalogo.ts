/**
 * Puertos del aplicador de catálogo (ADR-0017 §1 y §8).
 *
 * Son clases abstractas y no interfaces para que sirvan de token de inyección sin metadatos de
 * decorador (ver la nota de `guardia-de-inyeccion.spec.ts`). Todo lo que declaran vive **dentro de
 * una misma transacción**: la unidad de trabajo abre una, fija el tenant y entrega ambos puertos
 * atados a ella. Así la auditoría se escribe con el mismo `tx` que el cambio de precio (R4: no hay
 * módulo `audit`; `quoting` declara el puerto y su adaptador inserta).
 */

import type { ProductoPropuesto, TarifaPropuesta } from '@viajapro/contracts';
import type { CatalogoActual } from '../domain/validar-y-planificar.js';

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [clave: string]: JsonValue };

/** Un hecho que debe quedar en el registro de auditoría. Nunca lleva datos personales (R10). */
export interface CambioRegistrado {
  /** `catalogo.paquete.creado`, `catalogo.tarifa.modificada`, … */
  readonly accion: string;
  readonly entidad: 'paquete' | 'vigencia' | 'tarifa' | 'propuesta';
  readonly entidadId: string | null;
  readonly detalle: { readonly [clave: string]: JsonValue };
}

/** Quién hace el cambio. El tenant lo toma el adaptador del contexto de la petición. */
export interface ActorDelCambio {
  readonly usuarioId: string | null;
}

export abstract class RegistroDeCambios {
  /** Inserta en la misma transacción que el cambio de estado. Si esa transacción falla, no queda. */
  abstract registrar(actor: ActorDelCambio, cambios: readonly CambioRegistrado[]): Promise<void>;
}

export type ResultadoDeDesactivar = 'NO_EXISTE' | 'YA_INACTIVO' | 'DESACTIVADO';

export abstract class CatalogoPersistente {
  /**
   * Serializa los cambios de catálogo de la agencia (`pg_advisory_xact_lock` con `lock_timeout`).
   * Debe llamarse antes de `leer`: la fotografía que se lee es la que se planifica.
   * Lanza `CatalogoOcupadoError` si no consigue el bloqueo a tiempo.
   */
  abstract bloquear(): Promise<void>;

  /** Fotografía del catálogo del tenant (incluye inactivos; no incluye borrados). */
  abstract leer(): Promise<CatalogoActual>;

  /**
   * Crea (`id` nulo) o actualiza el paquete y sincroniza sus opciones de salida.
   * `codigo`: `undefined` = no tocar el actual; `null` = sin código.
   */
  abstract guardarPaquete(
    id: string | null,
    producto: ProductoPropuesto,
    codigo: string | null | undefined,
  ): Promise<string>;

  /** Upsert por `(paquete, desde, hasta)`. */
  abstract guardarVigencia(
    paqueteId: string,
    vigencia: { readonly desde: string; readonly hasta: string; readonly publicada: boolean },
  ): Promise<string>;

  /**
   * Upsert por `(vigencia, nombre normalizado)`. Resuelve el mayorista por nombre (lo crea si no
   * existe) y la opción de salida por etiqueta dentro del paquete. `conservarNeto`: no toca el
   * neto de una tarifa existente (quien escribe no tiene permiso para verlo ni cambiarlo).
   */
  abstract guardarTarifa(
    paqueteId: string,
    vigenciaId: string,
    tarifa: TarifaPropuesta,
    opciones: {
      readonly conservarNeto: boolean;
      /** Sin `opcionDeSalida` en la tarifa: no desatar la que ya tiene (edición por id). */
      readonly conservarOpcion?: boolean;
    },
  ): Promise<string>;

  abstract desactivarPaquete(id: string): Promise<ResultadoDeDesactivar>;
}

export interface EspacioDeTrabajo {
  readonly catalogo: CatalogoPersistente;
  readonly registro: RegistroDeCambios;
}

export abstract class UnidadDeTrabajoDeCatalogo {
  /** Una transacción con el tenant fijado. Si `fn` lanza, no queda nada, ni la auditoría. */
  abstract ejecutar<T>(fn: (espacio: EspacioDeTrabajo) => Promise<T>): Promise<T>;
}
