/**
 * El pegamento del consumidor de `inbox-envios`: lo que viene de Redis se valida, el último
 * intento se calcula bien y lo que sube a BullMQ va saneado.
 */
import { describe, expect, it } from 'vitest';
import { LimiteDeTasaError } from '../domain/errores-de-envio.js';
import { idDeEnvio } from '../infrastructure/cola-de-envios.bullmq.js';
import { esUltimoIntento, leerTrabajoDeEnvio, sanearErrorDeEnvio } from './consumidor-de-envios.js';

const TENANT = '01932000-0000-7000-8000-00000000000a';
const MENSAJE = '01932000-0000-7000-8000-0000000000aa';

describe('ConsumidorDeEnvios', () => {
  it('acepta solo { tenantId, mensajeId } con UUID', () => {
    expect(leerTrabajoDeEnvio({ tenantId: TENANT, mensajeId: MENSAJE })).toEqual({
      tenantId: TENANT,
      mensajeId: MENSAJE,
    });
    expect(() => leerTrabajoDeEnvio({ tenantId: TENANT })).toThrow();
    expect(() => leerTrabajoDeEnvio({ tenantId: 'x', mensajeId: MENSAJE })).toThrow();
    expect(() => leerTrabajoDeEnvio(null)).toThrow();
  });

  it('el jobId sale del id del mensaje, sin «:» (BullMQ lo reserva)', () => {
    expect(idDeEnvio(MENSAJE)).toBe(`envio-${MENSAJE}`);
    expect(idDeEnvio(MENSAJE)).not.toContain(':');
  });

  it('el último intento es el sexto', () => {
    expect(esUltimoIntento(0, 6)).toBe(false);
    expect(esUltimoIntento(4, 6)).toBe(false);
    expect(esUltimoIntento(5, 6)).toBe(true);
    expect(esUltimoIntento(0, 1)).toBe(true);
  });

  it('lo que sube a BullMQ conserva el código estable y nada más', () => {
    expect(sanearErrorDeEnvio(new LimiteDeTasaError(130429)).codigo).toBe(
      'WHATSAPP_LIMITE_DE_TASA',
    );
    const crudo = new Error('Failing row contains (+573001234567, hola)');
    expect(sanearErrorDeEnvio(crudo).message).not.toContain('+57');
  });
});
