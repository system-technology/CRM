/**
 * Pruebas del cableado del alta de suscripción.
 *
 * La decisión —si el token vale, si el modo es el correcto— ya está probada en
 * `verificacion-suscripcion.spec.ts`. Lo que se comprueba aquí es lo otro: que el controlador
 * **devuelva lo que Meta espera** y no otra cosa parecida.
 *
 * El caso que justifica el archivo entero es `007`. Si en algún punto del camino alguien
 * convierte el challenge a número «porque es un número», Meta no da de alta la suscripción y
 * no explica por qué: simplemente no llega ningún mensaje, nunca.
 */

import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebhookWhatsappController } from './webhook-whatsapp.controller.js';

/** Respuesta de mentira que solo apunta qué cabeceras se le pidieron. */
function respuestaFalsa(): Response & { cabeceras: Record<string, string> } {
  const cabeceras: Record<string, string> = {};
  return {
    cabeceras,
    setHeader(nombre: string, valor: string) {
      cabeceras[nombre] = valor;
      return this;
    },
  } as unknown as Response & { cabeceras: Record<string, string> };
}

const TOKEN = 'token-de-verificacion-de-pruebas';

describe('WebhookWhatsappController — alta de suscripción', () => {
  let controlador: WebhookWhatsappController;
  let tokenPrevio: string | undefined;
  let res: ReturnType<typeof respuestaFalsa>;

  beforeEach(() => {
    tokenPrevio = process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'];
    process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] = TOKEN;
    // El alta de suscripción no toca la persistencia; el caso de uso solo hace falta para
    // construir el controlador.
    controlador = new WebhookWhatsappController(
      null as unknown as ConstructorParameters<typeof WebhookWhatsappController>[0],
    );
    res = respuestaFalsa();
  });

  /** El `res` lo pone el ayudante: en las pruebas estorba y nunca cambia. */
  const ejecutar = (parametros: Record<string, string | undefined>) =>
    controlador.darDeAltaSuscripcion(parametros, res);

  afterEach(() => {
    if (tokenPrevio === undefined) delete process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'];
    else process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] = tokenPrevio;
  });

  const alta = (sobrescribir: Record<string, string | undefined> = {}) => ({
    'hub.mode': 'subscribe',
    'hub.verify_token': TOKEN,
    'hub.challenge': '1158201444',
    ...sobrescribir,
  });

  it('devuelve el challenge tal cual cuando el token coincide', () => {
    expect(ejecutar(alta())).toBe('1158201444');
  });

  it('devuelve una CADENA, no un número', () => {
    expect(typeof ejecutar(alta())).toBe('string');
  });

  it('conserva los ceros a la izquierda: «007» no puede volver como «7»', () => {
    expect(ejecutar(alta({ 'hub.challenge': '007' }))).toBe('007');
  });

  it('conserva un challenge que no es numérico', () => {
    const raro = 'aB3-_x.9';
    expect(ejecutar(alta({ 'hub.challenge': raro }))).toBe(raro);
  });

  it('rechaza con 403 cuando el token no coincide', () => {
    try {
      ejecutar(alta({ 'hub.verify_token': 'otro' }));
      expect.unreachable('debería haber lanzado');
    } catch (e) {
      expect((e as { getStatus(): number }).getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });

  it('no filtra el motivo del rechazo en el cuerpo de la respuesta', () => {
    try {
      ejecutar(alta({ 'hub.verify_token': 'otro' }));
      expect.unreachable('debería haber lanzado');
    } catch (e) {
      const cuerpo = (e as { getResponse(): unknown }).getResponse();
      expect(JSON.stringify(cuerpo ?? '')).not.toMatch(/TOKEN|MODO|PARAMETRO/i);
    }
  });

  it('anuncia el challenge como text/plain, que es lo que Meta espera', () => {
    ejecutar(alta());
    expect(res.cabeceras['Content-Type']).toBe('text/plain; charset=utf-8');
  });

  it('NO deja la ruta marcada como texto plano cuando rechaza', () => {
    // Esta prueba nace de un fallo real, visto contra la API viva: con la cabecera puesta en
    // un decorador de ruta se aplicaba también al 403, y el filtro de excepciones responde con
    // `res.json()`, que no pisa un Content-Type ya fijado. Salía un JSON anunciado como texto
    // plano. Nada se rompía; simplemente mentía.
    //
    // LÍMITE DE ESTA PRUEBA, que conviene no olvidar: comprueba que el MANEJADOR no fija la
    // cabecera al rechazar. Si alguien devuelve el `@Header` al decorador de la ruta, la fija
    // Nest por fuera, este doble no se entera y la prueba sigue verde. Cazarlo exige una
    // petición HTTP de verdad contra la aplicación montada. Está en la cola de ESTADO.md.
    expect(() => ejecutar(alta({ 'hub.verify_token': 'otro' }))).toThrow();
    expect(res.cabeceras['Content-Type']).toBeUndefined();
  });

  it('pide que no se cachee el challenge', () => {
    ejecutar(alta());
    expect(res.cabeceras['Cache-Control']).toBe('no-store');
  });

  it('rechaza cuando el modo no es «subscribe»', () => {
    expect(() => ejecutar(alta({ 'hub.mode': 'unsubscribe' }))).toThrow();
  });

  it('rechaza cuando falta el challenge', () => {
    expect(() => ejecutar(alta({ 'hub.challenge': undefined }))).toThrow();
  });

  it('rechaza cuando NO hay token configurado, en vez de dar por buena el alta', () => {
    delete process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'];
    expect(() => ejecutar(alta())).toThrow();
  });

  it('lee el token en cada petición, no al construirse', () => {
    // Importa porque el proceso puede arrancar antes de que el entorno esté completo, y
    // porque una instancia cacheada haría que rotar el token exigiera reiniciar la API.
    process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'] = 'token-rotado';
    expect(() => ejecutar(alta())).toThrow();
    expect(ejecutar(alta({ 'hub.verify_token': 'token-rotado' }))).toBe('1158201444');
  });
});
