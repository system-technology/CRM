/**
 * El puerto del cifrado de columnas con PII sensible (ADR-0015).
 *
 * Clase abstracta como token de inyección, igual que los demás puertos del repositorio. Quien lo
 * usa (los adaptadores de `infrastructure/` de `inbox` y `crm`) ve cadenas en claro y
 * `CampoCifrado`; nunca la clave ni el algoritmo. Ni los casos de uso ni los controladores ven
 * bytes cifrados.
 */

/**
 * Las cinco columnas de la tabla de alcance del ADR-0015. El valor entra en la etiqueta de la
 * derivación y del AAD (`viajapro/<tabla>.<columna>/v<n>/`), así que **cambiarlo equivale a
 * rotar**: no se renombra.
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

/** Lo que devuelve la base en una columna anulable: las cuatro nulas, o las cuatro presentes. */
export interface CampoCifradoNulable {
  cifrado: Buffer | Uint8Array | null;
  nonce: Buffer | Uint8Array | null;
  tag: Buffer | Uint8Array | null;
  claveVersion: number | null;
}

export abstract class PuertoCifradoDeCampos {
  /**
   * Cifra `claro` atándolo a la agencia, a la fila dueña y a la columna. `filaId` es el id de la
   * fila que guarda el criptograma, **generado en la aplicación antes del INSERT** (concreción 3).
   */
  abstract cifrar(
    columna: ColumnaCifrada,
    tenantId: string,
    filaId: string,
    claro: string,
  ): CampoCifrado;

  /**
   * Descifra una columna anulable: con las cuatro nulas devuelve `null`; con algunas sí y otras
   * no, lanza (la base lo impide con un CHECK; esto es la segunda barrera). Lanza
   * `CampoCifradoIlegibleError` si el criptograma no es de esa agencia, fila, columna o versión.
   */
  abstract descifrar(
    columna: ColumnaCifrada,
    tenantId: string,
    filaId: string,
    campo: CampoCifradoNulable,
  ): string | null;

  /**
   * Descifra el valor de una fila leída de la base. La clave y el AAD se derivan con el tenant de
   * la SESIÓN (o, en el trabajador y el socket, el del evento), **nunca con el `tenant_id` de la
   * fila**: si la fila dice ser de otra agencia, se lanza sin intentar descifrar. RLS ya impide que
   * llegue; esta es la segunda barrera, para que un fallo de RLS no se convierta en un descifrado
   * correcto de datos ajenos.
   */
  descifrarDeFila(
    columna: ColumnaCifrada,
    tenantId: string,
    fila: { id: string; tenantId: string },
    campo: CampoCifradoNulable,
  ): string | null {
    if (fila.tenantId !== tenantId) throw new CampoCifradoDeOtraAgenciaError(columna);
    return this.descifrar(columna, tenantId, fila.id, campo);
  }

  /** Para las columnas NOT NULL (`notas_internas.texto`): un nulo ahí es una fila rota. */
  descifrarObligatorio(
    columna: ColumnaCifrada,
    tenantId: string,
    filaId: string,
    campo: CampoCifrado,
  ): string {
    const claro = this.descifrar(columna, tenantId, filaId, campo);
    if (claro === null) throw new CampoCifradoIlegibleError(columna);
    return claro;
  }
}

/**
 * El criptograma no abre: otra agencia, otra fila, otra columna, una versión de clave que ya no
 * está configurada o una fila manipulada. **El mensaje no lleva contenido ni identificadores**
 * (concreción 6). No es un `DomainError` a propósito: no es culpa de la petición sino nuestra, y el
 * filtro global lo responde como 500 sin detalle. No se devuelve el resto de la respuesta a medias.
 */
export class CampoCifradoIlegibleError extends Error {
  readonly code = 'CAMPO_CIFRADO_ILEGIBLE';

  constructor(columna: ColumnaCifrada) {
    super(`No se pudo descifrar ${columna}.`);
    this.name = 'CampoCifradoIlegibleError';
  }
}

/**
 * Una fila de otra agencia llegó a un mapeador que descifra (ADR-0015). No debería ocurrir nunca:
 * RLS lo impide. Si ocurre, es un fallo de aislamiento y no se descifra nada. Sin identificadores en
 * el mensaje.
 */
export class CampoCifradoDeOtraAgenciaError extends Error {
  readonly code = 'CAMPO_CIFRADO_DE_OTRA_AGENCIA';

  constructor(columna: ColumnaCifrada) {
    super(`La fila de ${columna} no es de la agencia de la sesión.`);
    this.name = 'CampoCifradoDeOtraAgenciaError';
  }
}
