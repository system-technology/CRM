import { describe, expect, it } from 'vitest';
import { idDeTrabajo } from '../infrastructure/cola-de-changes.bullmq.js';
import { leerTrabajo } from './consumidor-de-changes.js';

const HEX = 'ab'.repeat(32);

describe('trabajos de inbox-changes', () => {
  it('el jobId no contiene ":" (BullMQ lo rechaza) y distingue el índice', () => {
    const id = Buffer.from(HEX, 'hex');
    expect(idDeTrabajo(id, 0)).not.toContain(':');
    expect(idDeTrabajo(id, 0)).not.toBe(idDeTrabajo(id, 1));
    expect(idDeTrabajo(id, 2)).toBe(`${HEX}-2`);
  });

  it('lee un trabajo válido', () => {
    const t = leerTrabajo({ recepcionId: HEX, indice: 3 });
    expect(t.indice).toBe(3);
    expect(t.recepcionId.length).toBe(32);
  });

  it.each([
    null,
    {},
    { recepcionId: 'xx', indice: 0 },
    { recepcionId: HEX, indice: -1 },
    { recepcionId: HEX, indice: 1.5 },
    { recepcionId: HEX },
  ])('rechaza un trabajo malformado: %j', (datos) => {
    expect(() => leerTrabajo(datos)).toThrow(/malformado/);
  });
});
