/**
 * Errores del contexto de cotización.
 *
 * Códigos estables: la interfaz los traduce a un mensaje para el asesor y el filtro global
 * los traduce a HTTP. El texto en español es para el log, no para la pantalla.
 */

import { DomainError, EstadoInvalidoError, InvariantError } from '@viajapro/domain';

export class PaqueteNoEncontradoError extends DomainError {
  readonly code = 'PAQUETE_NO_ENCONTRADO';
  constructor(readonly paqueteId: string) {
    super(`No existe el paquete ${paqueteId} en esta agencia`);
  }
}

export class SinTemporadaParaLaFechaError extends EstadoInvalidoError {
  readonly code = 'SIN_TEMPORADA_PARA_LA_FECHA';
  constructor(
    readonly paquete: string,
    readonly fecha: string,
  ) {
    super(
      `'${paquete}' no tiene tarifa publicada para el ${fecha}. ` +
        'Añade la temporada al tarifario o elige otra fecha.',
    );
  }
}

export class AcomodacionSinPrecioError extends InvariantError {
  readonly code = 'ACOMODACION_SIN_PRECIO';
  constructor(
    readonly acomodacion: string,
    readonly tipoPasajero: string,
    readonly temporada: string,
  ) {
    super(
      `La temporada '${temporada}' no tiene precio para ${tipoPasajero} en acomodación ` +
        `${acomodacion}. Es lo normal cuando el mayorista no publica esa combinación.`,
    );
  }
}
