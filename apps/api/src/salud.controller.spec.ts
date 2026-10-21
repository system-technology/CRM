import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { SaludController } from './salud.controller.js';
import type { PrismaService } from './shared/prisma/prisma.service.js';

/** Un `Response` mínimo que solo recuerda el código que se le puso. */
function respuesta() {
  const res = { codigo: 200, status: vi.fn() };
  res.status.mockImplementation((c: number) => {
    res.codigo = c;
    return res;
  });
  return res;
}

function controlador(consulta: () => Promise<unknown>) {
  const prisma = { $queryRaw: vi.fn(consulta) } as unknown as PrismaService;
  return new SaludController(prisma);
}

const ok = [{ usuario: 'viajapro_app', bypassa: false }];
const bypass = [{ usuario: 'postgres', bypassa: true }];

describe('GET /salud/listo', () => {
  it('200 cuando la base responde y el rol no puede saltarse RLS', async () => {
    const res = respuesta();
    const cuerpo = await controlador(() => Promise.resolve(ok)).listo(res as unknown as Response);
    expect(res.codigo).toBe(200);
    expect(cuerpo.estado).toBe('ok');
  });

  it('503 y detalle en el cuerpo cuando el rol puede saltarse RLS', async () => {
    const res = respuesta();
    const cuerpo = await controlador(() => Promise.resolve(bypass)).listo(
      res as unknown as Response,
    );
    expect(res.codigo).toBe(503);
    expect(cuerpo.estado).toBe('degradado');
    expect(cuerpo.aislamiento).toBe('EL ROL PUEDE SALTARSE RLS');
  });

  it('503 cuando la base no responde, sin filtrar la causa', async () => {
    const res = respuesta();
    const cuerpo = await controlador(() =>
      Promise.reject(new Error('connect ECONNREFUSED postgres://usuario:secreto@host/db')),
    ).listo(res as unknown as Response);
    expect(res.codigo).toBe(503);
    expect(cuerpo.baseDeDatos).toBe('caida');
    expect(JSON.stringify(cuerpo)).not.toMatch(/secreto|ECONNREFUSED|postgres:/);
  });
});
