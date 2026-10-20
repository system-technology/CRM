/**
 * Los puertos del tiempo real. Clases abstractas: Nest necesita un símbolo en ejecución.
 *
 * Tres piezas, en dos procesos:
 *   · TRABAJADOR: el relay lee el outbox y lo publica por `PuertoPublicadorDeEventos`.
 *   · API: `PuertoSuscriptorDeEventos` entrega cada evento a esta réplica, que lo traduce y lo
 *     emite a sus sockets por `PuertoEmisionEnVivo`. El trabajador NUNCA llama al gateway.
 */
import type { EventoBandeja, Mensaje } from '@viajapro/contracts';
import type { EventoDeDominio } from '../domain/evento-de-dominio.js';

export abstract class PuertoPublicadorDeEventos {
  abstract publicar(evento: EventoDeDominio): Promise<void>;
}

export type ManejadorDeEvento = (evento: EventoDeDominio) => Promise<void>;

export abstract class PuertoSuscriptorDeEventos {
  /** Registra el manejador. Un fallo del manejador no debe parar la suscripción. */
  abstract suscribir(manejador: ManejadorDeEvento): Promise<void>;
}

export interface EventoPendiente extends EventoDeDominio {
  /** Tal cual está en el outbox (`bigint` serializado). */
  id: string;
}

/** El outbox, siempre bajo el tenant resuelto (RLS). */
export abstract class PuertoOutbox {
  /**
   * Toma hasta `limite` eventos sin publicar de ESE tenant, los pasa a `publicar` y, si no lanza,
   * los marca publicados en la misma transacción. `FOR UPDATE SKIP LOCKED`: dos relés a la vez no
   * publican lo mismo. Entrega **al menos una vez**: si el proceso muere entre publicar y
   * confirmar, el evento se repite y el cliente lo deduplica por `id`.
   */
  abstract publicarPendientes(
    tenantId: string,
    publicar: (eventos: EventoPendiente[]) => Promise<void>,
    limite: number,
  ): Promise<number>;
  /** Las agencias a barrer, por si un aviso se perdió. */
  abstract tenantsParaBarrer(): Promise<string[]>;
}

/**
 * «Acaba de escribirse un evento para este tenant»: acelera el relay para que el evento llegue en
 * décimas de segundo y no esperando al barrido. Es una pista, no la verdad: si se pierde, el
 * barrido encuentra el evento en el outbox.
 */
export abstract class PuertoAvisoDeOutbox {
  abstract avisar(tenantId: string): void;
  /** Devuelve y vacía los tenants avisados. */
  abstract tomarAvisos(): string[];
}

/** Lo que la API necesita leer para armar el evento del socket. Siempre bajo RLS. */
export abstract class PuertoLecturaDeMensajes {
  /** `null` si no existe en ESE tenant (RLS no deja ver el de otro). */
  abstract mensajePorId(tenantId: string, mensajeId: string): Promise<Mensaje | null>;
}

/** Por dónde sale lo que se emite a los sockets. Lo implementa el gateway. */
export abstract class PuertoEmisionEnVivo {
  abstract emitirATenant(tenantId: string, evento: EventoBandeja): void;
  abstract desconectarUsuario(tenantId: string, usuarioId: string): void;
}
