/**
 * La cola de envíos y la reserva sobre Postgres (ADR-0019 §1.2, §3.2), con una base de mentira que
 * interpreta SOLO las sentencias de los adaptadores y aplica su semántica sobre una tabla en
 * memoria: lo que se comprueba aquí es la lógica (qué se reclama, qué se reserva, qué espera, qué
 * no se reenvía). La atomicidad real —`FOR UPDATE SKIP LOCKED`, `RETURNING`— la prueba
 * `envios-postgres.e2e-spec.ts` contra PostgreSQL, con dos agencias y dos consumidores.
 */
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColaDeEnviosPostgres } from './cola-de-envios.postgres.js';
import {
  type ClienteDeEnvios,
  ReservaDeEnvioPostgres,
  type TransaccionDeEnvios,
} from './reserva-de-envio.postgres.js';

const T1 = '01932000-0000-7000-8000-000000000001';
const T2 = '01932000-0000-7000-8000-000000000002';
const M1 = '01932000-0000-7000-9000-000000000001';
const M2 = '01932000-0000-7000-9000-000000000002';

interface Fila {
  tenantId: string;
  id: string;
  estado: 'PENDIENTE' | 'FALLIDO';
  wamid: string | null;
  reservadoEn: number | null;
  intentos: number;
  siguienteEn: number | null;
}

/** Interpreta las sentencias de los adaptadores sobre una tabla; el reloj es el de los timers. */
class BaseFalsa implements ClienteDeEnvios {
  readonly filas: Fila[] = [];
  readonly sentencias: string[] = [];
  tenantsVistos: string[] = [];

  poner(tenantId: string, id: string, extra: Partial<Fila> = {}): Fila {
    const fila: Fila = {
      tenantId,
      id,
      estado: 'PENDIENTE',
      wamid: null,
      reservadoEn: null,
      intentos: 0,
      siguienteEn: null,
      ...extra,
    };
    this.filas.push(fila);
    return fila;
  }

  fila(id: string): Fila {
    const f = this.filas.find((x) => x.id === id);
    if (!f) throw new Error('fila inexistente');
    return f;
  }

  private ahora(): number {
    return Date.now();
  }

  private disponible(f: Fila): boolean {
    return (
      f.estado === 'PENDIENTE' &&
      f.wamid === null &&
      f.reservadoEn === null &&
      (f.siguienteEn === null || f.siguienteEn <= this.ahora())
    );
  }

  conTenantResuelto<T>(tenantId: string, fn: (tx: TransaccionDeEnvios) => Promise<T>): Promise<T> {
    this.tenantsVistos.push(tenantId);
    const tx: TransaccionDeEnvios = {
      $queryRaw: <R>(plantilla: TemplateStringsArray, ...v: unknown[]): Promise<R> => {
        const sql = plantilla.join('?');
        this.sentencias.push(sql);
        return Promise.resolve(this.ejecutar(sql, v) as R);
      },
    };
    return fn(tx);
  }

  private ejecutar(sql: string, v: unknown[]): unknown {
    // La RLS: nunca se ve una fila de otro tenant, pase lo que pase en el WHERE.
    const actual = this.tenantsVistos[this.tenantsVistos.length - 1];
    const mias = this.filas.filter((f) => f.tenantId === actual);

    if (sql.includes('FOR UPDATE SKIP LOCKED')) {
      const [tenantId, id, arrendamientoS] = v as [string, string, number];
      const f = mias.find((x) => x.tenantId === tenantId && x.id === id && this.disponible(x));
      if (!f) return [];
      f.intentos += 1;
      f.siguienteEn = this.ahora() + arrendamientoS * 1_000;
      return [{ intentos: f.intentos }];
    }
    if (sql.includes('SET envio_reservado_en = now()')) {
      const [tenantId, id] = v as [string, string];
      const f = mias.find(
        (x) => x.tenantId === tenantId && x.id === id && x.reservadoEn === null && x.wamid === null,
      );
      if (!f) return [];
      f.reservadoEn = this.ahora();
      return [{ id: f.id }];
    }
    if (sql.includes('SET envio_reservado_en = NULL')) {
      const [tenantId, id] = v as [string, string];
      const f = mias.find((x) => x.tenantId === tenantId && x.id === id && x.wamid === null);
      if (f) f.reservadoEn = null;
      return [];
    }
    if (sql.includes('SET envio_siguiente_en = now() +')) {
      const [esperaS, tenantId, id] = v as [number, string, string];
      const f = mias.find(
        (x) =>
          x.tenantId === tenantId &&
          x.id === id &&
          x.estado === 'PENDIENTE' &&
          x.wamid === null &&
          x.reservadoEn === null,
      );
      if (f) f.siguienteEn = this.ahora() + esperaS * 1_000;
      return [];
    }
    if (sql.includes('envio_reservado_en IS NOT NULL')) {
      return mias
        .filter(
          (f) =>
            f.estado === 'PENDIENTE' &&
            f.wamid === null &&
            f.reservadoEn !== null &&
            f.siguienteEn !== null &&
            f.siguienteEn <= this.ahora(),
        )
        .map((f) => ({ id: f.id }));
    }
    if (sql.includes('SELECT id::text')) {
      return mias.filter((f) => this.disponible(f)).map((f) => ({ id: f.id }));
    }
    throw new Error(`Sentencia que la base de mentira no entiende: ${sql.slice(0, 60)}`);
  }
}

describe('ReservaDeEnvioPostgres', () => {
  it('reserva UNA vez: la segunda no reserva (cero filas = no se envía)', async () => {
    const base = new BaseFalsa();
    base.poner(T1, M1);
    const reserva = new ReservaDeEnvioPostgres(base);
    expect(await reserva.reservar(T1, M1)).toBe(true);
    expect(await reserva.reservar(T1, M1)).toBe(false);
  });

  it('dos reservas simultáneas del mismo mensaje: solo una gana', async () => {
    const base = new BaseFalsa();
    base.poner(T1, M1);
    const a = new ReservaDeEnvioPostgres(base);
    const b = new ReservaDeEnvioPostgres(base);
    const r = await Promise.all([a.reservar(T1, M1), b.reservar(T1, M1)]);
    expect(r.sort()).toEqual([false, true]);
  });

  it('liberar reabre la reserva, salvo que Meta ya haya aceptado (wamid)', async () => {
    const base = new BaseFalsa();
    base.poner(T1, M1);
    const aceptado = base.poner(T1, M2);
    const reserva = new ReservaDeEnvioPostgres(base);
    await reserva.reservar(T1, M1);
    await reserva.liberar(T1, M1);
    expect(await reserva.reservar(T1, M1)).toBe(true);
    await reserva.reservar(T1, M2);
    aceptado.wamid = 'wamid.X';
    await reserva.liberar(T1, M2);
    expect(aceptado.reservadoEn).not.toBeNull();
  });

  it('no alcanza el mensaje de OTRA agencia, aunque se conozca su id (RLS)', async () => {
    const base = new BaseFalsa();
    base.poner(T2, M1);
    const reserva = new ReservaDeEnvioPostgres(base);
    expect(await reserva.reservar(T1, M1)).toBe(false);
    expect(base.fila(M1).reservadoEn).toBeNull();
  });

  it('la reserva fija el tenant, lleva tenant_id explícito y pone actualizado_en a mano', async () => {
    const base = new BaseFalsa();
    base.poner(T1, M1);
    await new ReservaDeEnvioPostgres(base).reservar(T1, M1);
    expect(base.tenantsVistos).toEqual([T1]);
    const sql = base.sentencias.join('\n');
    expect(sql).toMatch(/tenant_id = \?::uuid/);
    expect(sql).toMatch(/envio_reservado_en IS NULL AND wamid IS NULL/);
    expect(sql).toMatch(/RETURNING id/);
    expect(sql).toMatch(/actualizado_en = now\(\)/);
  });
});

describe('ColaDeEnviosPostgres', () => {
  let base: BaseFalsa;
  let cola: ColaDeEnviosPostgres;
  let errores: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => {
      errores.push(String(m));
    });
    errores = [];
    base = new BaseFalsa();
    cola = new ColaDeEnviosPostgres(base);
  });
  afterEach(async () => {
    // El cierre espera con un temporizador real: con los falsos no terminaría nunca.
    vi.useRealTimers();
    await cola.cerrar(0);
    vi.restoreAllMocks();
  });

  it('el reclamo usa el contrato de la migración: estado y wamid literales, SKIP LOCKED, tenant explícito', async () => {
    base.poner(T1, M1);
    cola.conectar(() => Promise.resolve());
    await cola.encolar(T1, M1);
    await vi.advanceTimersByTimeAsync(0);
    const sql = base.sentencias[0] ?? '';
    expect(sql).toContain("estado = 'PENDIENTE' AND wamid IS NULL");
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toMatch(/tenant_id = \?::uuid/);
    expect(sql).toMatch(/actualizado_en = now\(\)/);
    expect(base.tenantsVistos[0]).toBe(T1);
  });

  it('el reclamo pone el arrendamiento de 2 min y cuenta el intento ANTES de llamar al consumidor', async () => {
    const f = base.poner(T1, M1);
    let visto: { intentos: number; siguienteEn: number | null } | null = null;
    const t0 = Date.now();
    cola.conectar(() => {
      visto = { intentos: f.intentos, siguienteEn: f.siguienteEn };
      return Promise.resolve();
    });
    await cola.encolar(T1, M1);
    await vi.advanceTimersByTimeAsync(0);
    expect(visto).toEqual({ intentos: 1, siguienteEn: t0 + 120_000 });
  });

  it('dos consumidores a la vez NO toman la misma fila', async () => {
    base.poner(T1, M1);
    const a = new ColaDeEnviosPostgres(base);
    const b = new ColaDeEnviosPostgres(base);
    const enviados: string[] = [];
    const procesar = (_t: string, m: string): Promise<void> => {
      enviados.push(m);
      return new Promise<void>(() => undefined);
    };
    a.conectar(procesar);
    b.conectar(procesar);
    await Promise.all([a.encolar(T1, M1), b.encolar(T1, M1)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(enviados).toEqual([M1]);
    expect(base.fila(M1).intentos).toBe(1);
    vi.useRealTimers();
    await a.cerrar(0);
    await b.cerrar(0);
  });

  it('el mismo mensaje encolado dos veces en el proceso se despacha una vez', async () => {
    base.poner(T1, M1);
    const procesar = vi.fn(() => new Promise<void>(() => undefined));
    cola.conectar(procesar);
    await cola.encolar(T1, M1);
    await cola.encolar(T1, M1);
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledTimes(1);
  });

  it('un mensaje ya resuelto, o de otra agencia, no se reclama ni se envía', async () => {
    base.poner(T1, M1, { wamid: 'wamid.X' });
    base.poner(T2, M2);
    const procesar = vi.fn(() => Promise.resolve());
    cola.conectar(procesar);
    await cola.encolar(T1, M1);
    await cola.encolar(T1, M2); // existe, pero en T2: bajo T1 no se ve
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).not.toHaveBeenCalled();
    expect(base.fila(M2).intentos).toBe(0);
  });

  it('una fila RESERVADA sin wamid no se reclama jamás: no se reenvía', async () => {
    base.poner(T1, M1, { reservadoEn: Date.now() - 1_000, siguienteEn: Date.now() - 500 });
    const procesar = vi.fn(() => Promise.resolve());
    cola.conectar(procesar);
    await cola.encolar(T1, M1);
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).not.toHaveBeenCalled();
  });

  it('con el arrendamiento vigente nadie la reclama; vencido, sí', async () => {
    base.poner(T1, M1, { siguienteEn: Date.now() + 60_000 });
    const procesar = vi.fn(() => Promise.resolve());
    cola.conectar(procesar);
    await cola.encolar(T1, M1);
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    await cola.encolar(T1, M1);
    await vi.advanceTimersByTimeAsync(0);
    expect(procesar).toHaveBeenCalledTimes(1);
  });

  it('reintenta con backoff desde 3 s, cuenta intentos en la fila y marca el último', async () => {
    const f = base.poner(T1, M1);
    const ultimos: boolean[] = [];
    const instantes: number[] = [];
    const t0 = Date.now();
    cola.conectar((_t, _m, c) => {
      ultimos.push(c.ultimoIntento);
      instantes.push(Date.now() - t0);
      return Promise.reject(new Error('Meta caído'));
    });
    await cola.encolar(T1, M1);
    await vi.advanceTimersByTimeAsync(3_000 + 6_000 + 12_000 + 24_000 + 48_000);
    expect(ultimos).toEqual([false, false, false, false, false, true]);
    expect(instantes).toEqual([0, 3_000, 9_000, 21_000, 45_000, 93_000]);
    expect(f.intentos).toBe(6);
  });

  it('tras un fallo la fila queda esperando el backoff (no el arrendamiento de 2 min)', async () => {
    const f = base.poner(T1, M1);
    const t0 = Date.now();
    cola.conectar(() => Promise.reject(new Error('x')));
    await cola.encolar(T1, M1);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.siguienteEn).toBe(t0 + 3_000);
  });

  it('si el fallo ocurre YA reservado, la fila conserva su arrendamiento y NO se reintenta', async () => {
    const f = base.poner(T1, M1);
    const procesar = vi.fn(() => {
      f.reservadoEn = Date.now(); // el caso de uso reservó y luego algo falló
      return Promise.reject(new Error('se cayó tras reservar'));
    });
    cola.conectar(procesar);
    await cola.encolar(T1, M1);
    await vi.advanceTimersByTimeAsync(3_000 + 6_000 + 12_000);
    expect(procesar).toHaveBeenCalledTimes(1);
  });

  it('proceso muerto tras la reserva: queda para «sin confirmar» y NO vuelve a la cola', async () => {
    base.poner(T1, M1, { reservadoEn: Date.now(), siguienteEn: Date.now() + 120_000 });
    expect(await cola.listarSinConfirmar(T1, 10)).toEqual([]); // aún en vuelo
    await vi.advanceTimersByTimeAsync(120_001);
    expect(await cola.listarSinConfirmar(T1, 10)).toEqual([M1]);
    expect(await cola.listarListos(T1, 10)).toEqual([]);
  });

  it('listarListos solo ve lo reclamable de ESA agencia', async () => {
    base.poner(T1, M1);
    base.poner(T2, M2);
    base.poner(T1, '01932000-0000-7000-9000-000000000003', { siguienteEn: Date.now() + 5_000 });
    expect(await cola.listarListos(T1, 10)).toEqual([M1]);
    expect(await cola.listarListos(T2, 10)).toEqual([M2]);
  });

  it('un fallo al dejar la espera no oculta el error original y no registra el mensaje de base (R10)', async () => {
    base.poner(T1, M1);
    const original = new Error('original');
    const fallos: unknown[] = [];
    const c = new ColaDeEnviosPostgres(base, (_k, _c, e) => fallos.push(e));
    c.conectar(() => {
      // La próxima sentencia (la espera) falla con un mensaje que trae datos.
      vi.spyOn(base, 'conTenantResuelto').mockRejectedValueOnce(
        new Error('Failing row contains (573001112233)'),
      );
      return Promise.reject(original);
    });
    await c.encolar(T1, M1);
    await vi.advanceTimersByTimeAsync(0);
    expect(fallos[0]).toBe(original);
    expect(errores.join('\n')).not.toMatch(/573001112233|Failing row/);
    await c.cerrar(0);
  });
});
