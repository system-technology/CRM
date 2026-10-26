/**
 * Los errores de ENVIAR por WhatsApp, y la traducción de los códigos de Meta a ellos.
 *
 * Fuente de la tabla: `docs/04-integraciones/01-whatsapp-cloud-api.md` §9, extraída de la página
 * oficial de códigos de error de Meta (consultada 2026-10-07). No es exhaustiva: un código que no
 * está aquí se trata por su estado HTTP (5xx reintentable, 4xx definitivo).
 *
 * **Cada error lleva tres cosas, y ninguna es el texto de Meta:**
 *   - `codigoMeta`: el número crudo, para soporte y métricas (`mensajes.codigo_error_meta`);
 *   - `reintentable`: si la cola debe volver a intentarlo;
 *   - `message`: lo que ve el asesor, en español y con la acción que debe tomar
 *     (`mensajes.motivo_fallo`, máximo 500).
 * El `message` y el `error_data.details` de Meta no se guardan ni se registran: pueden repetir el
 * número del destinatario (R10) y no están escritos para un asesor.
 */
import { DomainError, EstadoInvalidoError } from '@viajapro/domain';

export abstract class ErrorDeEnvioWhatsapp extends DomainError {
  abstract readonly reintentable: boolean;

  constructor(
    mensaje: string,
    /** El código de Meta, o `null` cuando el fallo no viene de Meta (red, configuración). */
    readonly codigoMeta: number | null,
  ) {
    super(mensaje);
  }
}

/** `131047`: pasaron más de 24 h desde el último mensaje del cliente. Solo plantillas. */
export class FueraDeVentanaError extends ErrorDeEnvioWhatsapp {
  readonly code = 'WHATSAPP_FUERA_DE_VENTANA';
  readonly reintentable = false;
  constructor(codigoMeta: number | null = 131047) {
    super(
      'WhatsApp rechazó el mensaje: la ventana de 24 horas está cerrada. Envía una plantilla aprobada.',
      codigoMeta,
    );
  }
}

/** `131026`: el número no tiene WhatsApp, lo tiene desactualizado o no aceptó los términos. */
export class DestinatarioNoDisponibleError extends ErrorDeEnvioWhatsapp {
  readonly code = 'WHATSAPP_DESTINATARIO_NO_DISPONIBLE';
  readonly reintentable = false;
  constructor(codigoMeta: number) {
    super(
      'Este número no puede recibir mensajes de WhatsApp (no tiene WhatsApp o no está actualizado).',
      codigoMeta,
    );
  }
}

/** `130429`, `131056`, `80007`, `4`: límite de tasa. Se reintenta con espera creciente. */
export class LimiteDeTasaError extends ErrorDeEnvioWhatsapp {
  readonly code = 'WHATSAPP_LIMITE_DE_TASA';
  readonly reintentable = true;
  constructor(codigoMeta: number | null) {
    super(
      'WhatsApp está limitando los envíos de este número. El mensaje no salió; inténtalo en unos minutos.',
      codigoMeta,
    );
  }
}

/**
 * `190`, `0`, `3`, `10`, `131005`: el token caducó, se revocó o le faltan permisos. Reintentar no
 * lo revive: el canal hay que reconectarlo.
 */
export class CredencialInvalidaError extends ErrorDeEnvioWhatsapp {
  readonly code = 'WHATSAPP_CREDENCIAL_INVALIDA';
  readonly reintentable = false;
  constructor(codigoMeta: number | null) {
    super(
      'El número de la agencia perdió la conexión con WhatsApp. Pide al dueño que lo reconecte y vuelve a enviar.',
      codigoMeta,
    );
  }
}

/** No hay credencial para este canal: falta configuración, o el canal no es el de prueba. */
export class CredencialNoDisponibleError extends ErrorDeEnvioWhatsapp {
  readonly code = 'WHATSAPP_CREDENCIAL_NO_DISPONIBLE';
  readonly reintentable = false;
  constructor() {
    super(
      'El envío por WhatsApp no está configurado para este número. Avisa al dueño de la agencia.',
      null,
    );
  }
}

/** `131031`, `368`, `131042`: cuenta restringida por política o problema de pago. Humano. */
export class CuentaRestringidaError extends ErrorDeEnvioWhatsapp {
  readonly code = 'WHATSAPP_CUENTA_RESTRINGIDA';
  readonly reintentable = false;
  constructor(codigoMeta: number) {
    super(
      'WhatsApp restringió la cuenta de la agencia o hay un problema con su método de pago. Avisa al dueño.',
      codigoMeta,
    );
  }
}

/** Meta respondió con un error pasajero (`1` con 5xx, `2`, `131000`, `131016`, `133004`, `131057`). */
export class FalloTransitorioDeMetaError extends ErrorDeEnvioWhatsapp {
  readonly code = 'WHATSAPP_FALLO_TRANSITORIO';
  readonly reintentable = true;
  constructor(codigoMeta: number | null) {
    super(
      'WhatsApp no está respondiendo bien. El mensaje no salió; vuelve a intentarlo.',
      codigoMeta,
    );
  }
}

/** Cualquier otro rechazo definitivo (parámetros, tipo no soportado, número mal registrado...). */
export class EnvioRechazadoError extends ErrorDeEnvioWhatsapp {
  readonly code = 'WHATSAPP_ENVIO_RECHAZADO';
  readonly reintentable = false;
  constructor(codigoMeta: number | null) {
    super('WhatsApp rechazó el mensaje. Si se repite, avisa a soporte.', codigoMeta);
  }
}

/**
 * La petición salió y no hubo respuesta (timeout, conexión cortada a medias): **no sabemos si Meta
 * lo aceptó.** No se reintenta, porque reintentar podría mandarlo dos veces (R5). Si Meta sí lo
 * aceptó, su webhook de estado lo corrige (ADR-0018 §4).
 */
export class EnvioSinConfirmarError extends ErrorDeEnvioWhatsapp {
  readonly code = 'WHATSAPP_ENVIO_SIN_CONFIRMAR';
  readonly reintentable = false;
  constructor() {
    super(
      'No pudimos confirmar si WhatsApp recibió el mensaje. Revisa el chat en unos minutos antes de reenviarlo.',
      null,
    );
  }
}

/** La red falló ANTES de que la petición saliera (DNS, conexión rechazada): seguro reintentar. */
export class MetaInalcanzableError extends ErrorDeEnvioWhatsapp {
  readonly code = 'WHATSAPP_INALCANZABLE';
  readonly reintentable = true;
  constructor() {
    super('No se pudo contactar a WhatsApp. El mensaje no salió; vuelve a intentarlo.', null);
  }
}

/** El canal está suspendido o revocado: no se envía nada por él. */
export class CanalNoActivoError extends EstadoInvalidoError {
  readonly code = 'CANAL_NO_ACTIVO';
  constructor() {
    super('El número de WhatsApp de esta conversación está desconectado.');
  }
}

const AUTORIZACION = new Set([0, 3, 10, 190, 131005]);
const LIMITE_DE_TASA = new Set([4, 80007, 130429, 131056]);
const POLITICA = new Set([368, 131031, 131042]);
const TRANSITORIOS = new Set([2, 131000, 131016, 131057, 133004]);

/**
 * El error de dominio que corresponde a una respuesta de error de Meta.
 *
 * `codigo` es `error.code` del cuerpo (nulo si el cuerpo no era el JSON de Meta, por ejemplo una
 * página de un proxy); `estadoHttp` es el estado de la respuesta.
 */
export function errorDeMeta(codigo: number | null, estadoHttp: number): ErrorDeEnvioWhatsapp {
  if (codigo === 131047) return new FueraDeVentanaError(codigo);
  if (codigo === 131026) return new DestinatarioNoDisponibleError(codigo);
  if (codigo !== null && AUTORIZACION.has(codigo)) return new CredencialInvalidaError(codigo);
  if (codigo !== null && LIMITE_DE_TASA.has(codigo)) return new LimiteDeTasaError(codigo);
  if (codigo !== null && POLITICA.has(codigo)) return new CuentaRestringidaError(codigo);
  if (codigo !== null && TRANSITORIOS.has(codigo)) return new FalloTransitorioDeMetaError(codigo);
  // `1` es ambiguo según Meta: con 5xx es transitorio, con 4xx es permanente. Lo mismo vale para
  // un código que no conocemos.
  if (estadoHttp === 429) return new LimiteDeTasaError(codigo);
  if (estadoHttp === 401) return new CredencialInvalidaError(codigo);
  if (estadoHttp >= 500) return new FalloTransitorioDeMetaError(codigo);
  return new EnvioRechazadoError(codigo);
}
