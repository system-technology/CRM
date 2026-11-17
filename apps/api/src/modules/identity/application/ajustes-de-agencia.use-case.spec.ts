import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import type { PuertoZonaHoraria } from '../domain/puertos.js';
import { AjustesDeAgenciaUseCase } from './ajustes-de-agencia.use-case.js';
import { AgenciaNoEncontradaError, ZonaHorariaInvalidaError } from './errores.js';

const TENANT = '01932000-0000-7000-8000-000000000001';

function conFila(fila: unknown) {
  const findUnique = vi.fn().mockResolvedValue(fila);
  const prisma = {
    conTenant: (fn: (tx: unknown) => unknown) => fn({ tenant: { findUnique } }),
  } as unknown as PrismaService;
  const actualizar = vi.fn().mockResolvedValue('America/Lima');
  const zona = { actualizar } as unknown as PuertoZonaHoraria;
  return { uc: new AjustesDeAgenciaUseCase(prisma, zona), findUnique, actualizar };
}

const correr = <T>(fn: () => Promise<T>) =>
  ContextoTenant.ejecutarCon(
    { tenantId: TENANT, usuarioId: 'u', permisos: new Set() } as never,
    fn,
  );

describe('AjustesDeAgenciaUseCase', () => {
  it('lee la fila del tenant de la sesión con predicado explícito', async () => {
    const fila = { nombre: 'A', paisIso: 'CO', monedaIso: 'COP', zonaHoraria: 'America/Bogota' };
    const { uc, findUnique } = conFila(fila);
    await expect(correr(() => uc.obtener())).resolves.toEqual(fila);
    expect(findUnique.mock.calls[0]?.[0]).toMatchObject({ where: { id: TENANT } });
  });

  it('error de dominio tipado si la agencia no existe', async () => {
    const { uc } = conFila(null);
    await expect(correr(() => uc.obtener())).rejects.toBeInstanceOf(AgenciaNoEncontradaError);
  });

  it('actualizar delega la zona al puerto y devuelve los ajustes releídos', async () => {
    const fila = { nombre: 'A', paisIso: 'PE', monedaIso: 'PEN', zonaHoraria: 'America/Lima' };
    const { uc, actualizar } = conFila(fila);
    await expect(correr(() => uc.actualizarZonaHoraria('America/Lima'))).resolves.toEqual(fila);
    expect(actualizar).toHaveBeenCalledWith('America/Lima');
  });

  it('si el puerto rechaza la zona, el error sube y no se relee', async () => {
    const { uc, actualizar, findUnique } = conFila(null);
    actualizar.mockRejectedValue(new ZonaHorariaInvalidaError());
    await expect(correr(() => uc.actualizarZonaHoraria('x'))).rejects.toBeInstanceOf(
      ZonaHorariaInvalidaError,
    );
    expect(findUnique).not.toHaveBeenCalled();
  });
});
