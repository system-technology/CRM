import { describe, expect, it } from 'vitest';
import { claveDeEnvioDeCotizacion } from './clave-de-envio-de-cotizacion.js';

const base = { tenantId: 't1', conversacionId: 'c1', cotizacionId: 'q1', version: 1 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('claveDeEnvioDeCotizacion', () => {
  it('es un UUID válido y determinista', () => {
    expect(claveDeEnvioDeCotizacion(base)).toMatch(UUID);
    expect(claveDeEnvioDeCotizacion(base)).toBe(claveDeEnvioDeCotizacion({ ...base }));
  });

  it('cambia con la conversación, la cotización, la versión y el tenant', () => {
    const claves = new Set([
      claveDeEnvioDeCotizacion(base),
      claveDeEnvioDeCotizacion({ ...base, conversacionId: 'c2' }),
      claveDeEnvioDeCotizacion({ ...base, cotizacionId: 'q2' }),
      claveDeEnvioDeCotizacion({ ...base, version: 2 }),
      claveDeEnvioDeCotizacion({ ...base, tenantId: 't2' }),
    ]);
    expect(claves.size).toBe(5);
  });
});
