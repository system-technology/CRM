import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Response } from 'express';
import { HttpStatus } from '@nestjs/common';
import { PrismaService } from './shared/prisma/prisma.service.js';
import { SaludController } from './salud.controller.js';

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
