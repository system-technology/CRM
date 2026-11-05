import 'reflect-metadata';

import type { MiembroDeAgencia, Permiso } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { CLAVE_PERMISOS_REQUERIDOS } from '../../../shared/autorizacion/permiso.decorator.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import type { PuertoMiembros } from '../domain/puertos-de-miembros.js';
import { MiembrosController } from '../interface/miembros.controller.js';
import { ListarMiembrosUseCase } from './listar-miembros.use-case.js';

const MIEMBRO: MiembroDeAgencia = {
  id: '01932000-0000-7000-8000-0000000000b1',
  nombre: 'Ana',
  correo: 'ana@agencia.test',
  rol: { id: '01932000-0000-7000-8000-0000000000c1', clave: 'DUENO', nombre: 'Dueño' },
  estado: 'ACTIVO',
  creadoEn: '2026-11-01T10:00:00.000Z',
  ultimoAccesoEn: null,
};

const puerto = { listar: () => Promise.resolve([MIEMBRO]) } as unknown as PuertoMiembros;

const con = <T>(permisos: Permiso[], f: () => Promise<T>): Promise<T> =>
  ContextoTenant.ejecutarCon(
    { tenantId: 't', usuarioId: 'u', identidadId: null, permisos: new Set(permisos), trazaId: 'x' },
    f,
  );

describe('ListarMiembrosUseCase', () => {
  it('con usuarios.administrar devuelve la lista del puerto', async () => {
    const r = await con(['usuarios.administrar'], () =>
      new ListarMiembrosUseCase(puerto).ejecutar(),
    );
    expect(r).toEqual([MIEMBRO]);
  });

  it('sin el permiso responde PERMISO_DENEGADO y no consulta', async () => {
    await expect(
      con(['crm.escribir'], () => new ListarMiembrosUseCase(puerto).ejecutar()),
    ).rejects.toMatchObject({ response: { error: { code: 'PERMISO_DENEGADO' } } });
  });

  it('la ruta declara usuarios.administrar', () => {
    const proto = MiembrosController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata(CLAVE_PERMISOS_REQUERIDOS, proto['listar'] as object)).toEqual([
      'usuarios.administrar',
    ]);
  });
});
