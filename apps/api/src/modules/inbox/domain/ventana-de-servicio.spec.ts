/**
 * Pruebas de la ventana de servicio.
 *
 * Cada una corresponde a una forma concreta de perder dinero o de rechazar un envío. No hay
 * ninguna que compruebe que una suma suma.
 */

import { describe, expect, it } from 'vitest';
import {
  calcularVentana,
  nuevaExpiracion,
  queSePuedeEnviar,
  reiniciaLaVentana,
  type OrigenDelEvento,
} from './ventana-de-servicio.js';

const HORA = 3_600_000;
const AHORA = new Date('2026-10-11T12:00:00.000Z');

describe('reiniciaLaVentana — qué cuenta como «el cliente nos habló»', () => {
  const casos: [OrigenDelEvento, boolean, string][] = [
    ['MENSAJE_DEL_CLIENTE', true, 'lo evidente'],
    ['REACCION_DEL_CLIENTE', true, 'un emoji sobre un mensaje nuestro también es un evento suyo'],
    ['LLAMADA_ENTRANTE', true, 'desde la Calling API, una llamada abre la ventana sin un mensaje'],
    ['MENSAJE_NUESTRO', false, 'escribirle nosotros no es que nos escriba'],
    ['ESTADO_DE_MENSAJE', false, 'que lea lo nuestro tampoco'],
  ];

  for (const [origen, esperado, porque] of casos) {
    it(`${origen} → ${esperado ? 'reinicia' : 'no reinicia'} (${porque})`, () => {
      expect(reiniciaLaVentana(origen)).toBe(esperado);
    });
  }

  it('la reacción reinicia, y es el caso que más fácil se olvida', () => {
    // Si no contara, una conversación en la que el viajero solo reacciona con un pulgar
    // aparecería cerrada y el asesor mandaría una plantilla de pago por nada.
    expect(reiniciaLaVentana('REACCION_DEL_CLIENTE')).toBe(true);
  });
});

describe('nuevaExpiracion — el máximo, nunca la asignación', () => {
  it('sin ventana previa, abre 24 h desde el evento', () => {
    const r = nuevaExpiracion(null, AHORA);
    expect(r.getTime() - AHORA.getTime()).toBe(24 * HORA);
  });

  it('un evento MÁS NUEVO extiende la ventana', () => {
    const previa = new Date(AHORA.getTime() + 1 * HORA);
    const r = nuevaExpiracion(previa, AHORA);
    expect(r.getTime()).toBe(AHORA.getTime() + 24 * HORA);
  });

  it('un evento MÁS VIEJO no la acorta: es el fallo que no se ve', () => {
    // Meta reintenta hasta siete días. Un mensaje de ayer procesado hoy, asignado en vez de
    // comparado, cerraría una ventana que está abierta. No falla nada: la bandeja miente.
    const previa = new Date(AHORA.getTime() + 20 * HORA);
    const eventoViejo = new Date(AHORA.getTime() - 10 * HORA);
    expect(nuevaExpiracion(previa, eventoViejo).getTime()).toBe(previa.getTime());
  });

  it('reprocesar el mismo evento dos veces deja la ventana igual', () => {
    const primera = nuevaExpiracion(null, AHORA);
    const segunda = nuevaExpiracion(primera, AHORA);
    expect(segunda.getTime()).toBe(primera.getTime());
  });

  it('cuenta desde el instante de META, no desde el nuestro', () => {
    // El evento ocurrió hace 23 horas y lo procesamos ahora: queda una hora, no veinticuatro.
    const instanteDeMeta = new Date(AHORA.getTime() - 23 * HORA);
    const expira = nuevaExpiracion(null, instanteDeMeta);
    expect(calcularVentana(expira, AHORA).minutosRestantes).toBe(60);
  });
});

describe('calcularVentana — lo que ve la bandeja', () => {
  it('abierta, con los minutos que quedan', () => {
    const expira = new Date(AHORA.getTime() + 90 * 60_000);
    const v = calcularVentana(expira, AHORA);
    expect(v.abierta).toBe(true);
    expect(v.minutosRestantes).toBe(90);
  });

  it('vencida: cerrada y con minutos NEGATIVOS, no cero', () => {
    // El signo le dice al asesor cuánto hace que se cerró, que es distinto de «se acaba de
    // cerrar». Aplastarlo a cero pierde esa información.
    const expira = new Date(AHORA.getTime() - 2 * HORA);
    const v = calcularVentana(expira, AHORA);
    expect(v.abierta).toBe(false);
    expect(v.minutosRestantes).toBe(-120);
  });

  it('a las 24 h clavadas está CERRADA, no abierta', () => {
    // El límite exacto cae del lado seguro: si Meta lo considera cerrado y nosotros abierto,
    // el envío falla delante del cliente.
    expect(calcularVentana(AHORA, AHORA).abierta).toBe(false);
  });

  it('un segundo antes sigue abierta', () => {
    expect(calcularVentana(new Date(AHORA.getTime() + 1000), AHORA).abierta).toBe(true);
  });

  it('redondea los minutos HACIA ABAJO', () => {
    // «Queda 1 minuto» cuando quedan 20 segundos hace que el asesor se apure. «Quedan 2»
    // cuando queda uno le hace confiarse. El error tiene que caer del primer lado.
    const expira = new Date(AHORA.getTime() + 119_000); // 1 min 59 s
    expect(calcularVentana(expira, AHORA).minutosRestantes).toBe(1);
  });

  it('nunca escribió: no es lo mismo que vencida', () => {
    const v = calcularVentana(null, AHORA);
    expect(v.abierta).toBe(false);
    expect(v.expiraEn).toBeNull();
    // Nulo y no cero: con una ventana vencida se puede mandar plantilla; con un contacto que
    // nunca escribió, puede que ni eso.
    expect(v.minutosRestantes).toBeNull();
  });

  it('devuelve el instante en ISO con zona, como pide el contrato', () => {
    const v = calcularVentana(new Date('2026-10-12T05:30:00.000Z'), AHORA);
    expect(v.expiraEn).toBe('2026-10-12T05:30:00.000Z');
  });
});

describe('queSePuedeEnviar', () => {
  it('con la ventana abierta, texto libre', () => {
    expect(queSePuedeEnviar({ abierta: true, expiraEn: null, minutosRestantes: 10 })).toBe(
      'TEXTO_LIBRE',
    );
  });

  it('con la ventana cerrada, solo plantillas', () => {
    expect(queSePuedeEnviar({ abierta: false, expiraEn: null, minutosRestantes: -5 })).toBe(
      'SOLO_PLANTILLAS',
    );
  });

  it('un contacto que nunca escribió también cae en solo plantillas', () => {
    expect(queSePuedeEnviar({ abierta: false, expiraEn: null, minutosRestantes: null })).toBe(
      'SOLO_PLANTILLAS',
    );
  });
});
