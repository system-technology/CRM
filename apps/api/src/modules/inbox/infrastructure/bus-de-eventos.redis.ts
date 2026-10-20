/**
 * El bus de eventos entre procesos: Redis pub/sub. El trabajador publica, cada réplica de la API
 * se suscribe.
 *
 * **Por qué pub/sub y no el adaptador de Redis de Socket.IO** (decisión de esta rama, ver la
 * bitácora): el relay vive en el TRABAJADOR, que no es un servidor de Socket.IO. Con el adaptador,
 * el trabajador tendría que emitir en el protocolo de Socket.IO (`redis-emitter`: nombres de sala y
 * de evento dentro del trabajador), y eso es llamar al gateway por la puerta de atrás. Con pub/sub,
 * el trabajador publica un EVENTO DE DOMINIO sin saber que existen sockets; cada réplica de la API
 * lo recibe, lo traduce y lo emite a SUS sockets locales. Ninguna réplica necesita hablar con las
 * otras, así que tampoco hace falta el adaptador. A cambio, `disconnectSockets` también viaja como
 * evento de dominio (`identity.acceso_revocado`) y cada réplica cierra los suyos.
 *
 * **Lo que Redis ve:** identificadores. El texto del mensaje no pasa por aquí (ver
 * `evento-de-dominio.ts`).
 */
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import {
  type ManejadorDeEvento,
  PuertoPublicadorDeEventos,
  PuertoSuscriptorDeEventos,
} from '../application/puertos-de-eventos.js';
import { CANAL_DE_EVENTOS, EventoDeDominio } from '../domain/evento-de-dominio.js';

@Injectable()
export class PublicadorRedis extends PuertoPublicadorDeEventos implements OnModuleDestroy {
  private readonly conexion: Redis;

  /** `@inyeccion-manual`: lo construye la fábrica del módulo con la URL de Redis. */
  constructor(url: string) {
    super();
    this.conexion = new Redis(url, { maxRetriesPerRequest: null });
  }

  async publicar(evento: EventoDeDominio): Promise<void> {
    await this.conexion.publish(CANAL_DE_EVENTOS, JSON.stringify(evento));
  }

  async onModuleDestroy(): Promise<void> {
    await this.conexion.quit();
  }
}

@Injectable()
export class SuscriptorRedis extends PuertoSuscriptorDeEventos implements OnModuleDestroy {
  private readonly log = new Logger(SuscriptorRedis.name);
  private readonly conexion: Redis;

  /** `@inyeccion-manual`: lo construye la fábrica del módulo con la URL de Redis. */
  constructor(url: string) {
    super();
    // Una conexión en modo suscriptor no puede hacer otra cosa: es exclusiva de esto.
    this.conexion = new Redis(url, { maxRetriesPerRequest: null });
  }

  async suscribir(manejador: ManejadorDeEvento): Promise<void> {
    this.conexion.on('message', (_canal: string, texto: string) => {
      // Viene de Redis, que no es de fiar: se valida antes de tocar nada.
      let evento: EventoDeDominio;
      try {
        evento = EventoDeDominio.parse(JSON.parse(texto));
      } catch {
        this.log.warn('Evento descartado: no cumple el contrato.');
        return;
      }
      manejador(evento).catch((error: unknown) => {
        // Solo la clase: el mensaje de un error de base puede traer la fila.
        this.log.error(
          `Falló un manejador de eventos (${error instanceof Error ? error.name : 'Error'}).`,
        );
      });
    });
    await this.conexion.subscribe(CANAL_DE_EVENTOS);
  }

  async onModuleDestroy(): Promise<void> {
    await this.conexion.quit();
  }
}
