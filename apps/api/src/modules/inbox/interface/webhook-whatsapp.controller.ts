/**
 * El punto de entrada de los webhooks de WhatsApp Cloud API.
 *
 * **Un solo endpoint para todas las agencias.** Meta no permite un webhook por tenant: manda
 * todo a la misma URL, firmado con el único App Secret de la aplicación. Resolver a qué agencia
 * pertenece cada mensaje es el problema que resuelve el ADR-0008, y ocurre en el `POST`.
 *
 * Este archivo cablea, por ahora, solo el `GET` — el apretón de manos de alta de la
 * suscripción. Se hace primero a propósito: **no toca la base de datos**, así que puede quedar
 * en pie y verificable contra Meta antes de que exista nada de persistencia.
 *
 * Dos cosas que este controlador no hace y conviene no olvidar:
 *
 *   · **No deduce el tenant.** La ruta está en `RUTAS_SIN_TENANT` del middleware, y debe
 *     seguir estándolo: un webhook llega sin sesión, por definición.
 *
 *   · **No parsea el cuerpo.** `main.ts` monta `express.raw()` sobre `/webhooks` porque la
 *     firma del `POST` se calcula sobre los bytes exactos que mandó Meta. Reserializar el JSON
 *     rompe la firma, y lo hace solo cuando el mensaje lleva tildes — es decir, en producción
 *     y no en las pruebas.
 */

import { Controller, Get, HttpException, HttpStatus, Logger, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  type ResultadoSuscripcion,
  verificarSuscripcion,
} from '../domain/verificacion-suscripcion.js';

/** Lo que Meta manda en el alta. Las claves llevan punto; Express no las parte. */
type ParametrosDeAlta = Record<string, string | undefined>;

@Controller('webhooks/whatsapp')
export class WebhookWhatsappController {
  private readonly log = new Logger(WebhookWhatsappController.name);

  /**
   * `GET /webhooks/whatsapp` — alta de la suscripción.
   *
   * Meta espera **el challenge tal cual, en texto plano**. No un JSON que lo contenga, no el
   * número convertido: la cadena. Un challenge como `007` que vuelva como `7` deja la
   * suscripción sin crear, y Meta no explica por qué — simplemente no llega ningún mensaje
   * nunca.
   */
  @Get()
  darDeAltaSuscripcion(
    @Query() parametros: ParametrosDeAlta,
    @Res({ passthrough: true }) res: Response,
  ): string {
    const resultado = verificarSuscripcion(
      parametros,
      process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'],
    );

    if (!resultado.ok) {
      this.registrarRechazo(resultado);
      // Un código estable y un mensaje que no distingue entre fallar el modo, el token o un
      // parámetro: decir cuál de los tres falló es un oráculo gratis para quien prueba a ciegas.
      throw new HttpException(
        {
          error: {
            code: 'VERIFICACION_RECHAZADA',
            message: 'No se pudo verificar la suscripción.',
          },
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // La cabecera se pone AQUÍ y no en un decorador de la ruta. Con `@Header` se aplica
    // también al 403, y como el filtro de excepciones responde con `res.json()` —que no pisa
    // un Content-Type ya fijado— salía un JSON anunciado como texto plano. Verificado contra
    // la API viva: ése era el comportamiento real, no una hipótesis.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    this.log.log('Suscripción de webhook verificada; se devuelve el challenge.');
    return resultado.challenge;
  }

  /**
   * El motivo se escribe en el registro del servidor, nunca en la respuesta.
   *
   * `SIN_TOKEN` se separa como error porque no es un intento fallido de nadie: es nuestra
   * configuración, y significa que el alta no podrá completarse hasta que alguien mire.
   */
  private registrarRechazo(resultado: Extract<ResultadoSuscripcion, { ok: false }>): void {
    if (resultado.motivo === 'SIN_TOKEN') {
      this.log.error(
        'Falta WHATSAPP_WEBHOOK_VERIFY_TOKEN. Mientras no esté, ninguna suscripción de Meta ' +
          'puede darse de alta y la bandeja no recibirá un solo mensaje.',
      );
      return;
    }
    this.log.warn(`Alta de suscripción rechazada: ${resultado.motivo}.`);
  }
}
