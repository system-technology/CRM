/**
 * Los errores de la frontera de identidad, con código estable (`CodigoDeErrorDeAcceso` en
 * `packages/contracts`). El filtro global los traduce a HTTP; la web decide qué enseñar con el
 * código y no con el mensaje.
 */
import type { CodigoDeErrorDeAcceso } from '@viajapro/contracts';
import {
  DemasiadosIntentosError,
  DomainError,
  EstadoInvalidoError,
  NoAutenticadoError,
  ProhibidoError,
} from '@viajapro/domain';

const MENSAJES: Partial<Record<CodigoDeErrorDeAcceso, string>> = {
  SIN_SESION: 'Se requiere autenticación.',
  SIN_AGENCIA_ACTIVA: 'Elige una agencia para continuar.',
  ACCESO_REVOCADO: 'Ya no tienes acceso a esta agencia. Inicia sesión de nuevo.',
  AGENCIA_SUSPENDIDA: 'La agencia está suspendida.',
  SIN_MEMBRESIA: 'No perteneces a esa agencia.',
  CREDENCIALES_INVALIDAS: 'Correo o contraseña incorrectos.',
  DEMASIADOS_INTENTOS: 'Demasiados intentos. Espera un minuto.',
  ORIGEN_NO_CONFIABLE: 'Origen no permitido.',
  CODIGO_INVALIDO: 'Código inválido o caducado.',
  INVITACION_INVALIDA: 'La invitación no es válida o caducó.',
};

class NoAutenticado extends NoAutenticadoError {
  constructor(
    readonly code: CodigoDeErrorDeAcceso,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

class Prohibido extends ProhibidoError {
  constructor(
    readonly code: CodigoDeErrorDeAcceso,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

class DemasiadosIntentos extends DemasiadosIntentosError {
  readonly code = 'DEMASIADOS_INTENTOS';
}

/** Los que son 403: la sesión es buena, pero no puede hacer esto. */
const PROHIBIDOS: ReadonlySet<CodigoDeErrorDeAcceso> = new Set([
  'SIN_MEMBRESIA',
  'ORIGEN_NO_CONFIABLE',
  'PERMISO_DENEGADO',
]);

/**
 * El error tipado para un código de acceso: 401 si no hay sesión que valga, 403 si la hay pero
 * no alcanza, 429 si son demasiados intentos. El filtro global lo traduce.
 */
export function errorDeAcceso(code: CodigoDeErrorDeAcceso): DomainError {
  const mensaje = MENSAJES[code] ?? 'Acceso denegado.';
  if (code === 'DEMASIADOS_INTENTOS') return new DemasiadosIntentos(mensaje);
  return PROHIBIDOS.has(code) ? new Prohibido(code, mensaje) : new NoAutenticado(code, mensaje);
}

/**
 * La invitación no existe, ya se usó, caducó o su rol ya no existe. **Un solo código para todo**:
 * distinguirlos no le sirve a quien tiene el token y sí a quien prueba tokens al azar. Es un
 * 400: el cliente mandó un token que no abre nada.
 */
export class InvitacionInvalidaError extends DomainError {
  readonly code = 'INVITACION_INVALIDA';

  constructor() {
    super(MENSAJES.INVITACION_INVALIDA ?? 'La invitación no es válida.');
  }
}

/** El rol pedido no existe en la agencia de quien invita. El filtro lo traduce a 404. */
export class RolNoEncontradoError extends DomainError {
  readonly code = 'ROL_NO_ENCONTRADO';

  constructor() {
    super('No existe ese rol en tu agencia.');
  }
}

/** El miembro no existe en la agencia de quien lo pide (bajo RLS, uno de otra agencia no existe). 404. */
export class MiembroNoEncontradoError extends DomainError {
  readonly code = 'MIEMBRO_NO_ENCONTRADO';

  constructor() {
    super('No existe ese miembro en tu agencia.');
  }
}

/** Darse de baja a uno mismo dejaría a la agencia sin quien la administre. 409. */
export class NoPuedeDarseDeBajaError extends EstadoInvalidoError {
  readonly code = 'NO_PUEDE_DARSE_DE_BAJA';

  constructor() {
    super('No puedes darte de baja a ti mismo.');
  }
}
