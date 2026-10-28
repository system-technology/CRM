import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogoController } from './catalogo.controller.js';
import { SalidasController } from './salidas.controller.js';

describe('T-091: ids que no son UUID dan 400', () => {
  it('/catalogo/salidas rechaza un paqueteId que no es UUID', async () => {
    const listar = { ejecutar: vi.fn() };
    // @ts-expect-error casos de uso simulados
    const c = new SalidasController(listar, { ejecutar: vi.fn() });
    await expect(c.salidas('2026-11-01', undefined, 'no-es-uuid')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(listar.ejecutar).not.toHaveBeenCalled();
  });

  it('/catalogo/salidas acepta un UUID', async () => {
    const listar = { ejecutar: vi.fn().mockResolvedValue([]) };
    // @ts-expect-error casos de uso simulados
    const c = new SalidasController(listar, { ejecutar: vi.fn() });
    await c.salidas('2026-11-01', undefined, '3f2c1a9e-1111-4222-8333-444455556666');
    expect(listar.ejecutar).toHaveBeenCalledOnce();
  });

  it('GET /paquetes/:id lleva ParseUUIDPipe', () => {
    const meta = Reflect.getMetadata('__routeArguments__', CatalogoController, 'detalle') as Record<
      string,
      { pipes: unknown[] }
    >;
    const pipes = Object.values(meta).flatMap((a) => a.pipes);
    expect(
      pipes.some(
        (p) => (p as { constructor: { name: string } }).constructor.name === 'ParseUUIDPipe',
      ),
    ).toBe(true);
  });
});
