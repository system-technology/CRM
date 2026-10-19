import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { verificarSuscripcion } from './verificacion-suscripcion.js';

// Aleatorio por corrida: un literal aquí acabó siendo el token real del entorno (2026-10-19).
const TOKEN = randomBytes(16).toString('hex');
const base = {
  'hub.mode': 'subscribe',
  'hub.verify_token': TOKEN,
  'hub.challenge': '1158201444',
};

describe('verificarSuscripcion', () => {
  it('devuelve el challenge tal cual cuando todo coincide', () => {
    expect(verificarSuscripcion(base, TOKEN)).toEqual({ ok: true, challenge: '1158201444' });
  });

  /**
   * Meta dice que el challenge es un entero, pero llega como texto en la cadena de consulta y
   * hay que devolverlo **exactamente igual**. Convertirlo a número y volver a texto perdería un
   * cero a la izquierda, y la suscripción fallaría sin decir por qué.
   */
  it('no transforma el challenge', () => {
    const r = verificarSuscripcion({ ...base, 'hub.challenge': '007' }, TOKEN);
    expect(r).toEqual({ ok: true, challenge: '007' });
  });

  it('RECHAZA un token que no coincide', () => {
    expect(verificarSuscripcion({ ...base, 'hub.verify_token': 'otro' }, TOKEN)).toEqual({
      ok: false,
      motivo: 'TOKEN_NO_COINCIDE',
    });
  });

  it('RECHAZA un token que solo coincide en el prefijo', () => {
    expect(
      verificarSuscripcion({ ...base, 'hub.verify_token': TOKEN.slice(0, 10) }, TOKEN),
    ).toEqual({ ok: false, motivo: 'TOKEN_NO_COINCIDE' });
  });

  it('RECHAZA un token con el correcto dentro pero más largo', () => {
    expect(verificarSuscripcion({ ...base, 'hub.verify_token': TOKEN + 'x' }, TOKEN)).toEqual({
      ok: false,
      motivo: 'TOKEN_NO_COINCIDE',
    });
  });

  it('RECHAZA un modo distinto de subscribe', () => {
    expect(verificarSuscripcion({ ...base, 'hub.mode': 'unsubscribe' }, TOKEN)).toEqual({
      ok: false,
      motivo: 'MODO_INVALIDO',
    });
  });

  it.each([['hub.mode'], ['hub.verify_token'], ['hub.challenge']])(
    'RECHAZA si falta %s',
    (clave) => {
      const p: Record<string, string | undefined> = { ...base };
      delete p[clave];
      expect(verificarSuscripcion(p, TOKEN)).toEqual({ ok: false, motivo: 'FALTAN_PARAMETROS' });
    },
  );

  /**
   * Sin token configurado, devolver el challenge dejaría que cualquiera suscribiera su propio
   * webhook al nuestro. Rechazar es la única respuesta: una variable de entorno olvidada no
   * puede convertirse en una puerta abierta.
   */
  it('RECHAZA si no hay token configurado, en vez de dar por buena la verificación', () => {
    expect(verificarSuscripcion(base, undefined)).toEqual({ ok: false, motivo: 'SIN_TOKEN' });
    expect(verificarSuscripcion(base, '')).toEqual({ ok: false, motivo: 'SIN_TOKEN' });
  });

  it('comprueba el token antes que el modo: lo primero es quién llama', () => {
    const r = verificarSuscripcion(
      { ...base, 'hub.mode': 'unsubscribe', 'hub.verify_token': 'otro' },
      TOKEN,
    );
    // El modo se mira primero porque es más barato, pero un token malo nunca debe
    // distinguirse de un modo malo desde fuera: los dos devuelven 403 sin cuerpo.
    expect(r.ok).toBe(false);
  });
});
