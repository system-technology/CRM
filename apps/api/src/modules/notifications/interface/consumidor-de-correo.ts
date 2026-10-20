/**
 * El consumidor de la cola `correo-saliente`: recoge el trabajo y lo entrega por el puerto.
 *
 * Valida el trabajo (viene de Redis, que no es de fiar). Si el envío falla, BullMQ reintenta con
 * retroceso exponencial. **El error que sale no lleva mensaje**: el de un cliente SMTP puede traer
 * la dirección del destinatario y a veces el cuerpo, y BullMQ guarda el motivo del fallo.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { PuertoCorreo } from '../domain/puerto-correo.js';
import { abrirCorreo, resolverClaveDeCorreo } from '../domain/sellado-de-correo.js';
import {
  crearConexionDeRedis,
  NOMBRE_DE_COLA_DE_CORREO,
  TrabajoDeCorreo,
} from '../infrastructure/cola-de-correo.bullmq.js';

@Injectable()
export class ConsumidorDeCorreo implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ConsumidorDeCorreo.name);
  private worker: Worker | null = null;
  private conexion: Redis | null = null;
  /** Se puede cambiar antes de arrancar: la prueba con Redis real usa una cola propia. */
  nombreDeCola: string = NOMBRE_DE_COLA_DE_CORREO;
  /** Se resuelve de `CORREO_PAYLOAD_KEY` al arrancar; la prueba con Redis real fija la suya. */
  clave: Buffer | null = null;

  constructor(@Inject(PuertoCorreo) private readonly correo: PuertoCorreo) {}

  onModuleInit(): void {
    const url = process.env['REDIS_URL'];
    if (!url) {
      throw new Error('Falta REDIS_URL: el trabajador de correo no tiene de dónde recoger.');
    }
    this.clave ??= resolverClaveDeCorreo(process.env);
    this.conexion = crearConexionDeRedis(url);
    this.worker = new Worker(
      this.nombreDeCola,
      (trabajo) => this.atender(trabajo.data, trabajo.id ?? ''),
      {
        connection: this.conexion,
        concurrency: 5,
      },
    );
    this.worker.on('failed', (trabajo, error) => {
      this.log.warn(`Correo ${trabajo?.id ?? '?'} falló: ${error.name}`);
    });
  }

  /** Público para probarlo sin Redis. */
  async atender(datos: unknown, idDeTrabajo: string): Promise<void> {
    // Se abre y se valida antes de enviar: viene de Redis, que no es de fiar. Un trabajo que no
    // descifra (otra clave, otro identificador, manipulado) no se envía ni se reintenta en vano.
    if (!this.clave) throw new Error('El consumidor de correo no tiene clave.');
    const mensaje = TrabajoDeCorreo.parse(abrirCorreo(datos, this.clave, idDeTrabajo));
    try {
      await this.correo.enviar(mensaje);
    } catch (error) {
      const clase = error instanceof Error ? error.constructor.name : 'Error';
      // Sin `cause` a propósito: el error original puede traer la dirección o el cuerpo.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(`Falló el envío de correo (${clase}).`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.conexion?.quit();
  }
}
