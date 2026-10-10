/**
 * Caso de uso: recibir un `POST` de Meta y dejarlo guardado antes de decir que sí.
 *
 * **El orden no es negociable y contradice la guía de integración.** El documento de Meta
 * recomienda «encolar y devolver 200 rápido»; el ADR-0008 §4 exige **persistir antes del 200**.
 * Manda el ADR, y la razón es sencilla: el 200 es la única señal que Meta acepta como «lo
 * tengo». Si se responde antes de escribir y el proceso muere en ese hueco, el mensaje del
 * viajero no existe en ningún sitio y Meta nunca lo reintenta, porque ya le dijimos que sí.
 *
 * **Qué NO hace aquí.** No resuelve de qué agencia es el mensaje, no lo interpreta y no toca
 * ninguna tabla con `tenant_id`. Eso ocurre después, en el trabajador, con el rol
 * `viajapro_webhook`. Aquí solo se guarda el sobre cerrado: es lo que permite escribir sin
 * saber todavía a quién pertenece.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { desglosarSobre } from '../domain/sobre-webhook.js';
import { identificarRecepcion } from '../domain/identidad-recepcion.js';
import { verificarFirma } from '../domain/firma-webhook.js';
import { resolverClavePayload, sellarPayload } from '../domain/payload-sellado.js';
import { PuertoRecepciones } from './puerto-recepciones.js';

export type ResultadoRecepcion =
  | { estado: 'REGISTRADA'; changes: number }
  | { estado: 'YA_REGISTRADA' }
  | { estado: 'SIN_CHANGES' }
  | { estado: 'FIRMA_INVALIDA'; motivo: string };

@Injectable()
export class RegistrarRecepcion {
  private readonly log = new Logger(RegistrarRecepcion.name);

  constructor(@Inject(PuertoRecepciones) private readonly recepciones: PuertoRecepciones) {}

  async ejecutar(cuerpo: Buffer, cabeceraFirma: string | undefined): Promise<ResultadoRecepcion> {
    // Primero la firma, sobre los BYTES CRUDOS. Antes de leer nada del contenido: lo que no
    // viene de Meta no merece ni que lo interpretemos.
    const firma = verificarFirma(cuerpo, cabeceraFirma, this.resolverSecreto());
    if (!firma.valida) return { estado: 'FIRMA_INVALIDA', motivo: firma.motivo };

    // El desglose parsea por su cuenta y distingue los tres motivos por los que un sobre no
    // trae nada que guardar. Una recepción con cero changes sería una fila que ningún
    // trabajador tomaría jamás.
    const sobre = desglosarSobre(cuerpo);
    if (!sobre.ok) {
      this.log.warn(`Sobre sin changes aprovechables: ${sobre.motivo}. Se responde 200 igual.`);
      return { estado: 'SIN_CHANGES' };
    }

    const recepcionId = identificarRecepcion(cuerpo);
    const clave = resolverClavePayload(process.env, 'WEBHOOK_PAYLOAD_KEY');
    const sellado = sellarPayload(cuerpo, clave, recepcionId);

    const registrada = await this.recepciones.registrar({
      recepcionId,
      cifrado: sellado.cifrado,
      nonce: sellado.nonce,
      tag: sellado.tag,
      claveVersion: this.resolverVersionDeClave(),
      totalChanges: sobre.cambios.length,
    });

    if (!registrada) {
      // Meta reintenta: ante un tiempo de espera, ante un 500, y a veces ante un 200 que no le
      // llegó. Como el identificador es el hash del cuerpo, el reintento cae en la fila que ya
      // existe y no se duplica nada. Esto es R5 funcionando, no un error.
      this.log.log('Recepción repetida; ya estaba guardada. Se responde 200 igual.');
      return { estado: 'YA_REGISTRADA' };
    }

    this.log.log(`Recepción guardada con ${sobre.cambios.length} change(s) pendientes.`);
    return { estado: 'REGISTRADA', changes: sobre.cambios.length };
  }

  private resolverSecreto(): string | undefined {
    return process.env['META_APP_SECRET'];
  }

  /**
   * La versión de clave con la que se cifró esta fila.
   *
   * Se guarda junto al criptograma para que una rotación no deje ilegible lo ya escrito: el
   * trabajador mira este número para saber con cuál de las dos claves abrir.
   */
  private resolverVersionDeClave(): number {
    const crudo = process.env['WEBHOOK_PAYLOAD_KEY_VERSION'];
    const version = Number(crudo);
    if (!crudo || !Number.isInteger(version) || version < 1) {
      throw new Error(
        'WEBHOOK_PAYLOAD_KEY_VERSION debe ser un entero >= 1. Sin ella, una rotación de clave ' +
          'dejaría ilegibles las filas anteriores sin forma de saber cuál las abría.',
      );
    }
    return version;
  }
}
