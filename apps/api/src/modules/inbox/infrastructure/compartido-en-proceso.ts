/**
 * Lo que los DOS contextos de Nest del modo `unico` comparten en memoria (ADR-0019 §1.1).
 *
 * `main-unico.ts` lo crea UNA vez y se lo pasa a cada contexto por un módulo dinámico. Es lo único
 * que cruza de un contenedor de inyección al otro, y no lleva ningún pool de base de datos: la API
 * nunca alcanza `PrismaWebhookService` por aquí (R2).
 *
 *   bus            el relay (trabajador) publica y la pasarela de Socket.IO (API) escucha.
 *   avisos         la API avisa «hay eventos en el outbox» y el relay los recoge.
 *   colaDeChanges  el webhook (API) encola y `ProcesarChange` (trabajador) procesa.
 */
import { Logger } from '@nestjs/common';
import { AvisosDeOutboxEnMemoria } from './avisos-de-outbox.en-memoria.js';
import { BusDeEventosEnMemoria } from './bus-de-eventos.en-memoria.js';
import { ColaDeChangesEnProceso } from './cola-de-changes.en-proceso.js';

export interface CompartidoDelInbox {
  bus: BusDeEventosEnMemoria;
  avisos: AvisosDeOutboxEnMemoria;
  colaDeChanges: ColaDeChangesEnProceso;
}

export const COMPARTIDO_DEL_INBOX = Symbol('COMPARTIDO_DEL_INBOX');

/** Código y clase de un error, nunca su mensaje: el de una base de datos puede traer la fila (R10). */
function codigoSeguro(error: unknown): string {
  const e = error as { code?: unknown; constructor?: { name?: string } } | null;
  const clase = e?.constructor?.name ?? 'Error';
  return typeof e?.code === 'string' ? `${clase}:${e.code}` : clase;
}

export function crearCompartidoDelInbox(): CompartidoDelInbox {
  const log = new Logger('ColaDeChangesEnProceso');
  return {
    bus: new BusDeEventosEnMemoria(),
    avisos: new AvisosDeOutboxEnMemoria(),
    colaDeChanges: new ColaDeChangesEnProceso({
      alFallar: (clave, contexto, error) =>
        log.error(
          `Change ${clave.slice(0, 12)} falló (intento ${contexto.intento}): ${codigoSeguro(error)}`,
        ),
      alAgotar: (clave) =>
        log.error(
          `Change ${clave.slice(0, 12)} agotó los reintentos en memoria; sigue pendiente en la ` +
            'base y lo recoge el barrido.',
        ),
    }),
  };
}
