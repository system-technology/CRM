/**
 * Errores del contexto de cotización.
 *
 * Códigos estables: la interfaz los traduce a un mensaje para el asesor y el filtro global
 * los traduce a HTTP. El texto en español es para el log, no para la pantalla.
 */

import { DomainError, EstadoInvalidoError, InvariantError, ProhibidoError } from '@viajapro/domain';

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

// =============================================================================
// Catálogo gestionable (ADR-0017)
// =============================================================================

/**
 * La propuesta tiene al menos un `ERROR` en su informe: no se aplica nada (todo o nada, D4).
 * El filtro global solo devuelve `code` y `message`, así que el mensaje lista los primeros errores.
 */
export class PropuestaInvalidaError extends InvariantError {
  readonly code = 'PROPUESTA_INVALIDA';
  constructor(
    readonly errores: readonly { readonly codigo: string; readonly ruta: string }[],
    readonly total: number,
  ) {
    super(
      `La propuesta de catálogo tiene ${total} error(es) y no se aplicó nada: ` +
        errores
          .slice(0, 5)
          .map((e) => `${e.codigo} en ${e.ruta}`)
          .join('; '),
    );
  }
}

/** La previsualización que vio quien confirma ya no es la propuesta que se va a aplicar. */
export class PropuestaCambioError extends EstadoInvalidoError {
  readonly code = 'PROPUESTA_CAMBIO';
  constructor() {
    super('El catálogo o la propuesta cambiaron desde la previsualización: vuelve a revisarla');
  }
}

/** Otro cambio de catálogo de la misma agencia tiene el bloqueo y no lo soltó a tiempo. */
export class CatalogoOcupadoError extends EstadoInvalidoError {
  readonly code = 'CATALOGO_OCUPADO';
  constructor() {
    super('Otro cambio del catálogo de esta agencia está en curso: reintenta en unos segundos');
  }
}

/** La propuesta nombra un formato de viaje que la agencia no tiene. */
export class FormatoDeViajeDesconocidoError extends InvariantError {
  readonly code = 'FORMATO_DE_VIAJE_DESCONOCIDO';
  constructor(readonly formato: string) {
    super(`La agencia no tiene un formato de viaje llamado '${formato}'`);
  }
}

/** Una tarifa nombra una opción de salida que el producto no tiene (defecto del adaptador). */
export class OpcionDeSalidaDesconocidaError extends InvariantError {
  readonly code = 'OPCION_DE_SALIDA_DESCONOCIDA';
  constructor(readonly etiqueta: string) {
    super(`El producto no tiene una opción de salida '${etiqueta}'`);
  }
}

/** El producto tiene opciones de salida activas y la cotización no eligió ninguna. */
export class OpcionDeSalidaRequeridaError extends InvariantError {
  readonly code = 'OPCION_DE_SALIDA_REQUERIDA';
  constructor(readonly opciones: readonly string[]) {
    super(
      `Este producto se cotiza por opción de salida (${opciones.join(', ')}): ` +
        'elige una con opcionDeSalidaId',
    );
  }
}

/** La opción de salida pedida no existe, está inactiva o es de otro producto. */
export class OpcionDeSalidaNoEncontradaError extends DomainError {
  readonly code = 'OPCION_DE_SALIDA_NO_ENCONTRADO';
  constructor(readonly opcionId: string) {
    super(`No existe la opción de salida ${opcionId} en este producto`);
  }
}

export class FormatoDeViajeNoEncontradoError extends DomainError {
  readonly code = 'FORMATO_DE_VIAJE_NO_ENCONTRADO';
  constructor(readonly formatoId: string) {
    super(`No existe el formato de viaje ${formatoId} en esta agencia`);
  }
}

export class FormatoDeViajeDuplicadoError extends EstadoInvalidoError {
  readonly code = 'FORMATO_DE_VIAJE_DUPLICADO';
  constructor(readonly nombre: string) {
    super(`La agencia ya tiene un formato de viaje llamado '${nombre}'`);
  }
}

/** Editar el paquete lo dejaría con la misma clave natural que otro de la agencia. */
export class PaqueteDuplicadoError extends EstadoInvalidoError {
  readonly code = 'PAQUETE_DUPLICADO';
  constructor(readonly clave: string) {
    super(`Ya existe otro paquete de la agencia con la clave '${clave}'`);
  }
}

/** La importación trae precios netos y quien confirma no puede verlos ni cambiarlos (403). */
export class NetoSinPermisoError extends ProhibidoError {
  readonly code = 'NETO_SIN_PERMISO';
  constructor() {
    super('Importar precios netos exige el permiso cotizacion.ver_neto_y_margen');
  }
}
