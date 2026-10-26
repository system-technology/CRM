/**
 * AUD-017 (parcial): la cola no puede crecer sin tope en Redis.
 *
 * Los fallidos se guardan 7 días para poder inspeccionarlos, pero sin un tope de CANTIDAD una
 * avería que falle todo (Meta reintenta) llena Redis mucho antes de los 7 días.
 */
import { describe, expect, it } from 'vitest';
import { OPCIONES_DE_TRABAJO } from './cola-de-changes.bullmq.js';

describe('opciones de la cola inbox-changes', () => {
  it('los fallidos tienen tope de antigüedad Y de cantidad', () => {
    const { age, count } = OPCIONES_DE_TRABAJO.removeOnFail;
    expect(age).toBe(7 * 24 * 3_600);
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(5_000);
  });

  it('los completados también tienen tope de cantidad', () => {
    expect(OPCIONES_DE_TRABAJO.removeOnComplete.count).toBeGreaterThan(0);
  });
});
