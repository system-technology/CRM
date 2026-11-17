import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';
import type { VigilarPlazosUseCase } from '../application/vigilar-plazos.use-case.js';
import {
  intervaloDeVigilancia,
  PlanificadorDePlazos,
  vigilanciaActiva,
} from './planificador-de-plazos.js';

describe('configuración de la vigilancia de plazos', () => {
  it('el intervalo por defecto es de 60 min', () => {
    expect(intervaloDeVigilancia({})).toBe(3_600_000);
    expect(intervaloDeVigilancia({ PLAZOS_INTERVALO_MS: '' })).toBe(3_600_000);
  });

  it('acepta un entero ≥ 1000 y rechaza lo demás (no arranca)', () => {
    expect(intervaloDeVigilancia({ PLAZOS_INTERVALO_MS: '5000' })).toBe(5000);
    for (const malo of ['999', 'abc', '1.5', '-1']) {
      expect(() => intervaloDeVigilancia({ PLAZOS_INTERVALO_MS: malo })).toThrow(
        /PLAZOS_INTERVALO_MS/,
      );
    }
  });

  it('activa por defecto; solo «inerte» la apaga; otro valor no arranca', () => {
    expect(vigilanciaActiva({})).toBe(true);
    expect(vigilanciaActiva({ PLAZOS_VIGILANCIA: 'inerte' })).toBe(false);
    expect(() => vigilanciaActiva({ PLAZOS_VIGILANCIA: 'no' })).toThrow(/PLAZOS_VIGILANCIA/);
  });
});

describe('PlanificadorDePlazos.pasada', () => {
  it('nunca lanza si el caso de uso falla', async () => {
    const ejecutar = vi.fn().mockRejectedValue(new Error('base caída'));
    const p = new PlanificadorDePlazos({ ejecutar } as unknown as VigilarPlazosUseCase);
    await expect(p.pasada()).resolves.toBeUndefined();
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });

  it('no apila una pasada sobre otra', async () => {
    let soltar: () => void = () => undefined;
    const ejecutar = vi.fn(
      () =>
        new Promise<void>((resolver) => {
          soltar = resolver;
        }),
    );
    const p = new PlanificadorDePlazos({ ejecutar } as unknown as VigilarPlazosUseCase);
    const a = p.pasada();
    const b = p.pasada();
    soltar();
    await Promise.all([a, b]);
    expect(ejecutar).toHaveBeenCalledTimes(1);
  });
});
