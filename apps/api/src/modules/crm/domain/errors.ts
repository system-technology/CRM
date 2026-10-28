/**
 * Errores del contexto `crm`.
 *
 * Códigos estables: el filtro global los traduce a HTTP y la interfaz los traduce a algo que un
 * asesor entienda. El texto en español es para el registro, no para la pantalla.
 */

import { DomainError, EstadoInvalidoError } from '@viajapro/domain';

export class OportunidadNoEncontradaError extends DomainError {
  readonly code = 'OPORTUNIDAD_NO_ENCONTRADA';
  constructor(readonly oportunidadId: string) {
    super(`No existe la oportunidad ${oportunidadId} en esta agencia`);
  }
}

export class EtapaNoEncontradaError extends DomainError {
  readonly code = 'ETAPA_NO_ENCONTRADA';
  constructor(readonly etapaId: string) {
    super(
      `No existe la etapa ${etapaId} en esta agencia. Las etapas son por agencia: un id de ` +
        'otra no sirve aquí.',
    );
  }
}

export class ContactoNoEncontradoError extends DomainError {
  readonly code = 'CONTACTO_NO_ENCONTRADO';
  constructor(readonly contactoId: string) {
    super(`No existe el contacto ${contactoId} en esta agencia`);
  }
}

/**
 * Mover a una etapa de pérdida sin decir por qué.
 *
 * **Esta regla vivía en el contrato y tuvo que mudarse aquí**, y conviene saber por qué: la
 * etapa viaja como identificador, y saber si ese identificador es una etapa de pérdida exige
 * leer `etapas_pipeline`. Un esquema Zod no lee otra tabla; este caso de uso sí.
 *
 * Lo que la regla protege no cambió: sin motivo, el embudo dice cuántas se pierden y nunca por
 * qué, que es lo único sobre lo que una agencia puede actuar.
 */
export class PerdidaSinMotivoError extends EstadoInvalidoError {
  readonly code = 'PERDIDA_SIN_MOTIVO';
  constructor(readonly etapa: string) {
    super(
      `'${etapa}' es una etapa de pérdida y necesita motivo. Sin él, el informe dice cuántas ` +
        'oportunidades se pierden y nunca por qué.',
    );
  }
}

export class ConversacionNoEncontradaError extends DomainError {
  readonly code = 'CONVERSACION_NO_ENCONTRADA';
  constructor(readonly conversacionId: string) {
    // Mismo error para «no existe» y «no la ves»: distinguirlos le diría a un asesor que hay una
    // conversación ajena con ese id.
    super(`No existe la conversación ${conversacionId} en esta agencia`);
  }
}

export class AsesorNoEncontradoError extends DomainError {
  readonly code = 'ASESOR_NO_ENCONTRADO';
  constructor(readonly asesorId: string) {
    super(`No existe el asesor ${asesorId} activo en esta agencia`);
  }
}

export class PaqueteNoEncontradoError extends DomainError {
  readonly code = 'PAQUETE_NO_ENCONTRADO';
  constructor(readonly paqueteId: string) {
    super(`No existe el paquete ${paqueteId} en esta agencia`);
  }
}

export class SeguimientoNoEncontradoError extends DomainError {
  readonly code = 'SEGUIMIENTO_NO_ENCONTRADO';
  constructor(readonly seguimientoId: string) {
    super(`No existe el seguimiento ${seguimientoId} en esta agencia`);
  }
}

/** Otro contacto de la agencia ya tiene ese teléfono: es la llave del canal de WhatsApp. */
export class TelefonoYaRegistradoError extends EstadoInvalidoError {
  readonly code = 'TELEFONO_YA_REGISTRADO';
  constructor(readonly telefonoE164: string) {
    super(`Ya existe un contacto con el teléfono ${telefonoE164} en esta agencia`);
  }
}

export class SeguimientoYaCompletadoError extends EstadoInvalidoError {
  readonly code = 'SEGUIMIENTO_YA_COMPLETADO';
  constructor(readonly seguimientoId: string) {
    super(`El seguimiento ${seguimientoId} ya estaba completado`);
  }
}

/** La agencia no tiene ninguna etapa de entrada al embudo (todas ganadas o perdidas, o ninguna). */
export class SinEtapaInicialError extends EstadoInvalidoError {
  readonly code = 'SIN_ETAPA_INICIAL';
  constructor() {
    super('La agencia no tiene una etapa inicial del embudo: configura al menos una etapa viva.');
  }
}

/** Motivo de pérdida en una etapa que no lo es. */
export class MotivoEnEtapaViva extends EstadoInvalidoError {
  readonly code = 'MOTIVO_EN_ETAPA_VIVA';
  constructor(readonly etapa: string) {
    super(
      `'${etapa}' no es una etapa de pérdida, así que no lleva motivo. Una tarjeta devuelta a ` +
        'negociación con el motivo pegado hace que el informe cuente una pérdida que no existe.',
    );
  }
}
