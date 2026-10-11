/**
 * El puerto por el que el caso de uso guarda una recepción. R4: nadie importa el adaptador.
 *
 * Es una clase abstracta y no una interfaz porque Nest necesita un símbolo en tiempo de
 * ejecución para inyectar; una interfaz de TypeScript desaparece al compilar.
 */

export interface RecepcionAGuardar {
  recepcionId: Buffer;
  cifrado: Buffer;
  nonce: Buffer;
  tag: Buffer;
  claveVersion: number;
  totalChanges: number;
}

export abstract class PuertoRecepciones {
  /** `true` si se insertó; `false` si ya existía —un reintento de Meta—. */
  abstract registrar(recepcion: RecepcionAGuardar): Promise<boolean>;
}
