import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import type { PuertoZonaHoraria } from '../domain/puertos.js';
import { AjustesDeAgenciaUseCase } from './ajustes-de-agencia.use-case.js';
import { AgenciaNoEncontradaError, ZonaHorariaInvalidaError } from './errores.js';

const TENANT = '01932000-0000-7000-8000-000000000001';

const FILA = { nombre: 'A', paisIso: 'CO', monedaIso: 'COP', zonaHoraria: 'America/Bogota' };

function conFila(fila: unknown, perfil: unknown = null) {
  const findUnique = vi.fn().mockResolvedValue(fila);
  const perfilFind = vi.fn().mockResolvedValue(perfil);
  const upsert = vi.fn().mockResolvedValue({});
  const prisma = {
    conTenant: (fn: (tx: unknown) => unknown) =>
      fn({ tenant: { findUnique }, perfilDeAgencia: { findUnique: perfilFind, upsert } }),
  } as unknown as PrismaService;
  const actualizar = vi.fn().mockResolvedValue('America/Lima');
  const zona = { actualizar } as unknown as PuertoZonaHoraria;
  return {
    uc: new AjustesDeAgenciaUseCase(prisma, zona),
    findUnique,
    perfilFind,
    upsert,
    actualizar,
  };
}

const correr = <T>(fn: () => Promise<T>) =>
  ContextoTenant.ejecutarCon(
    { tenantId: TENANT, usuarioId: 'u', permisos: new Set() } as never,
    fn,
  );

describe('AjustesDeAgenciaUseCase', () => {
  it('lee la fila del tenant de la sesión con predicado explícito; sin perfil, RNT nulo y sin verificar', async () => {
    const { uc, findUnique, perfilFind } = conFila(FILA);
    await expect(correr(() => uc.obtener())).resolves.toEqual({
      ...FILA,
      rnt: null,
      rntVerificado: false,
    });
    expect(findUnique.mock.calls[0]?.[0]).toMatchObject({ where: { id: TENANT } });
    expect(perfilFind.mock.calls[0]?.[0]).toMatchObject({ where: { tenantId: TENANT } });
  });

  it('error de dominio tipado si la agencia no existe', async () => {
    const { uc } = conFila(null);
    await expect(correr(() => uc.obtener())).rejects.toBeInstanceOf(AgenciaNoEncontradaError);
  });

  it('el RNT sale verificado solo si el perfil trae verificado_en', async () => {
    const verificado = conFila(FILA, { rnt: '48213', verificadoEn: new Date() });
    await expect(correr(() => verificado.uc.obtener())).resolves.toMatchObject({
      rnt: '48213',
      rntVerificado: true,
    });
    const sinVerificar = conFila(FILA, { rnt: '48213', verificadoEn: null });
    await expect(correr(() => sinVerificar.uc.obtener())).resolves.toMatchObject({
      rnt: '48213',
      rntVerificado: false,
    });
  });

  it('actualizar la zona la delega al puerto, no toca el perfil y devuelve los ajustes releídos', async () => {
    const fila = { ...FILA, paisIso: 'PE', monedaIso: 'PEN', zonaHoraria: 'America/Lima' };
    const { uc, actualizar, upsert } = conFila(fila);
    await expect(correr(() => uc.actualizar({ zonaHoraria: 'America/Lima' }))).resolves.toEqual({
      ...fila,
      rnt: null,
      rntVerificado: false,
    });
    expect(actualizar).toHaveBeenCalledWith('America/Lima');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('actualizar el RNT hace upsert del perfil de la agencia de la sesión y no llama al puerto de la zona', async () => {
    const { uc, actualizar, upsert } = conFila(FILA, { rnt: '48213', verificadoEn: null });
    await expect(correr(() => uc.actualizar({ rnt: '48213' }))).resolves.toMatchObject({
      rnt: '48213',
      rntVerificado: false,
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId: TENANT },
      create: { tenantId: TENANT, rnt: '48213' },
      update: { rnt: '48213' },
    });
    expect(actualizar).not.toHaveBeenCalled();
  });

  it('rnt: null borra el RNT', async () => {
    const { uc, upsert } = conFila(FILA);
    await correr(() => uc.actualizar({ rnt: null }));
    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId: TENANT },
      create: { tenantId: TENANT, rnt: null },
      update: { rnt: null },
    });
  });

  it('nunca escribe la verificación: ni verificadoEn ni nada fuera del RNT', async () => {
    const { uc, upsert } = conFila(FILA);
    await correr(() => uc.actualizar({ rnt: '48213' }));
    const args = upsert.mock.calls[0]?.[0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(Object.keys(args.create).sort()).toEqual(['rnt', 'tenantId']);
    expect(Object.keys(args.update)).toEqual(['rnt']);
  });

  it('con zona y RNT juntos, la zona va primero', async () => {
    const { uc, actualizar, upsert } = conFila(FILA);
    const orden: string[] = [];
    actualizar.mockImplementation(() => {
      orden.push('zona');
      return Promise.resolve('America/Lima');
    });
    upsert.mockImplementation(() => {
      orden.push('rnt');
      return Promise.resolve({});
    });
    await correr(() => uc.actualizar({ zonaHoraria: 'America/Lima', rnt: '48213' }));
    expect(orden).toEqual(['zona', 'rnt']);
  });

  it('si el puerto rechaza la zona, el error sube, el RNT no se guarda y no se relee', async () => {
    const { uc, actualizar, findUnique, upsert } = conFila(null);
    actualizar.mockRejectedValue(new ZonaHorariaInvalidaError());
    await expect(
      correr(() => uc.actualizar({ zonaHoraria: 'x', rnt: '48213' })),
    ).rejects.toBeInstanceOf(ZonaHorariaInvalidaError);
    expect(upsert).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
