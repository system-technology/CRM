/**
 * La pista API -> trabajador: «hay eventos nuevos en el outbox de esta agencia».
 *
 * El outbox sigue siendo la verdad y el relay del trabajador sigue siendo quien publica. Esto solo
 * evita que una acción hecha desde la API (reasignar, responder) espere al barrido de 15 s para
 * llegar a los sockets: sin la pista, `CONVERSACION_RETIRADA` tardaría hasta 15 s, y la decisión de
 * producto pide menos de 5 (CA11). Si la pista se pierde, el barrido encuentra el evento.
 *
 * Lo único que viaja es el id de la agencia.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { PuertoAvisoAlRelay, PuertoAvisoDeOutbox } from '../application/puertos-de-eventos.js';
import { CANAL_DE_AVISOS_DEL_RELAY } from '../domain/evento-de-dominio.js';

/** Sin Redis (pruebas, desarrollo suelto): no hay a quién avisar; el barrido o la prueba vacían el outbox. */
@Injectable()
export class AvisoAlRelayInerte extends PuertoAvisoAlRelay {
  avisar(_tenantId: string): Promise<void> {
    return Promise.resolve();
  }
}

@Injectable()
export class AvisoAlRelayRedis extends PuertoAvisoAlRelay implements OnModuleDestroy {
  private readonly conexion: Redis;

  /** `@inyeccion-manual`: lo construye la fábrica del módulo con la URL de Redis. */
  constructor(url: string) {
    super();
    this.conexion = new Redis(url, { maxRetriesPerRequest: null });
  }

  async avisar(tenantId: string): Promise<void> {
    await this.conexion.publish(CANAL_DE_AVISOS_DEL_RELAY, tenantId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.conexion.quit();
  }
}

/** En el TRABAJADOR: convierte cada aviso de la API en una pista del relay. */
@Injectable()
export class EscuchaDeAvisosDelRelay implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(EscuchaDeAvisosDelRelay.name);
  private readonly conexion: Redis;

  /** `@inyeccion-manual`: lo construye la fábrica del módulo con la URL de Redis. */
  constructor(
    url: string,
    private readonly pistas: PuertoAvisoDeOutbox,
  ) {
    this.conexion = new Redis(url, { maxRetriesPerRequest: null });
  }

  async onModuleInit(): Promise<void> {
    this.conexion.on('message', (_canal: string, texto: string) => {
      // Viene de Redis, que no es de fiar: solo se acepta un uuid.
      const id = z.string().uuid().safeParse(texto);
      if (id.success) this.pistas.avisar(id.data);
      else this.log.warn('Aviso descartado: no es el id de una agencia.');
    });
    await this.conexion.subscribe(CANAL_DE_AVISOS_DEL_RELAY);
  }

  async onModuleDestroy(): Promise<void> {
    await this.conexion.quit();
  }
}
