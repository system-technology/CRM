/**
 * El puerto de persistencia del contexto `crm`. R4: nadie importa el adaptador.
 *
 * Clase abstracta y no interfaz porque Nest necesita un símbolo en tiempo de ejecución para
 * inyectar; una interfaz de TypeScript desaparece al compilar.
 */

import type {
  Contacto,
  EtapaDefinida,
  FichaDeContacto,
  MotivoPerdida,
  Oportunidad,
} from '@viajapro/contracts';

/** Lo que hace falta saber de la etapa destino para decidir, y nada más. */
export interface EtapaResumida {
  id: string;
  nombre: string;
  esPerdida: boolean;
}

export interface MovimientoDeOportunidad {
  oportunidadId: string;
  etapaId: string;
  motivoPerdida: MotivoPerdida | null;
  notaPerdida: string | null;
}

export abstract class PuertoCrm {
  /** Las etapas de ESTA agencia, en su orden. Es lo que define las columnas del tablero. */
  abstract listarEtapas(): Promise<EtapaDefinida[]>;

  /**
   * Las oportunidades vivas por etapa, con el total y el valor de cada columna.
   *
   * El total viene del servidor y **no es la suma de las tarjetas devueltas**: una columna con
   * 40 oportunidades devuelve las primeras y el total es el de las 40.
   */
  abstract tableroPorEtapa(
    limitePorColumna: number,
  ): Promise<
    Map<string, { total: number; valorUnidades: bigint | null; oportunidades: Oportunidad[] }>
  >;

  abstract buscarEtapa(etapaId: string): Promise<EtapaResumida | null>;

  abstract buscarOportunidad(oportunidadId: string): Promise<Oportunidad | null>;

  abstract moverOportunidad(movimiento: MovimientoDeOportunidad): Promise<Oportunidad>;

  /** La ficha del panel lateral de la bandeja: una sola consulta, no tres encadenadas. */
  abstract fichaDeContacto(contactoId: string): Promise<FichaDeContacto | null>;

  abstract listarContactos(parametros: {
    buscar: string | null;
    limite: number;
  }): Promise<Contacto[]>;
}
