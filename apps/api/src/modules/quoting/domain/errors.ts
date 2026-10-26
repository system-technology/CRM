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

/**
 * Una fila del tarifario trae una moneda que el sistema no maneja.
 *
 * Es defecto de datos, no del asesor: se nombra la moneda para poder ir a buscarla.
 */
export class MonedaDesconocidaError extends InvariantError {
  readonly code = 'MONEDA_DESCONOCIDA';
  constructor(readonly iso: string) {
    super(`'${iso}' no es una moneda habilitada, y viene de una tarifa guardada en la base`);
  }
}

export class CotizacionNoEncontradaError extends DomainError {
  // Termina en `_NO_ENCONTRADO` (o `_NO_ENCONTRADA`): el filtro global lo traduce a 404.
  readonly code = 'COTIZACION_NO_ENCONTRADO';
  constructor(readonly cotizacionId: string) {
    super(`No existe la cotización ${cotizacionId} en esta agencia`);
  }
}

export class ContactoDeCotizacionNoEncontradoError extends DomainError {
  readonly code = 'CONTACTO_DE_COTIZACION_NO_ENCONTRADO';
  constructor(readonly contactoId: string) {
    super(`No existe el contacto ${contactoId} en esta agencia`);
  }
}

export class OportunidadDeCotizacionNoEncontradaError extends DomainError {
  readonly code = 'OPORTUNIDAD_DE_COTIZACION_NO_ENCONTRADO';
  constructor(
    readonly oportunidadId: string,
    readonly contactoId: string,
  ) {
    super(`No existe la oportunidad ${oportunidadId} para el contacto ${contactoId}`);
  }
}

/** Una cotización sin una sola línea armada no tiene precio que conservar. */
export class CotizacionSinLineasError extends InvariantError {
  readonly code = 'COTIZACION_SIN_LINEAS';
  constructor() {
    super(
      'La cotización no tiene líneas armadas: con esa composición ninguna tarifa por persona ' +
        'aplica, y no hay un precio que guardar. Revisa la composición o el tarifario.',
    );
  }
}

/** Las líneas no cuadran con el total o mezclan monedas: defecto del cálculo, no del asesor. */
export class CotizacionIncoherenteError extends InvariantError {
  readonly code = 'COTIZACION_INCOHERENTE';
  constructor(detalle: string) {
    super(`El cálculo de la cotización no es coherente consigo mismo: ${detalle}`);
  }
}

export class TransicionDeCotizacionInvalidaError extends EstadoInvalidoError {
  readonly code = 'COTIZACION_TRANSICION_INVALIDA';
  constructor(
    readonly de: string,
    readonly a: string,
  ) {
    super(`Una cotización ${de} no puede pasar a ${a}`);
  }
}

export class CotizacionTerminalError extends EstadoInvalidoError {
  readonly code = 'COTIZACION_TERMINAL';
  constructor(readonly estado: string) {
    super(`La cotización está ${estado}, un estado final: no admite versiones nuevas`);
  }
}

export class CursorDeCotizacionesInvalidoError extends InvariantError {
  readonly code = 'CURSOR_INVALIDO';
  constructor() {
    super('El cursor del listado de cotizaciones no es válido');
  }
}

/**
 * Todas las tarifas aplicables tienen condiciones que no se pueden evaluar con la entrada actual
 * (edad por pasajero o si el infante ocupa silla). No se cotiza en silencio.
 */
export class TarifasConCondicionNoEvaluableError extends InvariantError {
  readonly code = 'TARIFAS_CON_CONDICION_NO_EVALUABLE';
  constructor(readonly motivos: readonly string[]) {
    super(
      `Con esta composición solo hay tarifas con condiciones que no se pueden evaluar (${motivos.join('; ')}). ` +
        'Cotiza a mano o espera a que se recoja la edad por pasajero.',
    );
  }
}
