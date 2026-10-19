import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ProcesarChange } from '../application/procesar-change.js';
import { idDeTrabajo } from '../infrastructure/cola-de-changes.bullmq.js';
import {
  ConsumidorDeChanges,
  ErrorDeTrabajo,
  leerTrabajo,
  sanearError,
} from './consumidor-de-changes.js';

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

describe('R10: ningún error del trabajador lleva PII a Redis ni al registro', () => {
  const PII = 'Failing row contains (573001112233, ¿Cuánto cuesta San Andrés?)';
  const errorConPii = Object.assign(new Error(PII), { code: '23514' });

  function consumidor(error: Error): ConsumidorDeChanges {
    const procesar = {
      ejecutar: () => Promise.reject(error),
    } as unknown as ProcesarChange;
    return new ConsumidorDeChanges(procesar);
  }

  it('el motivo con el que falla el trabajo (failedReason) no contiene el mensaje original', async () => {
    const motivo = await consumidor(errorConPii)
      .atender({ recepcionId: HEX, indice: 0 })
      .then(
        () => '',
        (e: Error) => `${e.name} ${e.message} ${e.stack ?? ''}`,
      );
    expect(motivo).toContain('23514');
    expect(motivo).not.toContain('573001112233');
    expect(motivo).not.toContain('San Andrés');
  });

  it('el registro tampoco: ni lo que sube saneado ni un error crudo con PII', () => {
    const escrito: string[] = [];
    const espia = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((m: unknown) => void escrito.push(String(m)));
    const c = consumidor(errorConPii);
    c.registrarFallo('job-1', 2, errorConPii);
    c.registrarFallo('job-1', 3, new ErrorDeTrabajo('Error'));
    espia.mockRestore();
    expect(escrito.join('\n')).toContain('job-1');
    expect(escrito.join('\n')).not.toMatch(/573001112233|San Andrés|Failing row/);
  });

  it('sin código se queda con la clase', () => {
    expect(sanearError(new TypeError(PII)).codigo).toBe('TypeError');
  });
});
