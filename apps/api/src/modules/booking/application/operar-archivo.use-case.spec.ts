/**
 * Integración del caso de uso con un repositorio en memoria (el de Prisma lo cubre el e2e): la
 * orquestación, el neto con y sin `cotizacion.ver_neto_y_margen` (T-248), el 404 por agencia y
 * por archivo, y que cada mutación deje lo que debe.
 */
import 'reflect-metadata';

import { ActualizarReserva, CancelarArchivo, ReemplazarPasajeros } from '@viajapro/contracts';
import type { Permiso } from '@viajapro/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import type { Archivo, CancelacionDelArchivo, PasajeroNuevo } from '../domain/archivo.js';
import {
  ArchivoCanceladoError,
  ArchivoNoEncontradoError,
  ReservaNoEncontradaError,
  TimeLimitRequeridoError,
  TitularInvalidoError,
  TransicionDeReservaInvalidaError,
} from '../domain/errors-de-operacion.js';
import type { CambioDeEstadoDeReserva, Reserva } from '../domain/reserva.js';
import { OperarArchivoUseCase } from './operar-archivo.use-case.js';
import {
  type FiltroDeArchivos,
  type OperacionesDelArchivo,
  RepositorioDeOperacionDeArchivos,
} from './puertos-de-operacion.js';

const A = '01932000-0000-7000-8000-00000000000a';
const B = '01932000-0000-7000-8000-00000000000b';
const USUARIO = '01932000-0000-7000-8000-0000000000f1';
const AHORA = new Date('2027-01-10T15:00:00.000Z');

const reserva = (id: string, parcial: Partial<Reserva> = {}): Reserva => ({
  id,
  mayoristaId: null,
  mayoristaNombre: 'Mayorista X',
  netoUnidades: 900_000n,
  monedaIso: 'COP',
  localizador: null,
  estado: 'PENDIENTE',
  solicitadaEn: null,
  confirmadaEn: null,
  abonadaEn: null,
  pagadaEn: null,
  timeLimit: null,
  pagoTotalVenceEn: null,
  motivoCaida: null,
  nota: null,
  avisoTimeLimitProximoEn: null,
  avisoTimeLimitVencidoEn: null,
  avisoPagoTotalProximoEn: null,
  avisoPagoTotalVencidoEn: null,
  ...parcial,
});

const archivo = (id: string, numero: number, reservas: Reserva[]): Archivo => ({
  id,
  numero,
  contactoId: 'c1',
  oportunidadId: null,
  cotizacionId: `q-${id}`,
  versionCotizacion: 1,
  paqueteNombre: 'Paquete',
  destino: 'San Andrés',
  fechaSalida: '2027-03-15',
  noches: 3,
  adultos: 2,
  ninos: 0,
  infantes: 0,
  ventaUnidades: 1_200_000n,
  monedaIso: 'COP',
  trm: null,
  estado: 'ABIERTO',
  motivoCancelacion: null,
  notaCancelacion: null,
  canceladoEn: null,
  creadoEn: AHORA,
  reservas,
  pasajeros: [],
});

/** Repositorio en memoria con las mismas garantías observables: por agencia, y `null` si no es de ella. */
class RepositorioEnMemoria extends RepositorioDeOperacionDeArchivos {
  readonly porAgencia = new Map<string, Archivo[]>();
  enTransacciones = 0;

  private lista(): Archivo[] {
    return this.porAgencia.get(ContextoTenant.tenantId()) ?? [];
  }

  listar(filtro: FiltroDeArchivos): Promise<Archivo[]> {
    return Promise.resolve(
      this.lista()
        .filter((a) => filtro.estado === 'TODOS' || a.estado === filtro.estado)
        .map((a) => ({ ...a, pasajeros: [] })),
    );
  }

  leer(id: string): Promise<Archivo | null> {
    return Promise.resolve(this.lista().find((a) => a.id === id) ?? null);
  }

  historial: CambioDeEstadoDeReserva[] = [];

  historialDe(): Promise<CambioDeEstadoDeReserva[]> {
    return Promise.resolve(this.historial);
  }

  enTransaccion<T>(fn: (ops: OperacionesDelArchivo) => Promise<T>): Promise<T> {
    this.enTransacciones++;
    const buscar = (id: string): Archivo | undefined => this.lista().find((x) => x.id === id);
    return fn({
      leerBloqueado: (id) => this.leer(id),
      zonaHoraria: () => Promise.resolve('America/Bogota'),
      guardarReserva: (
        archivoId: string,
        r: Reserva,
        _actor: string | null,
        _anterior: Reserva,
      ): Promise<void> => {
        const a = buscar(archivoId);
        const i = a?.reservas.findIndex((x) => x.id === r.id) ?? -1;
        if (!a || i < 0) return Promise.reject(new ReservaNoEncontradaError(archivoId, r.id));
        a.reservas[i] = r;
        return Promise.resolve();
      },
      reemplazarPasajeros: (archivoId: string, ps: readonly PasajeroNuevo[]): Promise<void> => {
        const a = buscar(archivoId);
        if (a) {
          a.pasajeros = ps.map((p, orden) => ({ id: `p${orden}`, orden, ...p }));
        }
        return Promise.resolve();
      },
      guardarCancelacion: (archivoId: string, c: CancelacionDelArchivo): Promise<void> => {
        const a = buscar(archivoId);
        if (a) {
          a.estado = 'CANCELADO';
          a.motivoCancelacion = c.motivo;
          a.notaCancelacion = c.nota;
          a.canceladoEn = c.canceladoEn;
          a.reservas = a.reservas.map((r) =>
            c.reservasACancelar.includes(r.id) ? { ...r, estado: 'CANCELADA' } : r,
          );
        }
        return Promise.resolve();
      },
    });
  }
}

const TODOS: Permiso[] = ['cotizacion.ver_neto_y_margen', 'cotizacion.escribir'];
const SIN_NETO: Permiso[] = ['cotizacion.escribir'];

const como = <T>(tenantId: string, permisos: Permiso[], fn: () => Promise<T>): Promise<T> =>
  ContextoTenant.ejecutarCon(
    { tenantId, usuarioId: USUARIO, identidadId: null, permisos: new Set(permisos), trazaId: 't' },
    fn,
  );

let repo: RepositorioEnMemoria;
let casoDeUso: OperarArchivoUseCase;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  repo = new RepositorioEnMemoria();
  repo.porAgencia.set(A, [
    archivo('a1', 1, [
      reserva('r1'),
      reserva('r2', { mayoristaNombre: 'Otro', netoUnidades: null }),
    ]),
    archivo('a2', 2, [
      reserva('r3', {
        estado: 'CONFIRMADA',
        solicitadaEn: AHORA,
        confirmadaEn: AHORA,
        timeLimit: new Date('2027-01-11T00:00:00.000Z'),
      }),
    ]),
  ]);
  repo.porAgencia.set(B, [archivo('b1', 1, [reserva('rb1')])]);
  casoDeUso = new OperarArchivoUseCase(repo);
});

afterEach(() => vi.useRealTimers());

describe('T-248: el neto solo sale con cotizacion.ver_neto_y_margen', () => {
  it('con el permiso, el detalle trae netoUnidades (y null si es desconocido)', async () => {
    const d = await como(A, TODOS, () => casoDeUso.leer('a1'));
    expect(d.reservas[0]).toMatchObject({ netoUnidades: '900000', moneda: 'COP' });
    expect(d.reservas[1]).toHaveProperty('netoUnidades', null);
  });

  it('sin el permiso, el detalle omite la clave entera (ni siquiera null)', async () => {
    const d = await como(A, SIN_NETO, () => casoDeUso.leer('a1'));
    for (const r of d.reservas) expect(Object.keys(r)).not.toContain('netoUnidades');
    expect(JSON.stringify(d)).not.toMatch(/neto|margen/i);
  });

  it('con y sin el permiso en la lista', async () => {
    const con = await como(A, TODOS, () => casoDeUso.listar({ estado: 'ABIERTO', limite: 200 }));
    expect(con.datos.flatMap((a) => a.reservas).every((r) => 'netoUnidades' in r)).toBe(true);
    const sin = await como(A, SIN_NETO, () => casoDeUso.listar({ estado: 'ABIERTO', limite: 200 }));
    expect(JSON.stringify(sin)).not.toMatch(/neto|margen/i);
  });

  it('sin contexto de permisos (vacío) tampoco sale', async () => {
    const d = await como(A, [], () => casoDeUso.leer('a1'));
    expect(JSON.stringify(d)).not.toMatch(/neto/i);
  });

  it('las mutaciones devuelven el detalle con el mismo criterio', async () => {
    const sin = await como(A, SIN_NETO, () =>
      casoDeUso.actualizarReserva('a1', 'r1', ActualizarReserva.parse({ estado: 'SOLICITADA' })),
    );
    expect(JSON.stringify(sin)).not.toMatch(/neto/i);
    const con = await como(A, TODOS, () =>
      casoDeUso.actualizarReserva('a1', 'r1', ActualizarReserva.parse({ estado: 'SOLICITADA' })),
    );
    expect(con.reservas[0]).toHaveProperty('netoUnidades', '900000');
  });
});

describe('historial de estados de las reservas (T-250)', () => {
  it('el detalle lo trae mapeado al contrato (instante ISO, sin neto), también tras una mutación', async () => {
    repo.historial = [
      {
        id: 'h1',
        reservaId: 'r1',
        estadoAnterior: 'PENDIENTE',
        estadoNuevo: 'SOLICITADA',
        usuarioId: USUARIO,
        ocurridoEn: new Date('2027-01-05T15:00:00.000Z'),
      },
    ];
    const esperado = [
      {
        id: 'h1',
        reservaId: 'r1',
        estadoAnterior: 'PENDIENTE',
        estadoNuevo: 'SOLICITADA',
        usuarioId: USUARIO,
        ocurridoEn: '2027-01-05T15:00:00.000Z',
      },
    ];
    const d = await como(A, SIN_NETO, () => casoDeUso.leer('a1'));
    expect(d.historial).toEqual(esperado);
    expect(JSON.stringify(d.historial)).not.toMatch(/neto/i);
    const tras = await como(A, SIN_NETO, () =>
      casoDeUso.actualizarReserva('a1', 'r1', ActualizarReserva.parse({ estado: 'SOLICITADA' })),
    );
    expect(tras.historial).toEqual(esperado);
  });

  it('un archivo sin cambios devuelve el historial vacío', async () => {
    expect((await como(A, TODOS, () => casoDeUso.leer('a1'))).historial).toEqual([]);
  });
});

describe('lista', () => {
  it('ordena por el plazo vigente más próximo; los que no tienen plazo, al final', async () => {
    const l = await como(A, TODOS, () => casoDeUso.listar({ estado: 'ABIERTO', limite: 200 }));
    expect(l.datos.map((a) => a.numero)).toEqual([2, 1]);
    expect(l.datos[0]).toMatchObject({ semaforo: 'MENOS_DE_24_H', avance: 'CONFIRMADO' });
    expect(l.datos[1]).toMatchObject({
      semaforo: null,
      avance: 'POR_CONFIRMAR',
      proximoPlazo: null,
    });
  });

  it('sin plazo, los recién abiertos primero (número descendente, T-257); un cancelado cuenta como sin plazo', async () => {
    repo.porAgencia.get(A)?.push(
      archivo('a3', 3, [reserva('r4')]),
      {
        ...archivo('a4', 4, [
          reserva('r5', {
            estado: 'CONFIRMADA',
            solicitadaEn: AHORA,
            confirmadaEn: AHORA,
            timeLimit: new Date('2027-01-10T18:00:00.000Z'),
          }),
        ]),
        estado: 'CANCELADO',
      },
      archivo('a5', 5, []),
    );
    const l = await como(A, TODOS, () => casoDeUso.listar({ estado: 'TODOS', limite: 200 }));
    expect(l.datos.map((a) => a.numero)).toEqual([2, 5, 4, 3, 1]);
  });

  it('solo ve los de su agencia', async () => {
    const l = await como(B, TODOS, () => casoDeUso.listar({ estado: 'TODOS', limite: 200 }));
    expect(l.datos.map((a) => a.id)).toEqual(['b1']);
  });
});

describe('aislamiento por agencia y por archivo (404)', () => {
  it('B no lee ni opera el archivo de A', async () => {
    await expect(como(B, TODOS, () => casoDeUso.leer('a1'))).rejects.toThrow(
      ArchivoNoEncontradoError,
    );
    await expect(
      como(B, TODOS, () =>
        casoDeUso.actualizarReserva('a1', 'r1', ActualizarReserva.parse({ estado: 'SOLICITADA' })),
      ),
    ).rejects.toThrow(ArchivoNoEncontradoError);
    await expect(
      como(B, TODOS, () =>
        casoDeUso.reemplazarPasajeros('a1', ReemplazarPasajeros.parse({ pasajeros: [] })),
      ),
    ).rejects.toThrow(ArchivoNoEncontradoError);
    await expect(
      como(B, TODOS, () =>
        casoDeUso.cancelar('a1', CancelarArchivo.parse({ motivo: 'CLIENTE_DESISTIO' })),
      ),
    ).rejects.toThrow(ArchivoNoEncontradoError);
    expect(repo.porAgencia.get(A)?.[0]?.estado).toBe('ABIERTO');
  });

  it('una reserva no se opera desde la URL de otro archivo de la misma agencia', async () => {
    await expect(
      como(A, TODOS, () =>
        casoDeUso.actualizarReserva('a2', 'r1', ActualizarReserva.parse({ estado: 'SOLICITADA' })),
      ),
    ).rejects.toThrow(ReservaNoEncontradaError);
    expect(repo.porAgencia.get(A)?.[0]?.reservas[0]?.estado).toBe('PENDIENTE');
  });
});

describe('cambiar el estado de una reserva', () => {
  it('avanza y devuelve el archivo con la reserva nueva', async () => {
    const d = await como(A, TODOS, () =>
      casoDeUso.actualizarReserva(
        'a1',
        'r1',
        ActualizarReserva.parse({ estado: 'SOLICITADA', localizador: 'LOC1' }),
      ),
    );
    expect(d.reservas[0]).toMatchObject({
      estado: 'SOLICITADA',
      localizador: 'LOC1',
      solicitadaEn: AHORA.toISOString(),
    });
  });

  it('confirmar exige el time limit (error tipado, y nada se escribe)', async () => {
    await como(A, TODOS, () =>
      casoDeUso.actualizarReserva('a1', 'r1', ActualizarReserva.parse({ estado: 'SOLICITADA' })),
    );
    await expect(
      como(A, TODOS, () =>
        casoDeUso.actualizarReserva('a1', 'r1', ActualizarReserva.parse({ estado: 'CONFIRMADA' })),
      ),
    ).rejects.toThrow(TimeLimitRequeridoError);
    expect(repo.porAgencia.get(A)?.[0]?.reservas[0]?.estado).toBe('SOLICITADA');
  });

  it('una transición inválida es un error de dominio', async () => {
    await expect(
      como(A, TODOS, () =>
        casoDeUso.actualizarReserva(
          'a1',
          'r1',
          ActualizarReserva.parse({ estado: 'PAGADA_AL_PROVEEDOR' }),
        ),
      ),
    ).rejects.toThrow(TransicionDeReservaInvalidaError);
  });

  it('es idempotente: repetir el PUT no cambia la reserva', async () => {
    const cuerpo = ActualizarReserva.parse({ estado: 'SOLICITADA' });
    const una = await como(A, TODOS, () => casoDeUso.actualizarReserva('a1', 'r1', cuerpo));
    vi.setSystemTime(new Date(AHORA.getTime() + 3_600_000));
    const dos = await como(A, TODOS, () => casoDeUso.actualizarReserva('a1', 'r1', cuerpo));
    expect(dos.reservas[0]).toEqual(una.reservas[0]);
  });

  it('un archivo cancelado no admite cambios', async () => {
    await como(A, TODOS, () =>
      casoDeUso.cancelar('a1', CancelarArchivo.parse({ motivo: 'CLIENTE_DESISTIO' })),
    );
    await expect(
      como(A, TODOS, () =>
        casoDeUso.actualizarReserva('a1', 'r1', ActualizarReserva.parse({ estado: 'SOLICITADA' })),
      ),
    ).rejects.toThrow(ArchivoCanceladoError);
  });
});

describe('pasajeros', () => {
  it('reemplaza la lista y avisa si no cuadra con la venta (sin impedir)', async () => {
    const d = await como(A, TODOS, () =>
      casoDeUso.reemplazarPasajeros(
        'a1',
        ReemplazarPasajeros.parse({
          pasajeros: [{ nombre: 'Ana Pérez', tipo: 'ADT', esTitular: true }],
        }),
      ),
    );
    expect(d.pasajeros).toHaveLength(1);
    expect(d.pasajeros[0]).toMatchObject({ nombre: 'Ana Pérez', esTitular: true, orden: 0 });
    expect(d.avisos).toEqual(['PASAJEROS_NO_CUADRAN_CON_LA_VENTA']);
  });

  it('sin titular no se guarda nada', async () => {
    await expect(
      como(A, TODOS, () =>
        casoDeUso.reemplazarPasajeros(
          'a1',
          ReemplazarPasajeros.parse({ pasajeros: [{ nombre: 'Ana', tipo: 'ADT' }] }),
        ),
      ),
    ).rejects.toThrow(TitularInvalidoError);
    expect(repo.porAgencia.get(A)?.[0]?.pasajeros).toEqual([]);
  });
});

describe('cancelación', () => {
  it('cancela el archivo y sus reservas vivas, con el avance en null', async () => {
    const d = await como(A, TODOS, () =>
      casoDeUso.cancelar('a1', CancelarArchivo.parse({ motivo: 'OTRO', nota: 'Cambió de planes' })),
    );
    expect(d).toMatchObject({
      estado: 'CANCELADO',
      avance: null,
      motivoCancelacion: 'OTRO',
      notaCancelacion: 'Cambió de planes',
    });
    expect(d.reservas.every((r) => r.estado === 'CANCELADA')).toBe(true);
  });

  it('el contrato rechaza OTRO sin nota antes de llegar al caso de uso', () => {
    expect(CancelarArchivo.safeParse({ motivo: 'OTRO' }).success).toBe(false);
  });
});
