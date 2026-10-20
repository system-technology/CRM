/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
/**
 * Los casos de uso de la frontera de identidad, con puertos de mentira.
 *
 * Lo que se fija aquí es la LÓGICA de los pasos 3 y 4 de ADR-0011: cuándo se revoca la sesión,
 * cuándo no, y qué se escribe antes de comprobar (nada). La integración con RLS y con PostgreSQL
 * está en `identity.e2e-spec.ts`.
 */
import type { Permiso } from '@viajapro/contracts';
import { NoAutenticadoError, ProhibidoError } from '@viajapro/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  type MembresiaVerificada,
  PuertoAgencias,
  PuertoMembresias,
  PuertoSesiones,
  type SesionVerificada,
} from '../domain/puertos.js';
import { CambiarAgenciaActiva } from './cambiar-agencia-activa.use-case.js';
import { ResolverAcceso } from './resolver-acceso.use-case.js';
import { ObtenerSesionActual } from './sesion-actual.use-case.js';

const IDENTIDAD = { id: 'i1', correo: 'a@b.test', nombre: 'A' };
const sesion = (tenantActivoId: string | null): SesionVerificada => ({
  sesionId: 's1',
  identidad: IDENTIDAD,
  tenantActivoId,
  cookies: ['c=1'],
});
const vigente: MembresiaVerificada = {
  tipo: 'vigente',
  usuarioId: 'u1',
  rol: 'Asesor',
  permisos: new Set<Permiso>(),
};

class Sesiones extends PuertoSesiones {
  revocadas: string[] = [];
  fijadas: Array<[string, string]> = [];
  constructor(private readonly actual: SesionVerificada | null) {
    super();
  }
  async obtener(): Promise<SesionVerificada | null> {
    return this.actual;
  }
  async revocar(id: string): Promise<void> {
    this.revocadas.push(id);
  }
  async fijarTenantActivo(id: string, tenant: string): Promise<void> {
    this.fijadas.push([id, tenant]);
  }
}
class Membresias extends PuertoMembresias {
  consultas: Array<[string, string]> = [];
  constructor(private readonly respuesta: MembresiaVerificada) {
    super();
  }
  async verificar(tenantId: string, identidadId: string): Promise<MembresiaVerificada> {
    this.consultas.push([tenantId, identidadId]);
    return this.respuesta;
  }
}
class Agencias extends PuertoAgencias {
  async listarDe(): Promise<[]> {
    return [];
  }
}

describe('ResolverAcceso (pasos 3 y 4)', () => {
  it('sin sesión: SIN_SESION, y no consulta la membresía', async () => {
    const m = new Membresias(vigente);
    const r = await new ResolverAcceso(new Sesiones(null), m).resolver({ cookie: null });
    expect(r).toMatchObject({ concedido: false, motivo: 'SIN_SESION' });
    expect(m.consultas).toHaveLength(0);
  });

  it('sesión sin agencia activa: SIN_AGENCIA_ACTIVA, sin revocar', async () => {
    const s = new Sesiones(sesion(null));
    const r = await new ResolverAcceso(s, new Membresias(vigente)).resolver({ cookie: 'x' });
    expect(r).toMatchObject({ concedido: false, motivo: 'SIN_AGENCIA_ACTIVA' });
    expect(s.revocadas).toHaveLength(0);
  });

  it('revalida la agencia DE LA SESIÓN con la identidad de la sesión', async () => {
    const m = new Membresias(vigente);
    const r = await new ResolverAcceso(new Sesiones(sesion('t1')), m).resolver({ cookie: 'x' });
    expect(m.consultas).toEqual([['t1', 'i1']]);
    expect(r).toMatchObject({
      concedido: true,
      acceso: { tenantId: 't1', usuarioId: 'u1', identidadId: 'i1', rol: 'Asesor' },
      cookies: ['c=1'],
    });
  });

  it('cero filas (sin membresía): ACCESO_REVOCADO y la sesión se revoca', async () => {
    const s = new Sesiones(sesion('t1'));
    const r = await new ResolverAcceso(s, new Membresias({ tipo: 'sin_membresia' })).resolver({
      cookie: 'x',
    });
    expect(r).toMatchObject({ concedido: false, motivo: 'ACCESO_REVOCADO' });
    expect(s.revocadas).toEqual(['s1']);
  });

  it('agencia suspendida: AGENCIA_SUSPENDIDA y la sesión se revoca', async () => {
    const s = new Sesiones(sesion('t1'));
    const r = await new ResolverAcceso(s, new Membresias({ tipo: 'agencia_suspendida' })).resolver({
      cookie: 'x',
    });
    expect(r).toMatchObject({ concedido: false, motivo: 'AGENCIA_SUSPENDIDA' });
    expect(s.revocadas).toEqual(['s1']);
  });
});

describe('CambiarAgenciaActiva', () => {
  let sesiones: Sesiones;
  beforeEach(() => {
    sesiones = new Sesiones(sesion('t1'));
  });

  it('comprueba la membresía de la agencia PEDIDA y solo entonces escribe', async () => {
    const m = new Membresias(vigente);
    await new CambiarAgenciaActiva(sesiones, m).ejecutar('x', 't2');
    expect(m.consultas).toEqual([['t2', 'i1']]);
    expect(sesiones.fijadas).toEqual([['s1', 't2']]);
  });

  it('sin membresía: 403 (prohibido), no escribe y no revoca la sesión', async () => {
    const caso = new CambiarAgenciaActiva(sesiones, new Membresias({ tipo: 'sin_membresia' }));
    await expect(caso.ejecutar('x', 't2')).rejects.toBeInstanceOf(ProhibidoError);
    expect(sesiones.fijadas).toHaveLength(0);
    expect(sesiones.revocadas).toHaveLength(0);
  });

  it('agencia suspendida: también 403 y sin escribir', async () => {
    const caso = new CambiarAgenciaActiva(sesiones, new Membresias({ tipo: 'agencia_suspendida' }));
    await expect(caso.ejecutar('x', 't2')).rejects.toBeInstanceOf(ProhibidoError);
    expect(sesiones.fijadas).toHaveLength(0);
  });

  it('sin sesión: 401', async () => {
    const caso = new CambiarAgenciaActiva(new Sesiones(null), new Membresias(vigente));
    await expect(caso.ejecutar(null, 't2')).rejects.toBeInstanceOf(NoAutenticadoError);
  });
});

describe('ObtenerSesionActual', () => {
  it('sin agencia activa devuelve la sesión con acceso nulo', async () => {
    const caso = new ObtenerSesionActual(
      new Sesiones(sesion(null)),
      new Membresias(vigente),
      new Agencias(),
    );
    const { sesion: s } = await caso.ejecutar('x');
    expect(s.tenantActivoId).toBeNull();
    expect(s.acceso).toBeNull();
  });

  it('con una agencia a la que ya no se pertenece: 401 y revoca', async () => {
    const sesiones = new Sesiones(sesion('t1'));
    const caso = new ObtenerSesionActual(
      sesiones,
      new Membresias({ tipo: 'sin_membresia' }),
      new Agencias(),
    );
    await expect(caso.ejecutar('x')).rejects.toBeInstanceOf(NoAutenticadoError);
    expect(sesiones.revocadas).toEqual(['s1']);
  });
});
