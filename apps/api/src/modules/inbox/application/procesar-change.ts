/**
 * Caso de uso del trabajador: procesar UN `change` ya guardado. ADR-0008 §4, lado asíncrono.
 *
 * El grano es el `change` y no la recepción: un POST puede traer changes de agencias distintas, y
 * cada uno se resuelve, se escribe y se cierra por su cuenta.
 *
 * **Idempotente a propósito.** BullMQ reintenta, el POST reencola ante un reintento de Meta y un
 * proceso puede morir entre escribir el mensaje y cerrar el change. Por eso: un change ya
 * resuelto no hace nada, y el mensaje se inserta con `UNIQUE (tenant_id, wamid)`.
 *
 * **Las dos ramas que no escriben nada de negocio** —número desconocido y canal revocado— cierran
 * el change como CLASIFICADO, lo que anula el contenido en el acto. Conservar el texto de un
 * excliente, o de un número que nadie reconoce, no tiene finalidad (Ley 1581).
 */
import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { claveDeEnrutamiento } from '../domain/clave-de-enrutamiento.js';
import { contenidoDelCambio } from '../domain/contenido-del-cambio.js';
import { abrirPayload, resolverClavePayload } from '../domain/payload-sellado.js';
import { desglosarSobre } from '../domain/sobre-webhook.js';
import { PuertoAvisoDeOutbox } from './puertos-de-eventos.js';
import { type EnrutamientoResuelto, PuertoBandeja, PuertoStaging } from './puertos-de-proceso.js';

export type ResultadoDeProceso =
  | { estado: 'NO_ENCONTRADO' }
  | { estado: 'YA_RESUELTO' }
  | { estado: 'PROCESADO'; mensajesNuevos: number; mensajesRepetidos: number }
  | {
      estado: 'CLASIFICADO';
      motivo: 'DESCONOCIDO' | 'REVOCADO' | 'SIN_NUMERO' | 'CAMPO_NO_SOPORTADO' | 'SIN_CAMBIO';
    }
  /** Directorio en reconstrucción: el contenido se retiene y el change sigue pendiente. */
  | { estado: 'RETENIDO' };

type Entorno = Record<string, string | undefined>;

@Injectable()
export class ProcesarChange {
  private readonly log = new Logger(ProcesarChange.name);

  constructor(
    @Inject(PuertoStaging) private readonly staging: PuertoStaging,
    @Inject(PuertoBandeja) private readonly bandeja: PuertoBandeja,
    // La pista para el relay del outbox. Opcional: sin ella el barrido periódico igual lo publica.
    @Optional()
    @Inject(PuertoAvisoDeOutbox)
    private readonly avisos?: PuertoAvisoDeOutbox,
  ) {}

  async ejecutar(
    recepcionId: Buffer,
    indice: number,
    entorno: Entorno = process.env,
  ): Promise<ResultadoDeProceso> {
    const change = await this.staging.tomar(recepcionId, indice);
    if (!change) return { estado: 'NO_ENCONTRADO' };
    if (change.estado !== 'PENDIENTE') return { estado: 'YA_RESUELTO' };

    if (!change.cifrado || !change.nonce || !change.tag) {
      // Pendiente pero sin contenido: no debería existir. Lanzar deja el change pendiente y
      // visible para la alerta de «pendientes de más de cinco minutos» en vez de esconderlo.
      throw new Error('Change pendiente sin contenido: no se puede procesar ni descartar.');
    }

    const cuerpo = abrirPayload(
      { cifrado: change.cifrado, nonce: change.nonce, tag: change.tag },
      this.claveParaVersion(change.claveVersion, entorno),
      recepcionId,
    );
    // El AAD ya ata el texto cifrado a su fila; esto ata además el contenido al identificador.
    if (!createHash('sha256').update(cuerpo).digest().equals(recepcionId)) {
      throw new Error('El contenido descifrado no corresponde a su recepción.');
    }

    const sobre = desglosarSobre(cuerpo);
    const cambio = sobre.ok ? sobre.cambios.find((c) => c.indice === indice) : undefined;
    if (!cambio) return this.clasificar(recepcionId, indice, 'SIN_CAMBIO');
    if (cambio.campo !== 'messages') {
      // Plantillas, calidad, cuenta: eventos de gestión. Sin manejador todavía; ver la cola.
      return this.clasificar(recepcionId, indice, 'CAMPO_NO_SOPORTADO');
    }
    if (cambio.numeroId === null) return this.clasificar(recepcionId, indice, 'SIN_NUMERO');

    const ruta = await this.resolverRuta(cambio.numeroId, entorno);
    if (ruta === null) {
      if (entorno['WHATSAPP_DIRECTORY_REBUILD_IN_PROGRESS'] === 'true') {
        // Un directorio a medio reconstruir responde «desconocido» para todo: borrar ahora
        // destruiría mensajes de clientes. Se retiene hasta que acabe la reconstrucción.
        this.log.warn('Número sin fila en el directorio durante una reconstrucción: se retiene.');
        return { estado: 'RETENIDO' };
      }
      return this.clasificar(recepcionId, indice, 'DESCONOCIDO');
    }
    if (ruta.estado === 'REVOCADO' || ruta.canalId === null) {
      return this.clasificar(recepcionId, indice, 'REVOCADO');
    }

    let nuevos = 0;
    let repetidos = 0;
    for (const mensaje of contenidoDelCambio(cambio.valor).mensajes) {
      const r = await this.bandeja.registrarEntrante(ruta.tenantId, ruta.canalId, mensaje);
      if (r === 'CANAL_REVOCADO') {
        // La verdad (`canales`) contradice al directorio derivado. Manda la verdad.
        return this.clasificar(recepcionId, indice, 'REVOCADO');
      }
      if (r === 'CREADO') nuevos += 1;
      else repetidos += 1;
    }

    await this.staging.cerrar(recepcionId, indice, 'PROCESADO');
    // Los eventos ya están en el outbox (misma transacción que el mensaje): esto solo avisa al
    // relay para que salgan en décimas de segundo. Sin tenant de por medio en el aviso: es el
    // que resolvió el directorio, nunca el que dice el contenido.
    if (nuevos > 0) this.avisos?.avisar(ruta.tenantId);
    return { estado: 'PROCESADO', mensajesNuevos: nuevos, mensajesRepetidos: repetidos };
  }

  private async clasificar(
    recepcionId: Buffer,
    indice: number,
    motivo: Extract<ResultadoDeProceso, { estado: 'CLASIFICADO' }>['motivo'],
  ): Promise<ResultadoDeProceso> {
    await this.staging.cerrar(recepcionId, indice, 'CLASIFICADO');
    // Sin el identificador del número en el registro: es dato de ruteo de una agencia.
    this.log.warn(`Change clasificado y descartado sin filas de negocio: ${motivo}.`);
    return { estado: 'CLASIFICADO', motivo };
  }

  /** Ventana de dos pimientas: primero la actual, luego la anterior si la hay. */
  private async resolverRuta(
    phoneNumberId: string,
    entorno: Entorno,
  ): Promise<EnrutamientoResuelto | null> {
    const pimientas = [
      entorno['WHATSAPP_DIRECTORY_PEPPER'],
      entorno['WHATSAPP_DIRECTORY_PEPPER_PREVIOUS'],
    ].filter((p): p is string => typeof p === 'string' && p.length > 0);
    if (pimientas.length === 0) {
      throw new Error(
        'Falta WHATSAPP_DIRECTORY_PEPPER: sin ella no se puede resolver ningún tenant.',
      );
    }
    for (const pimienta of pimientas) {
      const ruta = await this.staging.resolver(claveDeEnrutamiento(pimienta, 'pn', phoneNumberId));
      if (ruta) return ruta;
    }
    return null;
  }

  /** La clave con la que se cifró la fila: la actual, o la anterior durante una rotación. */
  private claveParaVersion(version: number, entorno: Entorno): Buffer {
    const actual = Number(entorno['WEBHOOK_PAYLOAD_KEY_VERSION']);
    if (version === actual) return resolverClavePayload(entorno, 'WEBHOOK_PAYLOAD_KEY');
    return resolverClavePayload(entorno, 'WEBHOOK_PAYLOAD_KEY_PREVIOUS');
  }
}
