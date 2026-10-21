/**
 * El puerto del cifrado de columnas con PII sensible (ADR-0015).
 *
 * Clase abstracta como token de inyección, igual que los demás puertos del repositorio. Quien lo
 * use ve cadenas en claro y `CampoCifrado`; nunca la clave ni el algoritmo.
 */
import { DomainError } from '@viajapro/domain';

/**
 * Las cinco columnas del ADR-0015. El valor entra en la derivación de la clave y en el AAD, así
 * que **cambiarlo equivale a rotar**: no se renombra.
 */
export const COLUMNAS_CIFRADAS = {
  MENSAJES_TEXTO: 'mensajes.texto',
  CONVERSACIONES_ULTIMO_MENSAJE_TEXTO: 'conversaciones.ultimo_mensaje_texto',
  CONTACTOS_PREFERENCIAS: 'contactos.preferencias',
  NOTAS_INTERNAS_TEXTO: 'notas_internas.texto',
  ADJUNTOS_NOMBRE_ARCHIVO: 'adjuntos.nombre_archivo',
} as const;

export type ColumnaCifrada = (typeof COLUMNAS_CIFRADAS)[keyof typeof COLUMNAS_CIFRADAS];

/** Las cuatro columnas de la base que sustituyen a una en claro. */
export interface CampoCifrado {
  cifrado: Buffer;
  /** 12 bytes. */
  nonce: Buffer;
  /** 16 bytes. */
  tag: Buffer;
  /** La `v<n>` de la maestra con la que se cifró. */
  claveVersion: number;
}

/** Lo que devuelve la base en una columna nulable: las cuatro nulas, o las cuatro presentes. */
export interface CampoCifradoNulable {
  cifrado: Buffer | null;
  nonce: Buffer | null;
  tag: Buffer | null;
  claveVersion: number | null;
}

export abstract class PuertoCifradoDeCampos {
  /**
   * Cifra `claro` atándolo a la agencia, a la fila dueña y a la columna. `filaId` es el id de la
   * fila que guarda el criptograma, **generado en la aplicación antes del INSERT**.
   */
  abstract cifrar(
    columna: ColumnaCifrada,
    tenantId: string,
    filaId: string,
    claro: string,
  ): CampoCifrado;

  /** Descifra. Lanza `CampoCifradoIlegibleError` si algo no es de esa agencia, fila o columna. */
  abstract descifrar(
    columna: ColumnaCifrada,
    tenantId: string,
    filaId: string,
    campo: CampoCifrado,
  ): string;

  /**
   * Para las columnas nulables: con las cuatro nulas devuelve `null`; con algunas sí y otras no,
   * lanza (la base lo impide con un CHECK; esto es la segunda barrera).
   */
  abstract descifrarNulable(
    columna: ColumnaCifrada,
    tenantId: string,
    filaId: string,
    campo: CampoCifradoNulable,
  ): string | null;
}

/**
 * El criptograma no abre: otra agencia, otra fila, otra columna, una versión de clave que ya no
 * está configurada o una fila manipulada. **El mensaje no lleva contenido ni identificadores**
 * (concreción 6 del ADR-0015); el filtro global lo traduce a 500, porque es un fallo nuestro.
 */
export class CampoCifradoIlegibleError extends DomainError {
  readonly code = 'CAMPO_CIFRADO_ILEGIBLE';

  constructor(columna: ColumnaCifrada) {
    super(`No se pudo descifrar ${columna}.`);
  }
}
