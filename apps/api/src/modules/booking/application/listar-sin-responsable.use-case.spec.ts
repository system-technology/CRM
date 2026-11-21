/**
 * T-529 y T-549. Lo que se fija aquí: qué archivos entran en «Sin responsable», con qué motivo, y
 * —desde T-549— que el filtro se aplique ANTES del tope de filas.
 *
 * **El doble de la lista tiene la semántica del SQL**: aplica la restricción que recibe y DESPUÉS
 * recorta al límite. Sin eso, estas pruebas no probarían nada: el bug de T-549 era justo el orden
 * inverso —recortar y luego filtrar—, y un doble que devolviera siempre la lista entera lo habría
 * dejado pasar en verde.
 */
import type { ListaDeArchivos, ResumenDeArchivo } from '@viajapro/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  type FuenteDeArchivosAbiertos,
  type FuenteDeAsesores,
  type FuenteDeElegibles,
  type FuenteDeOportunidadesAbiertas,
  ListarArchivosSinResponsableUseCase,
} from './listar-sin-responsable.use-case.js';
import type { RestriccionDeOportunidades } from './puertos-de-operacion.js';

const TENANT = '01932000-0000-7000-8000-000000000001';
const TX = {} as ClienteTenant;

/** Un resumen de archivo con lo justo: esta lista solo mira `oportunidadId`. */
const archivo = (numero: number, oportunidadId: string | null): ResumenDeArchivo =>
  ({ id: `a-${numero}`, numero, oportunidadId }) as unknown as ResumenDeArchivo;

function armar(opciones: {
  /** En el orden de urgencia en que los devolvería la base. */
  archivos: ResumenDeArchivo[];
  asesores?: Array<{ oportunidadId: string; asesorId: string | null }>;
  elegibles?: string[];
  limite?: number;
}) {
  const todos = opciones.archivos;
  // La base: FILTRA y luego recorta. Sin restricción (lo que hacía T-549) devuelve la ventana cruda.
  const listar = vi.fn<FuenteDeArchivosAbiertos['listar']>(
    (filtro, restriccion): Promise<ListaDeArchivos> => {
      const admitidos =
        restriccion === undefined ? todos : todos.filter((a) => admite(restriccion, a));
      return Promise.resolve({ datos: admitidos.slice(0, filtro.limite) });
    },
  );
  // Las oportunidades en juego salen de los archivos abiertos, como en la consulta real.
  const oportunidadesDeArchivosAbiertos = vi.fn<
    FuenteDeOportunidadesAbiertas['oportunidadesDeArchivosAbiertos']
  >(() =>
    Promise.resolve([
      ...new Set(todos.map((a) => a.oportunidadId).filter((id): id is string => id !== null)),
    ]),
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
    { oportunidadesDeArchivosAbiertos },
  );
  const resultado = ContextoTenant.ejecutarCon(
    { tenantId: TENANT, usuarioId: 'u-1', identidadId: null, permisos: new Set(), trazaId: 't' },
    () => uc.ejecutar({ limite: opciones.limite ?? 200 }),
  );
  return { resultado, listar, asesoresDe, activosConPermiso, oportunidadesDeArchivosAbiertos };
}

const admite = (r: RestriccionDeOportunidades, a: ResumenDeArchivo): boolean =>
  a.oportunidadId === null ? r.incluirSinOportunidad : r.oportunidades.includes(a.oportunidadId);

/** La restricción con la que se pidió la lista; `undefined` si se pidió sin filtrar. */
const restriccionUsada = (
  listar: ReturnType<typeof armar>['listar'],
): RestriccionDeOportunidades | undefined => listar.mock.calls[0]?.[1];

describe('ListarArchivosSinResponsableUseCase', () => {
  it('pide SOLO los abiertos, en el orden de siempre y UNA fila más que el tope', async () => {
    const { resultado, listar } = armar({ archivos: [], limite: 50 });
    await resultado;
    // La fila de más es lo que distingue «el tope justo lleno» de «sobra alguno» sin contar dos
    // veces la lista (T-549). Se descarta antes de responder.
    expect(listar).toHaveBeenCalledWith(
      { estado: 'ABIERTO', limite: 51 },
      { oportunidades: [], incluirSinOportunidad: true },
    );
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

  // ---- T-549: el filtro va ANTES del tope ------------------------------------------------------

  it('T-549: el huérfano que cae bajo la ventana sale igual, aunque el tope sea 1', async () => {
    // Orden de urgencia: primero uno CON responsable, después el huérfano. Con el filtro aplicado
    // después del recorte, la ventana de 1 se la lleva el primero y el huérfano no sale nunca.
    const { resultado } = armar({
      archivos: [archivo(1, 'o-viva'), archivo(2, null)],
      asesores: [{ oportunidadId: 'o-viva', asesorId: 'u-activo' }],
      elegibles: ['u-activo'],
      limite: 1,
    });
    const r = await resultado;
    expect(r.datos.map((d) => d.archivo.numero)).toEqual([2]);
    expect(r.truncado).toBe(false);
  });

  it('T-549: `truncado` cuenta los huérfanos, no las filas miradas', async () => {
    // Dos huérfanos y un tope de dos: caben los dos, por muchos archivos con dueño que haya delante.
    const justo = await armar({
      archivos: [archivo(1, 'o-viva'), archivo(2, null), archivo(3, null)],
      asesores: [{ oportunidadId: 'o-viva', asesorId: 'u-activo' }],
      elegibles: ['u-activo'],
      limite: 2,
    }).resultado;
    expect(justo.datos.map((d) => d.archivo.numero)).toEqual([2, 3]);
    expect(justo.truncado).toBe(false);

    // Tres huérfanos y el mismo tope: ahora sí sobra uno, y la lista vuelve a ser un mínimo.
    const sobra = await armar({
      archivos: [archivo(1, 'o-viva'), archivo(2, null), archivo(3, null), archivo(4, null)],
      asesores: [{ oportunidadId: 'o-viva', asesorId: 'u-activo' }],
      elegibles: ['u-activo'],
      limite: 2,
    }).resultado;
    expect(sobra.datos.map((d) => d.archivo.numero)).toEqual([2, 3]);
    expect(sobra.truncado).toBe(true);
  });

  it('T-549: la lista se pide restringida a las oportunidades huérfanas y a los archivos sin ninguna', async () => {
    const { resultado, listar } = armar({
      archivos: [archivo(1, 'o-viva'), archivo(2, 'o-huerfana'), archivo(3, null)],
      asesores: [
        { oportunidadId: 'o-viva', asesorId: 'u-activo' },
        { oportunidadId: 'o-huerfana', asesorId: 'u-de-baja' },
      ],
      elegibles: ['u-activo'],
    });
    await resultado;
    expect(restriccionUsada(listar)).toEqual({
      oportunidades: ['o-huerfana'],
      incluirSinOportunidad: true,
    });
  });

  it('T-549: el tope se gasta en huérfanos, no en archivos con dueño', async () => {
    // Con el filtro después del recorte, el primero se come media ventana y solo sale UN huérfano.
    const { resultado } = armar({
      archivos: [archivo(1, 'o-viva'), archivo(2, null), archivo(3, null), archivo(4, null)],
      asesores: [{ oportunidadId: 'o-viva', asesorId: 'u-activo' }],
      elegibles: ['u-activo'],
      limite: 2,
    });
    const r = await resultado;
    expect(r.datos).toHaveLength(2);
    expect(r.truncado).toBe(true);
  });

  it('sin oportunidades en juego no se pregunta a `crm` ni a `identity`', async () => {
    const { resultado, asesoresDe, activosConPermiso } = armar({ archivos: [] });
    expect(await resultado).toEqual({ datos: [], truncado: false });
    expect(asesoresDe).not.toHaveBeenCalled();
    expect(activosConPermiso).not.toHaveBeenCalled();
  });
});
