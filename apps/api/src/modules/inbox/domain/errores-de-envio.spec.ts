/**
 * La traducción de los códigos de Meta (§9 de la integración) a errores de dominio. Lo que se
 * comprueba es la DECISIÓN: reintentar o no, y qué ve el asesor.
 */
import { DomainError } from '@viajapro/domain';
import { describe, expect, it } from 'vitest';
import {
  CredencialInvalidaError,
  CuentaRestringidaError,
  DestinatarioNoDisponibleError,
  EnvioRechazadoError,
  ErrorDeEnvioWhatsapp,
  FalloTransitorioDeMetaError,
  FueraDeVentanaError,
  LimiteDeTasaError,
  errorDeMeta,
} from './errores-de-envio.js';

describe('errorDeMeta', () => {
  it('131047: ventana cerrada, definitivo, y le dice al asesor que use una plantilla', () => {
    const e = errorDeMeta(131047, 400);
    expect(e).toBeInstanceOf(FueraDeVentanaError);
    expect(e.reintentable).toBe(false);
    expect(e.codigoMeta).toBe(131047);
    expect(e.message).toMatch(/plantilla/);
  });

  it('131026: destinatario no disponible, definitivo', () => {
    const e = errorDeMeta(131026, 400);
    expect(e).toBeInstanceOf(DestinatarioNoDisponibleError);
    expect(e.reintentable).toBe(false);
  });

  it.each([130429, 131056, 80007, 4])('%i: límite de tasa, se reintenta', (codigo) => {
    const e = errorDeMeta(codigo, 429);
    expect(e).toBeInstanceOf(LimiteDeTasaError);
    expect(e.reintentable).toBe(true);
  });

  it.each([190, 0, 3, 10, 131005])('%i: credencial inválida, NUNCA se reintenta', (codigo) => {
    const e = errorDeMeta(codigo, 401);
    expect(e).toBeInstanceOf(CredencialInvalidaError);
    expect(e.reintentable).toBe(false);
    expect(e.message).toMatch(/reconecte/);
  });

  it.each([131031, 368, 131042])('%i: política o pago, intervención humana', (codigo) => {
    expect(errorDeMeta(codigo, 403)).toBeInstanceOf(CuentaRestringidaError);
  });

  it.each([2, 131000, 131016, 133004, 131057])('%i: transitorio, se reintenta', (codigo) => {
    const e = errorDeMeta(codigo, 500);
    expect(e).toBeInstanceOf(FalloTransitorioDeMetaError);
    expect(e.reintentable).toBe(true);
  });

  it('el código 1 depende del HTTP: 5xx transitorio, 4xx definitivo', () => {
    expect(errorDeMeta(1, 500).reintentable).toBe(true);
    expect(errorDeMeta(1, 400)).toBeInstanceOf(EnvioRechazadoError);
  });

  it('sin código legible (la página de un proxy), decide el estado HTTP', () => {
    expect(errorDeMeta(null, 502)).toBeInstanceOf(FalloTransitorioDeMetaError);
    expect(errorDeMeta(null, 429)).toBeInstanceOf(LimiteDeTasaError);
    expect(errorDeMeta(null, 401)).toBeInstanceOf(CredencialInvalidaError);
    expect(errorDeMeta(null, 400)).toBeInstanceOf(EnvioRechazadoError);
  });

  it('todos son errores de dominio tipados, con código estable y mensaje en español', () => {
    for (const codigo of [131047, 131026, 130429, 190, 368, 131000, 999999]) {
      const e = errorDeMeta(codigo, 400);
      expect(e).toBeInstanceOf(DomainError);
      expect(e).toBeInstanceOf(ErrorDeEnvioWhatsapp);
      expect(e.code).toMatch(/^WHATSAPP_[A-Z_]+$/);
      expect(e.message.length).toBeLessThanOrEqual(500);
    }
  });
});
