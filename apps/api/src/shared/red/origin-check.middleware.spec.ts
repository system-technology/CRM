/**
 * Tests unitarios del middleware de comprobación de Origin.
 *
 * Cubre los tres casos de aceptación:
 * 1. Origen permitido → pasa
 * 2. Origen ajeno → 403
 * 3. Ausencia de Origin (petición server-to-server) → pasa
 */

import { ProhibidoError } from '@viajapro/domain';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { OriginCheckMiddleware, OrigenNoConfiableError } from './origin-check.middleware.js';

const WEB_ORIGIN = 'http://localhost:3000';

function peticion(metodo: string, ruta: string, cabeceras: Record<string, string> = {}): Request {
  return {
    method: metodo,
    originalUrl: ruta,
    url: ruta,
    headers: cabeceras,
  } as unknown as Request;
}

function respuesta(): Response {
  return {
    status: () => res,
    json: () => res,
  } as unknown as Response;
}

let res: Response;
let next: NextFunction;
let middleware: OriginCheckMiddleware;

function setup() {
  res = respuesta();
  let llamado = false;
  next = ((): void => {
    llamado = true;
  }) as NextFunction;
  middleware = new OriginCheckMiddleware();
  return { llamado: () => llamado };
}

describe('OriginCheckMiddleware', () => {
  describe('métodos seguros (GET, HEAD, OPTIONS)', () => {
    it.each(['GET', 'HEAD', 'OPTIONS'])('%s siempre pasa sin comprobar Origin', (metodo) => {
      const { llamado } = setup();
      middleware.use(
        peticion(metodo, '/api/v1/cotizaciones', { origin: 'https://evil.example' }),
        res,
        next,
      );
      expect(llamado()).toBe(true);
    });
  });

  describe('rutas excluidas', () => {
    it.each(['/salud', '/salud/listo', '/webhooks/whatsapp', '/webhooks/otro'])(
      '%s POST se salta la comprobación',
      (ruta) => {
        const { llamado } = setup();
        middleware.use(peticion('POST', ruta, { origin: 'https://evil.example' }), res, next);
        expect(llamado()).toBe(true);
      },
    );
  });

  describe('mutaciones con Origin', () => {
    it('origen permitido → pasa', () => {
      const { llamado } = setup();
      middleware.use(peticion('POST', '/api/v1/cotizaciones', { origin: WEB_ORIGIN }), res, next);
      expect(llamado()).toBe(true);
    });

    it('origen permitido con barra final → pasa', () => {
      const { llamado } = setup();
      middleware.use(
        peticion('POST', '/api/v1/cotizaciones', { origin: `${WEB_ORIGIN}/` }),
        res,
        next,
      );
      expect(llamado()).toBe(true);
    });

    it('origen ajeno → lanza ProhibidoError con código ORIGEN_NO_CONFIABLE', () => {
      const { llamado } = setup();
      expect(() =>
        middleware.use(
          peticion('POST', '/api/v1/cotizaciones', { origin: 'https://sitio-malicioso.example' }),
          res,
          next,
        ),
      ).toThrow(OrigenNoConfiableError);

      try {
        middleware.use(
          peticion('POST', '/api/v1/cotizaciones', { origin: 'https://sitio-malicioso.example' }),
          res,
          next,
        );
      } catch (e) {
        expect(e).toBeInstanceOf(ProhibidoError);
        expect((e as ProhibidoError).code).toBe('ORIGEN_NO_CONFIABLE');
      }
      expect(llamado()).toBe(false);
    });

    it('origen ajeno en PUT → 403', () => {
      const { llamado } = setup();
      expect(() =>
        middleware.use(
          peticion('PUT', '/api/v1/cotizaciones/123', { origin: 'https://evil.example' }),
          res,
          next,
        ),
      ).toThrow(OrigenNoConfiableError);
      expect(llamado()).toBe(false);
    });

    it('origen ajeno en PATCH → 403', () => {
      const { llamado } = setup();
      expect(() =>
        middleware.use(
          peticion('PATCH', '/api/v1/cotizaciones/123', { origin: 'https://evil.example' }),
          res,
          next,
        ),
      ).toThrow(OrigenNoConfiableError);
      expect(llamado()).toBe(false);
    });

    it('origen ajeno en DELETE → 403', () => {
      const { llamado } = setup();
      expect(() =>
        middleware.use(
          peticion('DELETE', '/api/v1/cotizaciones/123', { origin: 'https://evil.example' }),
          res,
          next,
        ),
      ).toThrow(OrigenNoConfiableError);
      expect(llamado()).toBe(false);
    });

    it('origin: "null" (string) → 403', () => {
      const { llamado } = setup();
      expect(() =>
        middleware.use(peticion('POST', '/api/v1/cotizaciones', { origin: 'null' }), res, next),
      ).toThrow(OrigenNoConfiableError);
      expect(llamado()).toBe(false);
    });

    it('origin: cadena vacía → 403', () => {
      const { llamado } = setup();
      expect(() =>
        middleware.use(peticion('POST', '/api/v1/cotizaciones', { origin: '' }), res, next),
      ).toThrow(OrigenNoConfiableError);
      expect(llamado()).toBe(false);
    });
  });

  describe('mutaciones SIN Origin (server-to-server)', () => {
    it('sin cabecera Origin → pasa', () => {
      const { llamado } = setup();
      middleware.use(peticion('POST', '/api/v1/cotizaciones', {}), res, next);
      expect(llamado()).toBe(true);
    });

    it('Origin: undefined (no enviado) → pasa', () => {
      const { llamado } = setup();
      const req = peticion('POST', '/api/v1/cotizaciones', {});
      // Simular que no viene la cabecera
      delete (req.headers as Record<string, string>).origin;
      middleware.use(req, res, next);
      expect(llamado()).toBe(true);
    });
  });
});
