import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Response } from 'express';
import { HttpStatus } from '@nestjs/common';
import { PrismaService } from './shared/prisma/prisma.service.js';
import { SaludController } from './salud.controller.js';
import type { EstadoDelTrabajador } from './shared/salud/latido-del-trabajador.js';

describe('SaludController', () => {
  let controller: SaludController;
  let mockPrisma: { $queryRaw: ReturnType<typeof vi.fn> };
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockPrisma = {
      $queryRaw: vi.fn(),
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
    };

    controller = new SaludController(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('latido del trabajador (T-194)', () => {
    const conLector = (estado: EstadoDelTrabajador): SaludController =>
      new SaludController(mockPrisma as unknown as PrismaService, {
        leer: () => Promise.resolve(estado),
      });

    beforeEach(() => {
      mockPrisma.$queryRaw.mockResolvedValue([{ usuario: 'viajapro_app', bypassa: false }]);
    });

    it('con latido fresco informa ok', async () => {
      const r = await conLector({ estado: 'ok', edadSegundos: 4 }).listo(mockRes as Response);
      expect(r).toMatchObject({ estado: 'ok', trabajador: { estado: 'ok', edadSegundos: 4 } });
    });

    it.each([
      { estado: 'viejo', edadSegundos: 120 },
      { estado: 'sin_latido' },
      { estado: 'sin_verificar' },
    ] as EstadoDelTrabajador[])(
      'con trabajador %o queda degradado pero sigue en 200',
      async (e) => {
        const r = await conLector(e).listo(mockRes as Response);
        expect(r).toMatchObject({ estado: 'degradado', trabajador: e });
        expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      },
    );
  });

  describe('GET /salud/listo', () => {
    it('debe responder 200 cuando la BD responde y el rol NO puede saltarse RLS', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ usuario: 'viajapro_app', bypassa: false }]);

      const resultado = await controller.listo(mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(resultado).toEqual({
        estado: 'ok',
        baseDeDatos: 'ok',
        rol: 'viajapro_app',
        aislamiento: 'forzado',
      });
    });

    it('debe responder 503 y estado degradado cuando el rol SÍ puede saltarse RLS', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ usuario: 'postgres', bypassa: true }]);

      const resultado = await controller.listo(mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(resultado).toEqual({
        estado: 'degradado',
        baseDeDatos: 'ok',
        rol: 'postgres',
        aislamiento: 'EL ROL PUEDE SALTARSE RLS',
      });
    });

    it('debe responder 503 y baseDeDatos caida cuando la BD lanza error, sin filtrar secretos', async () => {
      const errorConSecreto = new Error(
        'ECONNREFUSED: connection refused to postgres://user:secret@host:5432/db',
      );
      mockPrisma.$queryRaw.mockRejectedValue(errorConSecreto);

      const resultado = await controller.listo(mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(resultado.estado).toBe('degradado');
      expect(resultado.baseDeDatos).toBe('caida');
      expect(resultado.aislamiento).toBe('sin verificar');
      // Verificar que no se filtran secretos en la respuesta serializada
      const respuestaSerializada = JSON.stringify(resultado);
      expect(respuestaSerializada).not.toContain('secreto');
      expect(respuestaSerializada).not.toContain('ECONNREFUSED');
      expect(respuestaSerializada).not.toContain('postgres://');
      expect(respuestaSerializada).not.toContain('user:secret');
    });
  });
});
