/**
 * La ventana de servicio de 24 horas.
 *
 * **Es la regla que decide si un mensaje es gratis o se cobra**, así que conviene no tenerla
 * repartida por la aplicación. Meta la describe así: la ventana se abre cuando el usuario te
 * escribe **o te llama**, dura 24 horas, y se reinicia entera con cada evento suyo. Fuera de
 * ella no sale texto libre: solo plantillas aprobadas.
 *
 * Tres cosas que son fáciles de hacer mal y por eso están aquí, juntas y probadas:
 *
 *   1. **La calculamos nosotros.** Meta retiró el objeto `conversation` de los webhooks de
 *      estado en la v24.0, así que ya no hay un campo que diga cuándo expira.
 *
 *   2. **Cuenta desde el instante que reporta Meta, no desde que lo procesamos.** Meta reintenta
 *      hasta siete días: si contáramos desde nuestro procesamiento, una conversación cerrada
 *      aparecería abierta y el asesor escribiría texto libre que Meta rechaza.
 *
 *   3. **Nunca se asigna; siempre se toma el máximo.** Los eventos llegan desordenados, y un
 *      mensaje antiguo que se procesa tarde **cerraría** una ventana que está abierta. Es el
 *      error que más caro sale porque no se ve: no falla nada, simplemente la bandeja miente.
 *
 * Verificado en `docs/04-integraciones/01-whatsapp-cloud-api.md` §7.
 */

import type { VentanaServicio } from '@viajapro/contracts';
import { VentanaCerradaError } from './errores-de-conversacion.js';

/** 24 horas en milisegundos. */
const DURACION_MS = 24 * 60 * 60 * 1000;

/**
 * Qué eventos reinician la ventana.
 *
 * **Reinician: cualquier cosa que origine el usuario.** Texto, media, ubicación, contacto,
 * respuesta a un botón o a una lista, **reacción** —un emoji sobre un mensaje nuestro también
 * es un evento suyo— y **llamada entrante**.
 *
 * **No reinician:** nuestros propios mensajes salientes y los acuses de estado de esos mensajes.
 * Que el viajero *lea* lo que le mandamos no es que nos escriba.
 *
 * La llamada merece un párrafo: desde la Calling API, un cliente puede abrir la ventana sin que
 * nosotros veamos un solo mensaje. Si no se escucha ese webhook, nuestro cálculo se desincroniza
 * del de Meta y la bandeja dice «cerrada» cuando Meta la tiene abierta — y el asesor manda una
 * plantilla de pago donde podía haber escrito gratis.
 */
export type OrigenDelEvento =
  | 'MENSAJE_DEL_CLIENTE'
  | 'REACCION_DEL_CLIENTE'
  | 'LLAMADA_ENTRANTE'
  | 'MENSAJE_NUESTRO'
  | 'ESTADO_DE_MENSAJE';

export function reiniciaLaVentana(origen: OrigenDelEvento): boolean {
  switch (origen) {
    case 'MENSAJE_DEL_CLIENTE':
    case 'REACCION_DEL_CLIENTE':
    case 'LLAMADA_ENTRANTE':
      return true;
    case 'MENSAJE_NUESTRO':
    case 'ESTADO_DE_MENSAJE':
      return false;
  }
}

/**
 * La nueva expiración tras un evento del cliente.
 *
 * **Toma el máximo, nunca asigna.** `expiraActual` es lo que hay guardado; `instanteDelEvento`
 * es el `timestamp` que reportó Meta. Si el evento es más antiguo que lo guardado —y lo será
 * cada vez que un reintento llegue tarde— la ventana no se mueve.
 *
 * Devuelve siempre una fecha: la mayor de las dos.
 */
export function nuevaExpiracion(expiraActual: Date | null, instanteDelEvento: Date): Date {
  const candidata = new Date(instanteDelEvento.getTime() + DURACION_MS);
  if (!expiraActual) return candidata;
  return candidata.getTime() > expiraActual.getTime() ? candidata : expiraActual;
}

/**
 * La ventana tal como la pinta la bandeja.
 *
 * `expiraEn` nulo significa **que el cliente nunca ha escrito**, que no es lo mismo que una
 * ventana vencida: con la primera no se puede ni mandar plantilla si no hay consentimiento, y
 * con la segunda sí. Por eso `minutosRestantes` también es nulo ahí, en vez de cero.
 *
 * Los minutos se redondean **hacia abajo**: decir «queda 1 minuto» cuando quedan 20 segundos es
 * preferible a decir «quedan 2» cuando queda uno. El error tiene que caer del lado que hace que
 * el asesor se apure, no del que le hace confiarse.
 */
export function calcularVentana(expiraEn: Date | null, ahora: Date): VentanaServicio {
  if (!expiraEn) {
    return { abierta: false, expiraEn: null, minutosRestantes: null };
  }

  const restanteMs = expiraEn.getTime() - ahora.getTime();
  return {
    // El instante exacto de la expiración ya está fuera: a las 24 horas clavadas, cerrada.
    abierta: restanteMs > 0,
    expiraEn: expiraEn.toISOString(),
    minutosRestantes: Math.floor(restanteMs / 60_000),
  };
}

/**
 * Qué se puede enviar ahora mismo.
 *
 * Existe aparte de `calcularVentana` porque es la pregunta que de verdad hace la interfaz, y
 * porque responderla mirando `abierta` desde cada componente acaba en que uno de ellos se
 * olvida y deja escribir texto libre que Meta rechaza.
 */
export type QueSePuedeEnviar = 'TEXTO_LIBRE' | 'SOLO_PLANTILLAS';

export function queSePuedeEnviar(ventana: VentanaServicio): QueSePuedeEnviar {
  return ventana.abierta ? 'TEXTO_LIBRE' : 'SOLO_PLANTILLAS';
}

/**
 * La regla que aplica el SERVIDOR antes de aceptar texto libre, en los dos sitios donde se mira:
 * al registrar la respuesta del asesor y otra vez en el trabajador, justo antes de llamar a Meta
 * (la ventana pudo cerrarse mientras el mensaje esperaba en la cola). Fuera de la ventana lanza
 * `VentanaCerradaError`, con su mensaje en español: «solo se pueden enviar plantillas».
 *
 * `ultimoMensajeClienteEn` es la columna de `conversaciones`: el instante de Meta del último
 * evento del cliente, ya con la regla del máximo aplicada al escribirla.
 */
export function exigirVentanaAbierta(ultimoMensajeClienteEn: Date | null, ahora: Date): void {
  const expira = ultimoMensajeClienteEn ? nuevaExpiracion(null, ultimoMensajeClienteEn) : null;
  if (queSePuedeEnviar(calcularVentana(expira, ahora)) !== 'TEXTO_LIBRE') {
    throw new VentanaCerradaError();
  }
}
