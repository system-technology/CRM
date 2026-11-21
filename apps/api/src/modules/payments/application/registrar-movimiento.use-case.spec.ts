/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
/**
 * Integración del caso de uso con un repositorio EN MEMORIA (el de Prisma lo cubre la e2e): el orden
 * de ADR-0034 §4 (candado → clave → reglas → alta), los permisos por tipo, el autor de la sesión, la
 * idempotencia (200/409 y concurrencia), el aislamiento por agencia, los eventos con solo ids y las
 * sumas en `bigint`.
 */
import 'reflect-metadata';

import type { Permiso, RegistrarMovimiento, ReversarMovimiento } from '@viajapro/contracts';
import { SUMAS_EN_CERO, sumasVigentes, type SumasDeCobro } from '@viajapro/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import type { ArchivoParaCobro } from '../../../shared/puertos/puertos-hacia-booking.js';
import {
  ArchivoDeCobroNoEncontradoError,
  ClaveDeIdempotenciaReutilizadaError,
  DevolucionExcedeLoPagadoError,
  MovimientoDeCobroNoEncontradoError,
  MovimientoYaReversadoError,
  PenalidadExcedeLoPagadoError,
  PenalidadRetenidaSinPagarError,
  ReversoDeReversoError,
  ReversoDejaPagadoNegativoError,
  SinUsuarioParaRegistrarError,
  TipoNoPermitidoParaElEstadoError,
} from '../domain/errors.js';
import type { EventoParaOutbox } from '../domain/eventos.js';
import type { Movimiento, MovimientoNuevo } from '../domain/movimiento.js';
import { LeerCobroUseCase } from './leer-cobro.use-case.js';
import { PlazosYParametrosUseCase } from './plazos-y-parametros.use-case.js';
import {
  type LecturaDeCobro,
  type LecturaDeVista,
  type OperacionesDeCobro,
  type PlazoDeCobro,
  type PlazoNuevo,
  RepositorioDeCobros,
} from './puertos-de-cobro.js';
import { RegistrarMovimientoUseCase } from './registrar-movimiento.use-case.js';

const A = '01932000-0000-7000-8000-00000000000a';
const B = '01932000-0000-7000-8000-00000000000b';
const USUARIO = '01932000-0000-7000-8000-0000000000f1';
const F1 = '01932000-0000-7000-8000-0000000000a1';
const F2 = '01932000-0000-7000-8000-0000000000a2';
const F_DE_B = '01932000-0000-7000-8000-0000000000b1';
const AHORA = new Date('2027-01-10T15:00:00.000Z');
let consecutivo = 0;
const uuid = (): string =>
  `01932000-0000-7000-8000-${(0xc00000000000 + ++consecutivo).toString(16).padStart(12, '0')}`;

const archivo = (id: string, parcial: Partial<ArchivoParaCobro> = {}): ArchivoParaCobro => ({
  id,
  numero: 1,
  contactoId: 'c1',
  destino: 'San Andrés',
  fechaSalida: '2027-03-01',
  estado: 'ABIERTO',
  ventaUnidades: 2_400_000n,
  monedaIso: 'COP',
  creadoEn: new Date('2027-01-01T12:00:00.000Z'),
  pagoTotalVenceEn: null,
  ...parcial,
});

/** Repositorio en memoria: una transacción a la vez (el candado), con rollback si algo lanza. */
class RepoEnMemoria extends RepositorioDeCobros {
  archivos = new Map<string, { tenant: string; archivo: ArchivoParaCobro }>();
  movimientos: Array<Movimiento & { tenant: string }> = [];
  plazos: Array<PlazoDeCobro & { tenant: string }> = [];
  eventos: Array<EventoParaOutbox & { tenant: string }> = [];
  dias = new Map<string, number>();
  candados: string[] = [];
  private cola: Promise<unknown> = Promise.resolve();
  private reloj = 0;

  poner(tenant: string, a: ArchivoParaCobro): void {
    this.archivos.set(a.id, { tenant, archivo: a });
  }

  enTransaccion<T>(fn: (ops: OperacionesDeCobro) => Promise<T>): Promise<T> {
    const tenant = ContextoTenant.tenantId();
    const correr = async (): Promise<T> => {
      const antes = {
        m: [...this.movimientos],
        p: [...this.plazos],
        e: [...this.eventos],
      };
      try {
        return await fn(this.ops(tenant));
      } catch (e) {
        this.movimientos = antes.m;
        this.plazos = antes.p;
        this.eventos = antes.e;
        throw e;
      }
    };
    const resultado = this.cola.then(correr, correr);
    this.cola = resultado.catch(() => undefined);
    return resultado;
  }

  private ops(tenant: string): OperacionesDeCobro {
    const suyos = () => this.movimientos.filter((m) => m.tenant === tenant);
    return {
      bloquearCobroDelArchivo: async (id) => {
        this.candados.push(id);
      },
      leerArchivoBloqueado: async (id) => {
        const f = this.archivos.get(id);
        return f && f.tenant === tenant ? f.archivo : null;
      },
      zonaHoraria: async () => 'America/Bogota',
      buscarPorClave: async (clave) => suyos().find((m) => m.claveIdempotencia === clave) ?? null,
      buscarMovimiento: async (archivoId, pagoId) =>
        suyos().find((m) => m.id === pagoId && m.travelFileId === archivoId) ?? null,
      yaReversado: async (pagoId) => suyos().some((m) => m.reversoDeId === pagoId),
      sumasVigentes: async (archivoId) =>
        sumasVigentes(suyos().filter((m) => m.travelFileId === archivoId)),
      insertar: async (n: MovimientoNuevo) => {
        if (suyos().some((m) => m.claveIdempotencia === n.claveIdempotencia)) return null;
        const fila = {
          ...n,
          notaTachadaEn: null,
          registradoEn: new Date(AHORA.getTime() + ++this.reloj),
          tenant,
        };
        this.movimientos.push(fila);
        return fila;
      },
      escribirEvento: async (e) => {
        this.eventos.push({ ...e, tenant });
      },
      ultimoPlazo: async (archivoId) =>
        [...this.plazos]
          .reverse()
          .find((p) => p.tenant === tenant && p.travelFileId === archivoId) ?? null,
      insertarPlazo: async (p: PlazoNuevo) => {
        const fila = { ...p, registradoEn: new Date(AHORA.getTime() + ++this.reloj), tenant };
        this.plazos.push(fila);
        return fila;
      },
    };
  }

  async leerCobro(archivoId: string): Promise<LecturaDeCobro | null> {
    const tenant = ContextoTenant.tenantId();
    const f = this.archivos.get(archivoId);
    if (!f || f.tenant !== tenant) return null;
    const plazos = this.plazos.filter((p) => p.tenant === tenant && p.travelFileId === archivoId);
    return {
      archivo: f.archivo,
      movimientos: this.movimientos.filter(
        (m) => m.tenant === tenant && m.travelFileId === archivoId,
      ),
      zonaHoraria: 'America/Bogota',
      diasDePlazo: this.dias.get(tenant) ?? null,
      plazoManual: plazos.at(-1)?.venceEl ?? null,
    };
  }

  async leerVista(tope: number): Promise<LecturaDeVista> {
    const tenant = ContextoTenant.tenantId();
    const todos = [...this.archivos.values()]
      .filter((f) => f.tenant === tenant && f.archivo.estado === 'ABIERTO')
      .map((f) => f.archivo);
    const sumas = new Map<string, SumasDeCobro>();
    for (const a of todos) {
      sumas.set(
        a.id,
        sumasVigentes(
          this.movimientos.filter((m) => m.tenant === tenant && m.travelFileId === a.id),
        ),
      );
    }
    return {
      archivos: todos.slice(0, tope),
      sumas,
      plazosManuales: new Map(),
      zonaHoraria: 'America/Bogota',
      diasDePlazo: this.dias.get(tenant) ?? null,
      truncado: todos.length > tope,
    };
  }

  async fijarDiasDePlazo(dias: number): Promise<void> {
    this.dias.set(ContextoTenant.tenantId(), dias);
  }
}

const PERMISOS_ASESOR: Permiso[] = ['cobro.ver', 'cobro.registrar'];
const PERMISOS_DUENO: Permiso[] = ['cobro.ver', 'cobro.registrar', 'cobro.corregir'];

function como<T>(
  permisos: Permiso[],
  fn: () => Promise<T>,
  opciones: { tenant?: string; usuarioId?: string | null } = {},
): Promise<T> {
  return ContextoTenant.ejecutarCon(
    {
      tenantId: opciones.tenant ?? A,
      usuarioId: opciones.usuarioId === undefined ? USUARIO : opciones.usuarioId,
      identidadId: null,
      permisos: new Set(permisos),
      trazaId: 'traza',
    },
    fn,
  );
}

const pago = (parcial: Record<string, unknown> = {}): RegistrarMovimiento => ({
  tipo: 'PAGO',
  claveIdempotencia: uuid(),
  monto: { unidades: '800000', moneda: 'COP' },
  pagadoEl: '2027-01-10',
  medio: 'TRANSFERENCIA',
  ...parcial,
});

const devolucion = (
  unidades: string,
  parcial: Record<string, unknown> = {},
): RegistrarMovimiento => ({
  tipo: 'DEVOLUCION',
  claveIdempotencia: uuid(),
  monto: { unidades, moneda: 'COP' },
  pagadoEl: '2027-01-10',
  medio: 'EFECTIVO',
  ...parcial,
});

const reversoCuerpo = (): ReversarMovimiento => ({
  claveIdempotencia: uuid(),
  motivo: 'Registrado por error',
});

describe('RegistrarMovimientoUseCase', () => {
  let repo: RepoEnMemoria;
  let registro: RegistrarMovimientoUseCase;
  let lector: LeerCobroUseCase;
  let plazos: PlazosYParametrosUseCase;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AHORA);
    repo = new RepoEnMemoria();
    repo.poner(A, archivo(F1));
    repo.poner(A, archivo(F2, { numero: 2, ventaUnidades: 500_000n }));
    repo.poner(B, archivo(F_DE_B, { numero: 1 }));
    lector = new LeerCobroUseCase(repo);
    registro = new RegistrarMovimientoUseCase(repo, lector);
    plazos = new PlazosYParametrosUseCase(repo, lector);
  });
  afterEach(() => vi.useRealTimers());

  describe('registrar un PAGO', () => {
    it('crea el movimiento, calcula el saldo y toma el autor de la sesión', async () => {
      const r = await como(PERMISOS_ASESOR, () => registro.registrar(F1, pago()));
      expect(r.creado).toBe(true);
      expect(r.resultado.movimiento.tipo).toBe('PAGO');
      expect(r.resultado.movimiento.registradoPor).toBe(USUARIO);
      expect(r.resultado.cobro.total).toEqual({ unidades: '2400000', moneda: 'COP' });
      expect(r.resultado.cobro.pagado).toEqual({ unidades: '800000', moneda: 'COP' });
      expect(r.resultado.cobro.saldo).toEqual({ unidades: '1600000', moneda: 'COP' });
      expect(r.resultado.cobro.situacion).toBe('PARCIAL');
      expect(repo.movimientos[0]?.registradoPor).toBe(USUARIO);
    });

    it('toma el candado del archivo antes de leer nada', async () => {
      await como(PERMISOS_ASESOR, () => registro.registrar(F1, pago()));
      expect(repo.candados).toEqual([F1]);
    });

    it('escribe el evento pago_registrado con SOLO ids, sin monto ni textos', async () => {
      await como(PERMISOS_ASESOR, () =>
        registro.registrar(F1, pago({ nota: 'Pagó Ana Pérez', referencia: 'REF-123456' })),
      );
      expect(repo.eventos).toHaveLength(1);
      const e = repo.eventos[0];
      expect(e?.tipoEvento).toBe('payments.pago_registrado');
      expect(Object.keys(e?.payload ?? {}).sort()).toEqual(['pagoId', 'tipo', 'travelFileId', 'v']);
      const texto = JSON.stringify(e);
      for (const prohibido of ['Ana', 'REF-123456', '800000'])
        expect(texto).not.toContain(prohibido);
    });

    it('un pago en otra moneda se rechaza antes de escribir', async () => {
      const cuerpo = pago({ monto: { unidades: '800000', moneda: 'USD' } });
      await expect(
        como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo)),
      ).rejects.toMatchObject({
        code: 'MONEDA_DISTINTA_DEL_ARCHIVO',
      });
      expect(repo.movimientos).toHaveLength(0);
      expect(repo.eventos).toHaveLength(0);
    });

    it('una fecha futura se rechaza (hoy es el de la agencia)', async () => {
      await expect(
        como(PERMISOS_ASESOR, () => registro.registrar(F1, pago({ pagadoEl: '2027-01-11' }))),
      ).rejects.toMatchObject({ code: 'FECHA_DE_PAGO_FUTURA' });
    });

    it('en la madrugada UTC sigue siendo «ayer» en Bogotá: el 2027-01-10 a las 03:00Z es el 09', async () => {
      vi.setSystemTime(new Date('2027-01-10T03:00:00.000Z'));
      await expect(
        como(PERMISOS_ASESOR, () => registro.registrar(F1, pago({ pagadoEl: '2027-01-10' }))),
      ).rejects.toMatchObject({ code: 'FECHA_DE_PAGO_FUTURA' });
      await expect(
        como(PERMISOS_ASESOR, () => registro.registrar(F1, pago({ pagadoEl: '2027-01-09' }))),
      ).resolves.toMatchObject({ creado: true });
    });

    it('sobrepago: se rechaza sin confirmar y se acepta con confirmarSobrepago', async () => {
      const grande = { unidades: '2400001', moneda: 'COP' };
      await expect(
        como(PERMISOS_ASESOR, () => registro.registrar(F1, pago({ monto: grande }))),
      ).rejects.toMatchObject({ code: 'SOBREPAGO_SIN_CONFIRMAR' });
      const r = await como(PERMISOS_ASESOR, () =>
        registro.registrar(F1, pago({ monto: grande, confirmarSobrepago: true })),
      );
      expect(r.resultado.cobro.situacion).toBe('SALDO_A_FAVOR');
      expect(r.resultado.cobro.saldo.unidades).toBe('-1');
    });

    it('un archivo cancelado no admite PAGO', async () => {
      repo.poner(A, archivo(F1, { estado: 'CANCELADO' }));
      await expect(
        como(PERMISOS_ASESOR, () => registro.registrar(F1, pago())),
      ).rejects.toBeInstanceOf(TipoNoPermitidoParaElEstadoError);
    });

    it('un archivo que no existe: 404, no un error de base', async () => {
      await expect(
        como(PERMISOS_ASESOR, () => registro.registrar(uuid(), pago())),
      ).rejects.toBeInstanceOf(ArchivoDeCobroNoEncontradoError);
    });
  });

  describe('permisos por tipo (cobro.registrar solo PAGO; el resto cobro.corregir)', () => {
    const intentos: Array<[string, RegistrarMovimiento]> = [
      ['DEVOLUCION', devolucion('1')],
      [
        'AJUSTE',
        {
          tipo: 'AJUSTE',
          claveIdempotencia: uuid(),
          monto: { unidades: '-1', moneda: 'COP' },
          motivo: 'Descuento',
        },
      ],
      [
        'PENALIDAD',
        {
          tipo: 'PENALIDAD',
          claveIdempotencia: uuid(),
          monto: { unidades: '1', moneda: 'COP' },
          motivo: 'Cancelación',
        },
      ],
    ];

    for (const [nombre, cuerpo] of intentos) {
      it(`un ASESOR no puede registrar ${nombre}: 403 y nada escrito`, async () => {
        await expect(
          como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo)),
        ).rejects.toMatchObject({
          response: { error: { code: 'PERMISO_DENEGADO', details: { permiso: 'cobro.corregir' } } },
        });
        expect(repo.movimientos).toHaveLength(0);
        expect(repo.candados).toHaveLength(0);
      });
    }

    it('un ASESOR no puede reversar', async () => {
      await como(PERMISOS_DUENO, () => registro.registrar(F1, pago()));
      const id = repo.movimientos[0]?.id ?? '';
      await expect(
        como(PERMISOS_ASESOR, () => registro.reversar(F1, id, reversoCuerpo())),
      ).rejects.toMatchObject({ response: { error: { code: 'PERMISO_DENEGADO' } } });
      expect(repo.movimientos).toHaveLength(1);
    });

    it('un rol con cobro.corregir pero sin cobro.registrar no registra PAGO', async () => {
      await expect(
        como(['cobro.ver', 'cobro.corregir'], () => registro.registrar(F1, pago())),
      ).rejects.toMatchObject({
        response: { error: { code: 'PERMISO_DENEGADO', details: { permiso: 'cobro.registrar' } } },
      });
    });

    it('el DUEÑO registra los cuatro tipos', async () => {
      await como(PERMISOS_DUENO, () => registro.registrar(F1, pago()));
      await como(PERMISOS_DUENO, () => registro.registrar(F1, devolucion('100')));
      await como(PERMISOS_DUENO, () =>
        registro.registrar(F1, {
          tipo: 'AJUSTE',
          claveIdempotencia: uuid(),
          monto: { unidades: '-50000', moneda: 'COP' },
          motivo: 'Descuento',
        }),
      );
      expect(repo.movimientos.map((m) => m.tipo)).toEqual(['PAGO', 'DEVOLUCION', 'AJUSTE']);
    });

    it('sin usuario en la sesión no hay a quién atribuir: 403 y nada escrito', async () => {
      await expect(
        como(PERMISOS_ASESOR, () => registro.registrar(F1, pago()), { usuarioId: null }),
      ).rejects.toBeInstanceOf(SinUsuarioParaRegistrarError);
      expect(repo.movimientos).toHaveLength(0);
    });
  });

  describe('idempotencia (R5, ADR-0034 §4)', () => {
    it('el mismo contenido con la misma clave responde con la fila existente y no crea otra', async () => {
      const cuerpo = pago();
      const primero = await como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo));
      const segundo = await como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo));
      expect(primero.creado).toBe(true);
      expect(segundo.creado).toBe(false);
      expect(segundo.resultado.movimiento.id).toBe(primero.resultado.movimiento.id);
      expect(repo.movimientos).toHaveLength(1);
      expect(repo.eventos).toHaveLength(1);
      expect(segundo.resultado.cobro.pagado.unidades).toBe('800000');
    });

    it('un reintento no se vuelve a validar contra un saldo que ya cambió', async () => {
      // El pago de 2.4M salda el archivo; repetirlo no es «sobrepago»: es el mismo.
      const cuerpo = pago({ monto: { unidades: '2400000', moneda: 'COP' } });
      await como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo));
      await expect(
        como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo)),
      ).resolves.toMatchObject({
        creado: false,
      });
    });

    it('una nota distinta no cambia el contenido que cuenta (ADR-0034 §4 paso 2)', async () => {
      const cuerpo = pago({ nota: 'primera' });
      await como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo));
      await expect(
        como(PERMISOS_ASESOR, () =>
          registro.registrar(F1, { ...cuerpo, nota: 'corregida' } as RegistrarMovimiento),
        ),
      ).resolves.toMatchObject({ creado: false });
    });

    for (const [campo, cambio] of [
      ['el monto', { monto: { unidades: '800001', moneda: 'COP' } }],
      ['la fecha', { pagadoEl: '2027-01-09' }],
      ['el medio', { medio: 'EFECTIVO' }],
      ['el pagador', { pagadorId: '01932000-0000-7000-8000-0000000000c9' }],
    ] as const) {
      it(`la misma clave con otro ${campo}: 409 y nada nuevo`, async () => {
        const cuerpo = pago();
        await como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo));
        await expect(
          como(PERMISOS_ASESOR, () => registro.registrar(F1, { ...cuerpo, ...cambio })),
        ).rejects.toBeInstanceOf(ClaveDeIdempotenciaReutilizadaError);
        expect(repo.movimientos).toHaveLength(1);
      });
    }

    it('la misma clave en OTRO archivo de la agencia: 409', async () => {
      const cuerpo = pago({ monto: { unidades: '100000', moneda: 'COP' } });
      await como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo));
      await expect(
        como(PERMISOS_ASESOR, () => registro.registrar(F2, cuerpo)),
      ).rejects.toBeInstanceOf(ClaveDeIdempotenciaReutilizadaError);
    });

    it('la misma clave con otro tipo: 409', async () => {
      const cuerpo = pago();
      await como(PERMISOS_DUENO, () => registro.registrar(F1, cuerpo));
      await expect(
        como(PERMISOS_DUENO, () =>
          registro.registrar(
            F1,
            devolucion('800000', { claveIdempotencia: cuerpo.claveIdempotencia }),
          ),
        ),
      ).rejects.toBeInstanceOf(ClaveDeIdempotenciaReutilizadaError);
    });

    it('una clave de OTRA agencia es invisible: no es un reintento, es un movimiento nuevo', async () => {
      const cuerpo = pago();
      await como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo), { tenant: A });
      const deB = await como(PERMISOS_ASESOR, () => registro.registrar(F_DE_B, cuerpo), {
        tenant: B,
      });
      expect(deB.creado).toBe(true);
      expect(repo.movimientos.map((m) => m.tenant).sort()).toEqual([A, B]);
    });

    it('concurrencia: la misma petición dos veces a la vez crea UNA fila (una 201 y una 200)', async () => {
      const cuerpo = pago();
      const [x, y] = await Promise.all([
        como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo)),
        como(PERMISOS_ASESOR, () => registro.registrar(F1, cuerpo)),
      ]);
      expect([x.creado, y.creado].sort()).toEqual([false, true]);
      expect(repo.movimientos).toHaveLength(1);
      expect(repo.eventos).toHaveLength(1);
    });

    it('concurrencia: dos devoluciones distintas que juntas pasan de lo pagado, una sola cabe', async () => {
      await como(PERMISOS_DUENO, () =>
        registro.registrar(F1, pago({ monto: { unidades: '500000', moneda: 'COP' } })),
      );
      const resultados = await Promise.allSettled([
        como(PERMISOS_DUENO, () => registro.registrar(F1, devolucion('300000'))),
        como(PERMISOS_DUENO, () => registro.registrar(F1, devolucion('300000'))),
      ]);
      expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rechazada = resultados.find((r) => r.status === 'rejected');
      expect(rechazada?.status === 'rejected' && rechazada.reason).toBeInstanceOf(
        DevolucionExcedeLoPagadoError,
      );
      expect(repo.movimientos.filter((m) => m.tipo === 'DEVOLUCION')).toHaveLength(1);
    });
  });

  describe('devolución, penalidad y archivo cancelado', () => {
    it('devolver más de lo pagado: 422 y nada escrito', async () => {
      await como(PERMISOS_DUENO, () =>
        registro.registrar(F1, pago({ monto: { unidades: '500000', moneda: 'COP' } })),
      );
      await expect(
        como(PERMISOS_DUENO, () => registro.registrar(F1, devolucion('500001'))),
      ).rejects.toBeInstanceOf(DevolucionExcedeLoPagadoError);
      expect(repo.movimientos).toHaveLength(1);
    });

    it('un archivo cancelado cierra en cero con penalidad y devolución', async () => {
      await como(PERMISOS_DUENO, () =>
        registro.registrar(F1, pago({ monto: { unidades: '1000000', moneda: 'COP' } })),
      );
      repo.poner(A, archivo(F1, { estado: 'CANCELADO' }));
      await como(PERMISOS_DUENO, () =>
        registro.registrar(F1, {
          tipo: 'PENALIDAD',
          claveIdempotencia: uuid(),
          monto: { unidades: '300000', moneda: 'COP' },
          motivo: 'Cancelación a 10 días',
        }),
      );
      const r = await como(PERMISOS_DUENO, () => registro.registrar(F1, devolucion('700000')));
      expect(r.resultado.cobro.total.unidades).toBe('300000');
      expect(r.resultado.cobro.saldo.unidades).toBe('0');
      expect(r.resultado.cobro.situacion).toBe('PAGADO');
      expect(r.resultado.cobro.estadoDeCobro).toBe('CANCELADO');
    });

    it('con penalidad vigente: devolución total y reverso del pago, 422; reversada la penalidad, caben', async () => {
      const p = await como(PERMISOS_DUENO, () =>
        registro.registrar(F1, pago({ monto: { unidades: '1000000', moneda: 'COP' } })),
      );
      repo.poner(A, archivo(F1, { estado: 'CANCELADO' }));
      const pen = await como(PERMISOS_DUENO, () =>
        registro.registrar(F1, {
          tipo: 'PENALIDAD',
          claveIdempotencia: uuid(),
          monto: { unidades: '300000', moneda: 'COP' },
          motivo: 'Cancelación',
        }),
      );
      await expect(
        como(PERMISOS_DUENO, () => registro.registrar(F1, devolucion('1000000'))),
      ).rejects.toBeInstanceOf(PenalidadRetenidaSinPagarError);
      await expect(
        como(PERMISOS_DUENO, () =>
          registro.reversar(F1, p.resultado.movimiento.id, reversoCuerpo()),
        ),
      ).rejects.toBeInstanceOf(PenalidadRetenidaSinPagarError);
      await como(PERMISOS_DUENO, () =>
        registro.reversar(F1, pen.resultado.movimiento.id, reversoCuerpo()),
      );
      const r = await como(PERMISOS_DUENO, () => registro.registrar(F1, devolucion('1000000')));
      expect(r.resultado.cobro.pagado.unidades).toBe('0');
    });

    it('la penalidad no supera lo pagado; en archivo abierto no se admite', async () => {
      const penalidad = (u: string): RegistrarMovimiento => ({
        tipo: 'PENALIDAD',
        claveIdempotencia: uuid(),
        monto: { unidades: u, moneda: 'COP' },
        motivo: 'Cancelación',
      });
      await expect(
        como(PERMISOS_DUENO, () => registro.registrar(F1, penalidad('1'))),
      ).rejects.toBeInstanceOf(TipoNoPermitidoParaElEstadoError);
      repo.poner(A, archivo(F1, { estado: 'CANCELADO' }));
      await expect(
        como(PERMISOS_DUENO, () => registro.registrar(F1, penalidad('1'))),
      ).rejects.toBeInstanceOf(PenalidadExcedeLoPagadoError);
    });
  });

  describe('sumas en bigint', () => {
    it('diez pagos de 10^15 − 1 y uno de 1 suman exacto, más allá de 2^53', async () => {
      repo.poner(A, archivo(F1, { ventaUnidades: 999_999_999_999_999n }));
      const tope = { unidades: '999999999999999', moneda: 'COP' };
      for (let i = 0; i < 10; i++) {
        await como(PERMISOS_DUENO, () =>
          registro.registrar(F1, pago({ monto: tope, confirmarSobrepago: true })),
        );
      }
      const ultimo = await como(PERMISOS_DUENO, () =>
        registro.registrar(
          F1,
          pago({ monto: { unidades: '1', moneda: 'COP' }, confirmarSobrepago: true }),
        ),
      );
      expect(ultimo.resultado.cobro.pagado.unidades).toBe('9999999999999991');
      expect(ultimo.resultado.cobro.saldo.unidades).toBe('-8999999999999992');
      // Con Number el último dígito se corrompe: 9999999999999991 no es representable.
      expect(String(Number('9999999999999991'))).not.toBe('9999999999999991');
    });
  });

  describe('reverso', () => {
    it('anula un pago: no cuenta, queda visible y el saldo vuelve', async () => {
      const p = await como(PERMISOS_DUENO, () => registro.registrar(F1, pago()));
      const r = await como(PERMISOS_DUENO, () =>
        registro.reversar(F1, p.resultado.movimiento.id, reversoCuerpo()),
      );
      expect(r.creado).toBe(true);
      expect(r.resultado.movimiento.tipo).toBe('REVERSO');
      expect(r.resultado.movimiento.reversoDeId).toBe(p.resultado.movimiento.id);
      expect(r.resultado.movimiento.monto.unidades).toBe('800000'); // copia el monto del original
      expect(r.resultado.cobro.pagado.unidades).toBe('0');
      expect(r.resultado.cobro.situacion).toBe('SIN_PAGOS');
      expect(
        r.resultado.cobro.movimientos.find((m) => m.id === p.resultado.movimiento.id)?.reversado,
      ).toBe(true);
      expect(repo.movimientos).toHaveLength(2);
    });

    it('escribe pago_reversado con solo ids', async () => {
      const p = await como(PERMISOS_DUENO, () => registro.registrar(F1, pago()));
      await como(PERMISOS_DUENO, () =>
        registro.reversar(F1, p.resultado.movimiento.id, reversoCuerpo()),
      );
      const e = repo.eventos.find((x) => x.tipoEvento === 'payments.pago_reversado');
      expect(Object.keys(e?.payload ?? {}).sort()).toEqual([
        'pagoId',
        'reversoDeId',
        'travelFileId',
        'v',
      ]);
      expect(JSON.stringify(e)).not.toContain('Registrado por error');
    });

    it('un movimiento se reversa una sola vez, aunque la clave sea otra', async () => {
      const p = await como(PERMISOS_DUENO, () => registro.registrar(F1, pago()));
      const id = p.resultado.movimiento.id;
      await como(PERMISOS_DUENO, () => registro.reversar(F1, id, reversoCuerpo()));
      await expect(
        como(PERMISOS_DUENO, () => registro.reversar(F1, id, reversoCuerpo())),
      ).rejects.toBeInstanceOf(MovimientoYaReversadoError);
    });

    it('un reverso no se reversa', async () => {
      const p = await como(PERMISOS_DUENO, () => registro.registrar(F1, pago()));
      const r = await como(PERMISOS_DUENO, () =>
        registro.reversar(F1, p.resultado.movimiento.id, reversoCuerpo()),
      );
      await expect(
        como(PERMISOS_DUENO, () =>
          registro.reversar(F1, r.resultado.movimiento.id, reversoCuerpo()),
        ),
      ).rejects.toBeInstanceOf(ReversoDeReversoError);
    });

    it('reversar un pago ya devuelto dejaría lo pagado en negativo: se rechaza', async () => {
      const p = await como(PERMISOS_DUENO, () => registro.registrar(F1, pago()));
      await como(PERMISOS_DUENO, () => registro.registrar(F1, devolucion('300000')));
      await expect(
        como(PERMISOS_DUENO, () =>
          registro.reversar(F1, p.resultado.movimiento.id, reversoCuerpo()),
        ),
      ).rejects.toBeInstanceOf(ReversoDejaPagadoNegativoError);
      expect(repo.movimientos).toHaveLength(2);
    });

    it('un movimiento de OTRO archivo de la misma agencia no se reversa desde esta URL: 404', async () => {
      const p = await como(PERMISOS_DUENO, () =>
        registro.registrar(F2, pago({ monto: { unidades: '100000', moneda: 'COP' } })),
      );
      await expect(
        como(PERMISOS_DUENO, () =>
          registro.reversar(F1, p.resultado.movimiento.id, reversoCuerpo()),
        ),
      ).rejects.toBeInstanceOf(MovimientoDeCobroNoEncontradoError);
    });

    it('un movimiento de OTRA agencia: 404 y el original queda intacto', async () => {
      const deB = await como(PERMISOS_DUENO, () => registro.registrar(F_DE_B, pago()), {
        tenant: B,
      });
      await expect(
        como(
          PERMISOS_DUENO,
          () => registro.reversar(F1, deB.resultado.movimiento.id, reversoCuerpo()),
          { tenant: A },
        ),
      ).rejects.toBeInstanceOf(MovimientoDeCobroNoEncontradoError);
      await expect(
        como(
          PERMISOS_DUENO,
          () => registro.reversar(F_DE_B, deB.resultado.movimiento.id, reversoCuerpo()),
          { tenant: A },
        ),
      ).rejects.toBeInstanceOf(ArchivoDeCobroNoEncontradoError);
      expect(repo.movimientos).toHaveLength(1);
    });

    it('idempotente: mismo reverso con la misma clave responde igual; la clave para otro pago, 409', async () => {
      const p1 = await como(PERMISOS_DUENO, () =>
        registro.registrar(F1, pago({ monto: { unidades: '100', moneda: 'COP' } })),
      );
      const p2 = await como(PERMISOS_DUENO, () =>
        registro.registrar(F1, pago({ monto: { unidades: '100', moneda: 'COP' } })),
      );
      const cuerpo = reversoCuerpo();
      const a = await como(PERMISOS_DUENO, () =>
        registro.reversar(F1, p1.resultado.movimiento.id, cuerpo),
      );
      const b = await como(PERMISOS_DUENO, () =>
        registro.reversar(F1, p1.resultado.movimiento.id, cuerpo),
      );
      expect(b.creado).toBe(false);
      expect(b.resultado.movimiento.id).toBe(a.resultado.movimiento.id);
      await expect(
        como(PERMISOS_DUENO, () => registro.reversar(F1, p2.resultado.movimiento.id, cuerpo)),
      ).rejects.toBeInstanceOf(ClaveDeIdempotenciaReutilizadaError);
      expect(repo.movimientos.filter((m) => m.tipo === 'REVERSO')).toHaveLength(1);
    });
  });

  describe('lectura y aislamiento', () => {
    it('el cobro de un archivo de otra agencia: 404', async () => {
      await expect(
        como(PERMISOS_ASESOR, () => lector.delArchivo(F_DE_B), { tenant: A }),
      ).rejects.toBeInstanceOf(ArchivoDeCobroNoEncontradoError);
    });

    it('la vista no trae archivos de otra agencia y agrupa totales por moneda', async () => {
      repo.poner(A, archivo(uuid(), { numero: 3, monedaIso: 'USD', ventaUnidades: 150_000n }));
      await como(PERMISOS_ASESOR, () => registro.registrar(F1, pago()));
      await como(PERMISOS_ASESOR, () => registro.registrar(F_DE_B, pago()), { tenant: B });
      const v = await como(PERMISOS_ASESOR, () => lector.vista({ limite: 200 }));
      expect(v.datos.map((f) => f.archivoId)).not.toContain(F_DE_B);
      expect(v.datos).toHaveLength(3);
      const cop = v.totales.find((t) => t.moneda === 'COP');
      const usd = v.totales.find((t) => t.moneda === 'USD');
      expect(cop?.total.unidades).toBe(String(2_400_000 + 500_000));
      expect(cop?.pagado.unidades).toBe('800000');
      expect(cop?.porCobrar.unidades).toBe(String(2_900_000 - 800_000));
      expect(usd?.total).toEqual({ unidades: '150000', moneda: 'USD' });
      expect(v.truncado).toBe(false);
    });

    it('filtra por estado de cobro y no devuelve neto ni margen en ninguna fila', async () => {
      const v = await como(PERMISOS_ASESOR, () =>
        lector.vista({ limite: 200, estadoDeCobro: 'VENCIDO' }),
      );
      expect(v.datos).toHaveLength(0);
      const todo = await como(PERMISOS_ASESOR, () => lector.vista({ limite: 200 }));
      expect(JSON.stringify(todo)).not.toMatch(/neto|margen/i);
      const c = await como(PERMISOS_ASESOR, () => lector.delArchivo(F1));
      expect(JSON.stringify(c)).not.toMatch(/neto|margen/i);
    });

    it('avisa si la fecha límite cae después del pago total al mayorista', async () => {
      repo.poner(A, archivo(F1, { pagoTotalVenceEn: new Date('2027-01-15T12:00:00.000Z') }));
      const c = await como(PERMISOS_ASESOR, () => lector.delArchivo(F1));
      // Salida 2027-03-01 − 30 días = 2027-01-30 > 2027-01-15.
      expect(c.avisos).toEqual(['FECHA_LIMITE_POSTERIOR_AL_PAGO_TOTAL_DEL_MAYORISTA']);
    });
  });

  describe('plazo y parámetros', () => {
    it('fija un plazo y rige sobre el de la agencia; repetirlo no inserta otra fila', async () => {
      const antes = await como(PERMISOS_DUENO, () => lector.delArchivo(F1));
      expect(antes.fechaLimite).toBe('2027-01-30');
      expect(antes.fechaLimiteManual).toBe(false);
      const c = await como(PERMISOS_DUENO, () => plazos.fijarPlazo(F1, { venceEl: '2027-02-15' }));
      expect(c.fechaLimite).toBe('2027-02-15');
      expect(c.fechaLimiteManual).toBe(true);
      await como(PERMISOS_DUENO, () => plazos.fijarPlazo(F1, { venceEl: '2027-02-15' }));
      expect(repo.plazos).toHaveLength(1);
      await como(PERMISOS_DUENO, () =>
        plazos.fijarPlazo(F1, { venceEl: '2027-02-16', motivo: 'Pidió más tiempo' }),
      );
      expect(repo.plazos).toHaveLength(2);
      expect(repo.plazos.at(-1)?.registradoPor).toBe(USUARIO);
    });

    it('el plazo de un archivo de otra agencia: 404, sin insertar', async () => {
      await expect(
        como(PERMISOS_DUENO, () => plazos.fijarPlazo(F_DE_B, { venceEl: '2027-02-15' })),
      ).rejects.toBeInstanceOf(ArchivoDeCobroNoEncontradoError);
      expect(repo.plazos).toHaveLength(0);
    });

    it('los días de la agencia cambian la fecha límite por defecto', async () => {
      await como(PERMISOS_DUENO, () => plazos.fijarParametros({ diasPlazoDeCobro: 45 }));
      const c = await como(PERMISOS_DUENO, () => lector.delArchivo(F1));
      expect(c.diasDePlazo).toBe(45);
      expect(c.fechaLimite).toBe('2027-01-15');
    });

    it('sin usuario en la sesión no se fijan ni plazo ni parámetros', async () => {
      await expect(
        como(PERMISOS_DUENO, () => plazos.fijarParametros({ diasPlazoDeCobro: 10 }), {
          usuarioId: null,
        }),
      ).rejects.toBeInstanceOf(SinUsuarioParaRegistrarError);
      await expect(
        como(PERMISOS_DUENO, () => plazos.fijarPlazo(F1, { venceEl: '2027-02-15' }), {
          usuarioId: null,
        }),
      ).rejects.toBeInstanceOf(SinUsuarioParaRegistrarError);
    });
  });
});

describe('SUMAS_EN_CERO no se comparte por referencia', () => {
  it('los repositorios copian el objeto antes de mutarlo', () => {
    expect(Object.isFrozen(SUMAS_EN_CERO)).toBe(false);
    expect(SUMAS_EN_CERO).toEqual({ pagos: 0n, devoluciones: 0n, ajustes: 0n, penalidades: 0n });
  });
});
