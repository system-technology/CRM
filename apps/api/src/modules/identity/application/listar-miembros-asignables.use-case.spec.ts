import 'reflect-metadata';

import type { MiembroAsignable, Permiso } from '@viajapro/contracts';
import { describe, expect, it, vi } from 'vitest';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import type { PuertoMiembros } from '../domain/puertos-de-miembros.js';
import { MiembrosController } from '../interface/miembros.controller.js';
import { ListarMiembrosAsignablesUseCase } from './listar-miembros-asignables.use-case.js';

const ANA: MiembroAsignable = { id: '01932000-0000-7000-8000-0000000000b1', nombre: 'Ana' };

const con = <T>(permisos: Permiso[], f: () => Promise<T>): Promise<T> =>
  ContextoTenant.ejecutarCon(
    { tenantId: 't', usuarioId: 'u', identidadId: null, permisos: new Set(permisos), trazaId: 'x' },
    f,
  );

describe('ListarMiembrosAsignablesUseCase', () => {
  it('con bandeja.operar devuelve la lista del puerto', async () => {
    const puerto = { listarAsignables: vi.fn(() => Promise.resolve([ANA])) };
    const r = await con(['bandeja.operar'], () =>
      new ListarMiembrosAsignablesUseCase(puerto as unknown as PuertoMiembros).ejecutar(),
    );
    expect(r).toEqual([ANA]);
  });

  it('sin el permiso responde PERMISO_DENEGADO y no consulta', async () => {
    const puerto = { listarAsignables: vi.fn(() => Promise.resolve([ANA])) };
    await expect(
      con(['usuarios.administrar'], () =>
        new ListarMiembrosAsignablesUseCase(puerto as unknown as PuertoMiembros).ejecutar(),
      ),
    ).rejects.toMatchObject({ response: { error: { code: 'PERMISO_DENEGADO' } } });
    expect(puerto.listarAsignables).not.toHaveBeenCalled();
  });

  it('la ruta declara bandeja.operar', () => {
    const proto = MiembrosController.prototype as unknown as Record<string, object>;
    expect(
      Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto['listarAsignables'] as object),
    ).toEqual(['bandeja.operar']);
  });
});
