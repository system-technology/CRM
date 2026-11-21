/**
 * T-529. Lo que se fija aquí: qué archivos entran en «Sin responsable», con qué motivo, y que la
 * decisión no dependa de la base (los dos puertos son dobles).
 */
import type { ResumenDeArchivo } from '@viajapro/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  type FuenteDeArchivosAbiertos,
  type FuenteDeAsesores,
  type FuenteDeElegibles,
  ListarArchivosSinResponsableUseCase,
} from './listar-sin-responsable.use-case.js';

const TENANT = '01932000-0000-7000-8000-000000000001';
const TX = {} as ClienteTenant;

/** Un resumen de archivo con lo justo: esta lista solo mira `oportunidadId`. */
const archivo = (numero: number, oportunidadId: string | null): ResumenDeArchivo =>
  ({ id: `a-${numero}`, numero, oportunidadId }) as unknown as ResumenDeArchivo;

function armar(opciones: {
  archivos: ResumenDeArchivo[];
  asesores?: Array<{ oportunidadId: string; asesorId: string | null }>;
  elegibles?: string[];
  limite?: number;
}) {
  const listar = vi.fn<FuenteDeArchivosAbiertos['listar']>(() =>
    Promise.resolve({ datos: opciones.archivos }),
  );
  const asesoresDe = vi.fn<FuenteDeAsesores['asesoresDe']>(() =>
    Promise.resolve(opciones.asesores ?? []),
  );
  const activosConPermiso = vi.fn<FuenteDeElegibles['activosConPermiso']>(() =>
    Promise.resolve(opciones.elegibles ?? []),
  );
  const conTenant = <T>(fn: (tx: ClienteTenant) => Promise<T>): Promise<T> => fn(TX);
  const uc = new ListarArchivosSinResponsableUseCase(
    { listar },
    { conTenant },
    { asesoresDe },
    { activosConPermiso },
  );
  const resultado = ContextoTenant.ejecutarCon(
    { tenantId: TENANT, usuarioId: 'u-1', identidadId: null, permisos: new Set(), trazaId: 't' },
    () => uc.ejecutar({ limite: opciones.limite ?? 200 }),
  );
  return { resultado, listar, asesoresDe, activosConPermiso };
}

describe('ListarArchivosSinResponsableUseCase', () => {
  it('pide SOLO los abiertos y en el orden de urgencia de la lista de siempre', async () => {
    const { resultado, listar } = armar({ archivos: [], limite: 50 });
    await resultado;
    expect(listar).toHaveBeenCalledWith({ estado: 'ABIERTO', limite: 50 });
  });

  it('un archivo con asesor activo y con el permiso NO entra', async () => {
    const { resultado } = armar({
      archivos: [archivo(1, 'o-1')],
      asesores: [{ oportunidadId: 'o-1', asesorId: 'u-activo' }],
      elegibles: ['u-activo'],
    });
    expect((await resultado).datos).toEqual([]);
  });

  it('los tres motivos, cada uno con su archivo, y el asesor solo se nombra cuando es el problema', async () => {
    const { resultado } = armar({
      archivos: [archivo(1, null), archivo(2, 'o-2'), archivo(3, 'o-3')],
      asesores: [
        { oportunidadId: 'o-2', asesorId: null },
        { oportunidadId: 'o-3', asesorId: 'u-de-baja' },
      ],
      elegibles: ['u-activo'],
    });
    const r = await resultado;
    expect(r.datos.map((d) => [d.archivo.numero, d.motivo, d.asesorId])).toEqual([
      [1, 'SIN_OPORTUNIDAD', null],
      [2, 'SIN_ASESOR', null],
      [3, 'ASESOR_NO_ELEGIBLE', 'u-de-baja'],
    ]);
  });

  it('una oportunidad que no vuelve de `crm` se trata como «sin asesor», no se omite el archivo', async () => {
    const { resultado } = armar({
      archivos: [archivo(1, 'o-borrada')],
      asesores: [],
      elegibles: ['u-activo'],
    });
    const r = await resultado;
    expect(r.datos).toHaveLength(1);
    expect(r.datos[0]?.motivo).toBe('SIN_ASESOR');
  });

  it('sin nadie elegible en la agencia, hasta los archivos con asesor quedan sin responsable', async () => {
    const { resultado } = armar({
      archivos: [archivo(1, 'o-1')],
      asesores: [{ oportunidadId: 'o-1', asesorId: 'u-activo' }],
      elegibles: [],
    });
    expect((await resultado).datos[0]?.motivo).toBe('ASESOR_NO_ELEGIBLE');
  });

  it('pregunta por cada oportunidad UNA vez, con el tenant explícito (R1)', async () => {
    const { resultado, asesoresDe, activosConPermiso } = armar({
      archivos: [archivo(1, 'o-1'), archivo(2, 'o-1'), archivo(3, null)],
      asesores: [{ oportunidadId: 'o-1', asesorId: 'u-activo' }],
      elegibles: ['u-activo'],
    });
    await resultado;
    expect(asesoresDe).toHaveBeenCalledTimes(1);
    expect(asesoresDe).toHaveBeenCalledWith(TX, TENANT, ['o-1']);
    expect(activosConPermiso).toHaveBeenCalledWith(TX, TENANT, 'archivo.operar');
  });

  it('con la ventana llena marca `truncado`: la lista es un mínimo, no el total', async () => {
    const lleno = await armar({ archivos: [archivo(1, null), archivo(2, null)], limite: 2 })
      .resultado;
    expect(lleno.truncado).toBe(true);
    const holgado = await armar({ archivos: [archivo(1, null)], limite: 2 }).resultado;
    expect(holgado.truncado).toBe(false);
  });

  it('sin archivos abiertos no consulta nada y responde vacío', async () => {
    const { resultado, asesoresDe, activosConPermiso } = armar({ archivos: [] });
    expect(await resultado).toEqual({ datos: [], truncado: false });
    expect(asesoresDe).not.toHaveBeenCalled();
    expect(activosConPermiso).not.toHaveBeenCalled();
  });
});
