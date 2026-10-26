/**
 * Los puertos del ENVÍO saliente por WhatsApp (ADR-0018). Clases abstractas: Nest necesita un
 * símbolo en ejecución para inyectar.
 *
 * Cinco piezas, separadas porque cambian por motivos distintos:
 *   · `PuertoEnvioWhatsapp`: hablar con Meta. Adaptador real (Graph API) y falso (pruebas).
 *   · `PuertoCredencialesWhatsapp`: de dónde sale el token. Hoy, del entorno y solo para el número
 *     de prueba; mañana, de `cuentas_whatsapp`, cifrado por agencia. Cambiarlo no toca nada más.
 *   · `PuertoMensajesSalientes`: leer y escribir el mensaje, bajo RLS y SIN red dentro.
 *   · `PuertoColaDeEnvios`: encolar por id (BullMQ).
 *   · `PuertoReservaDeEnvio`: la marca durable de «esta petición ya pudo salir».
 */
import type { EstadoMensaje } from '../domain/contenido-del-cambio.js';
import type { ErrorDeEnvioWhatsapp } from '../domain/errores-de-envio.js';

/** Lo necesario para llamar a Meta en nombre de un canal. **El token nunca se registra.** */
export interface CredencialDeEnvio {
  phoneNumberId: string;
  token: string;
}

export interface PedidoDeTexto {
  credencial: CredencialDeEnvio;
  /** E.164 con `+`. */
  para: string;
  texto: string;
  /** El id de NUESTRO mensaje. Viaja como `biz_opaque_callback_data` y vuelve en los estados. */
  referencia: string;
}

/**
 * Hablar con Meta. Devuelve el `wamid` o lanza un `ErrorDeEnvioWhatsapp` ya clasificado
 * (reintentable o no, con su código de Meta). Nunca lanza otra cosa.
 */
export abstract class PuertoEnvioWhatsapp {
  abstract enviarTexto(pedido: PedidoDeTexto): Promise<{ wamid: string }>;
}

export abstract class PuertoCredencialesWhatsapp {
  /**
   * La credencial con la que ESE canal puede enviar. Lanza `CredencialNoDisponibleError` si no
   * hay. Recibe el tenant para que el adaptador por agencia lea bajo RLS.
   */
  abstract paraCanal(
    tenantId: string,
    canal: { canalId: string; phoneNumberId: string },
  ): Promise<CredencialDeEnvio>;
}

/** Lo que el trabajador necesita saber de un mensaje para enviarlo. Sin el token. */
export interface MensajePorEnviar {
  mensajeId: string;
  conversacionId: string;
  estado: EstadoMensaje;
  /** `true` si ya tiene `wamid`: Meta ya lo aceptó y no se vuelve a enviar nunca. */
  aceptadoPorMeta: boolean;
  tipo: string;
  texto: string | null;
  destinoE164: string;
  canalId: string;
  phoneNumberId: string;
  canalActivo: boolean;
  ultimoMensajeClienteEn: Date | null;
}

/** El mensaje saliente en la base, siempre bajo el tenant resuelto (RLS). */
export abstract class PuertoMensajesSalientes {
  /** `null` si no existe en ESE tenant o no es saliente. Una lectura, y la transacción se cierra. */
  abstract leerParaEnviar(tenantId: string, mensajeId: string): Promise<MensajePorEnviar | null>;
  /**
   * Guarda el `wamid` que devolvió Meta. Condicional: solo si aún no tenía (un webhook de estado
   * pudo llegar primero y ya haberlo guardado).
   */
  abstract registrarAceptado(tenantId: string, mensajeId: string, wamid: string): Promise<void>;
  /**
   * `FALLIDO` con el código crudo y el motivo para el asesor, y su evento de outbox en la misma
   * transacción. Condicional: solo si sigue `PENDIENTE` y sin `wamid`. Devuelve si escribió.
   */
  abstract registrarFallo(
    tenantId: string,
    mensajeId: string,
    error: Pick<ErrorDeEnvioWhatsapp, 'codigoMeta' | 'message'>,
  ): Promise<boolean>;
}

/** La cola `inbox-envios`. Transporta únicamente identificadores. */
export abstract class PuertoColaDeEnvios {
  /** Idempotente: el `jobId` sale del id del mensaje, y BullMQ ignora el repetido. */
  abstract encolar(tenantId: string, mensajeId: string): Promise<void>;
}

/**
 * La marca de «la petición a Meta de este mensaje ya pudo haber salido». Se pone ANTES de llamar
 * y solo se quita cuando Meta respondió que no lo aceptó. Si el proceso muere a mitad de la
 * llamada, la marca sigue ahí y el reintento no vuelve a enviar (R5).
 */
export abstract class PuertoReservaDeEnvio {
  /** `true` si la reserva es nueva; `false` si ya existía (un intento anterior pudo enviar). */
  abstract reservar(mensajeId: string): Promise<boolean>;
  abstract liberar(mensajeId: string): Promise<void>;
}
