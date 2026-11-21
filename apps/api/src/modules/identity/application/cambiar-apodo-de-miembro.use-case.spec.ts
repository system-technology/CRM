/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
/**
 * `PATCH /miembros/:id/apodo`, lógica del caso de uso (ADR-0031 §2). La guarda con RLS y Postgres
 * (404 entre agencias, un rol personalizado sin más permisos que el objetivo, el 409 real) está en
 * `apodo-ingreso.e2e-spec.ts`.
 */
import { ForbiddenException } from '@nestjs/common';
import { NoAutenticadoError } from '@viajapro/domain';
import { describe, expect, it } from 'vitest';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { PuertoCatalogoDeApodos } from '../domain/puertos-de-apodos.js';
import { PuertoMiembros, type ResultadoDeCambioDeApodo } from '../domain/puertos-de-miembros.js';
import { CambiarApodoDeMiembroUseCase } from './cambiar-apodo-de-miembro.use-case.js';
import {
  ApodoNoDisponibleError,
  CambioDeApodoNoAdmitidoError,
  MiembroNoEncontradoError,
} from './errores.js';
import { GuardiaDeApodos } from './guardia-de-apodos.js';

class Miembros extends PuertoMiembros {
  llamadas: Array<{ id: string; apodo: string | null; permisos: ReadonlySet<string> }> = [];
  constructor(private readonly resultado: ResultadoDeCambioDeApodo) {
    super();
  }
  async cambiarApodo(id: string, apodo: string | null, permisos: ReadonlySet<string>) {
    this.llamadas.push({ id, apodo, permisos });
    return this.resultado;
  }
  async listar(): Promise<never[]> {
    return [];
  }
  async listarAsignables(): Promise<never[]> {
    return [];
  }
  async describirInvitacion(): Promise<null> {
    return null;
  }
  async agregar(): Promise<'creado'> {
    return 'creado';
  }
  async darDeBaja(): Promise<'baja'> {
    return 'baja';
  }
}

class Catalogo extends PuertoCatalogoDeApodos {
  async indiceDeApodosEsGlobal() {
    return this.global;
  }
  async cuentaDeAgencias() {
    return this.agencias;
  }
  constructor(
    private readonly global = false,
    private readonly agencias = 1,
  ) {
    super();
  }
}

const conPermisos = <T>(permisos: string[], fn: () => Promise<T>): Promise<T> =>
  ContextoTenant.ejecutarCon(
    {
      tenantId: 't1',
      usuarioId: 'u1',
      identidadId: 'i1',
      permisos: new Set(permisos) as never,
      trazaId: 'x',
    },
    fn,
  );

const ID = '01932000-0000-7000-8000-000000000001';

describe('CambiarApodoDeMiembroUseCase', () => {
  it('sin usuarios.administrar da 403 y no llega al puerto', async () => {
    const m = new Miembros('cambiado');
    const uc = new CambiarApodoDeMiembroUseCase(m, new GuardiaDeApodos(new Catalogo()));
    await expect(
      conPermisos(['bandeja.operar'], () => uc.ejecutar(ID, 'ialvear')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.llamadas).toHaveLength(0);
  });

  it('con el permiso, pasa el apodo y los permisos de quien lo cambia al puerto', async () => {
    const m = new Miembros('cambiado');
    const uc = new CambiarApodoDeMiembroUseCase(m, new GuardiaDeApodos(new Catalogo()));
    await conPermisos(['usuarios.administrar'], () => uc.ejecutar(ID, 'ialvear'));
    await conPermisos(['usuarios.administrar'], () => uc.ejecutar(ID, null));
    expect(m.llamadas.map((l) => l.apodo)).toEqual(['ialvear', null]);
    expect(m.llamadas[0]?.permisos.has('usuarios.administrar')).toBe(true);
  });

  it('traduce los resultados: 404, 409 y 403 por tener el objetivo más permisos', async () => {
    const ejecutar = (r: ResultadoDeCambioDeApodo) =>
      conPermisos(['usuarios.administrar'], () =>
        new CambiarApodoDeMiembroUseCase(
          new Miembros(r),
          new GuardiaDeApodos(new Catalogo()),
        ).ejecutar(ID, 'ialvear'),
      );
    await expect(ejecutar('no_encontrado')).rejects.toBeInstanceOf(MiembroNoEncontradoError);
    await expect(ejecutar('apodo_ocupado')).rejects.toBeInstanceOf(ApodoNoDisponibleError);
    await expect(ejecutar({ faltaPermiso: 'roles.administrar' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('apagada (índice global y más de una agencia): error genérico, NO el 409, y no toca nada', async () => {
    const m = new Miembros('apodo_ocupado');
    const uc = new CambiarApodoDeMiembroUseCase(m, new GuardiaDeApodos(new Catalogo(true, 2)));
    const error = await conPermisos(['usuarios.administrar'], () =>
      uc.ejecutar(ID, 'ialvear'),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CambioDeApodoNoAdmitidoError);
    expect(error).not.toBeInstanceOf(ApodoNoDisponibleError);
    expect(error).not.toBeInstanceOf(NoAutenticadoError);
    expect(m.llamadas).toHaveLength(0);
  });
});
