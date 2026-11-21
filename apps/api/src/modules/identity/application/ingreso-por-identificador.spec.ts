/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
/**
 * El ingreso con correo o apodo (ADR-0031 §3 y §4), con puertos de mentira. Lo que se fija aquí es
 * la LÓGICA: qué correo recibe Better Auth, que SIEMPRE se le llama, que el tope se comparte entre
 * correo y apodo y que el camino bloqueado hace las mismas escrituras que el fallido. La integración
 * con Postgres y Better Auth está en `apodo-ingreso.e2e-spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { NoAutenticadoError, DemasiadosIntentosError, ProhibidoError } from '@viajapro/domain';
import { PuertoApodos, PuertoCatalogoDeApodos } from '../domain/puertos-de-apodos.js';
import { PuertoIdentidades } from '../domain/puertos-de-miembros.js';
import { GuardiaDeApodos } from './guardia-de-apodos.js';
import {
  CORREO_CENTINELA,
  IngresoPorIdentificador,
  type ResultadoDeAutenticacion,
} from './ingreso-por-identificador.js';
import { PREFIJO_DE_FALLOS_DE_INGRESO, ReservaDeIntentos } from './limitador-de-envios.js';
import { TOPE_DE_FALLOS_DE_INGRESO, TopeDeFallosDeIngreso } from './tope-de-fallos-de-ingreso.js';

const ISABEL = { identidadId: 'id-isabel', correo: 'isabel@agencia.co' };

class Apodos extends PuertoApodos {
  consultas: string[] = [];
  async resolverCorreo(apodo: string) {
    this.consultas.push(apodo);
    return apodo === 'ialvear' ? ISABEL : null;
  }
}

class Identidades extends PuertoIdentidades {
  async buscarPorCorreo(correo: string) {
    if (correo === ISABEL.correo) return { id: ISABEL.identidadId, eliminada: false };
    if (correo === 'baja@agencia.co') return { id: 'id-baja', eliminada: true };
    return null;
  }
  async crearVerificada(): Promise<{ id: string }> {
    throw new Error('no se usa');
  }
}

class Catalogo extends PuertoCatalogoDeApodos {
  global = false;
  agencias = 1;
  async indiceDeApodosEsGlobal() {
    return this.global;
  }
  async cuentaDeAgencias() {
    return this.agencias;
  }
}

/** Anota cada operación y guarda una fila por reserva (como `verificaciones`). */
class Contador extends ReservaDeIntentos {
  operaciones: string[] = [];
  claves: string[] = [];
  filas = new Map<string, string>();
  private n = 0;
  get cuentas(): Map<string, number> {
    const m = new Map<string, number>();
    for (const clave of this.filas.values()) m.set(clave, (m.get(clave) ?? 0) + 1);
    return m;
  }
  async reservar(clave: string, maximo: number, ventana: number, prefijo: string) {
    this.operaciones.push(`reservar:${maximo}:${ventana}:${prefijo}`);
    this.claves.push(clave);
    const id = `r${(this.n += 1)}`;
    this.filas.set(id, clave);
    return { cabe: (this.cuentas.get(clave) ?? 0) <= maximo, reservaId: id };
  }
  async liberar(id: string) {
    this.operaciones.push('liberar');
    this.filas.delete(id);
  }
}

function armar() {
  const apodos = new Apodos();
  const catalogo = new Catalogo();
  const contador = new Contador();
  const ingreso = new IngresoPorIdentificador(
    apodos,
    new Identidades(),
    new GuardiaDeApodos(catalogo),
    new TopeDeFallosDeIngreso(contador, 'secreto-de-prueba'),
  );
  /** Better Auth de mentira: anota el correo recibido y responde lo que se le ordene. */
  const ba = {
    recibidos: [] as string[],
    respuesta: 'rechazada' as ResultadoDeAutenticacion<string>['tipo'],
    autenticar(correo: string): Promise<ResultadoDeAutenticacion<string>> {
      this.recibidos.push(correo);
      return Promise.resolve(
        this.respuesta === 'abierta'
          ? { tipo: 'abierta', valor: 'sesion' }
          : { tipo: this.respuesta },
      );
    },
  };
  const entrar = (identificador: string) =>
    ingreso.ejecutar(identificador, (c) => ba.autenticar(c));
  return { apodos, catalogo, contador, ba, entrar };
}

const codigoDe = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code ?? 'sin-codigo';
  }
  return 'sin-error';
};

describe('qué correo recibe Better Auth', () => {
  it('con @ es un correo: se pasa en minúsculas, existan o no', async () => {
    const { ba, entrar, apodos } = armar();
    ba.respuesta = 'abierta';
    expect(await entrar('  Isabel@Agencia.CO ')).toBe('sesion');
    await codigoDe(entrar('nadie@agencia.co'));
    expect(ba.recibidos).toEqual([ISABEL.correo, 'nadie@agencia.co']);
    expect(apodos.consultas).toEqual([]);
  });

  it('un apodo existente se traduce a su correo, con una sola consulta, normalizado', async () => {
    const { ba, entrar, apodos } = armar();
    ba.respuesta = 'abierta';
    expect(await entrar('  IAlvear ')).toBe('sesion');
    expect(ba.recibidos).toEqual([ISABEL.correo]);
    expect(apodos.consultas).toEqual(['ialvear']);
  });

  it('un apodo inexistente, mal formado o no ASCII usa el centinela, y SIEMPRE se llama a Better Auth', async () => {
    const { ba, entrar, apodos } = armar();
    for (const x of ['nadie', 'ab', 'con espacio', 'peña', '1abc', 'x'.repeat(40)]) {
      expect(await codigoDe(entrar(x)), x).toBe('CREDENCIALES_INVALIDAS');
    }
    expect(ba.recibidos).toHaveLength(6);
    expect(new Set(ba.recibidos)).toEqual(new Set([CORREO_CENTINELA]));
    // Solo el bien formado llegó a consultarse.
    expect(apodos.consultas).toEqual(['nadie']);
  });

  it('el centinela tiene formato de correo y es del dominio .invalid', () => {
    expect(CORREO_CENTINELA).toMatch(/^[^@\s]+@[^@\s]+\.invalid$/);
  });

  it('con la función apagada (índice global y más de una agencia) el apodo es inexistente', async () => {
    const { ba, entrar, apodos, catalogo } = armar();
    catalogo.global = true;
    catalogo.agencias = 2;
    expect(await codigoDe(entrar('ialvear'))).toBe('CREDENCIALES_INVALIDAS');
    expect(ba.recibidos).toEqual([CORREO_CENTINELA]);
    expect(apodos.consultas).toEqual([]);

    // Con el índice global pero una sola agencia, funciona.
    catalogo.agencias = 1;
    ba.respuesta = 'abierta';
    expect(await entrar('ialvear')).toBe('sesion');
  });
});

describe('qué responde', () => {
  it('apodo inexistente, mal formado, clave errónea y correo inexistente dan el mismo error', async () => {
    const { entrar } = armar();
    const errores = [];
    for (const x of ['nadie', 'ab', 'peña', 'ialvear', 'isabel@agencia.co', 'otro@agencia.co']) {
      try {
        await entrar(x);
      } catch (e) {
        errores.push(e);
      }
    }
    expect(errores).toHaveLength(6);
    for (const e of errores) expect(e).toBeInstanceOf(NoAutenticadoError);
    expect(
      new Set(
        errores.map((e) => JSON.stringify([(e as Error).message, (e as { code: string }).code])),
      ).size,
    ).toBe(1);
  });

  it('429 (IP) y 403 (origen) salen igual que antes, con el identificador que sea', async () => {
    const { ba, entrar } = armar();
    ba.respuesta = 'limite';
    for (const x of ['ialvear', 'nadie', 'isabel@agencia.co']) {
      await expect(entrar(x)).rejects.toBeInstanceOf(DemasiadosIntentosError);
    }
    ba.respuesta = 'origen';
    await expect(entrar('ialvear')).rejects.toBeInstanceOf(ProhibidoError);
  });

  it('un 429 o un 403 no cuentan como fallo del identificador', async () => {
    const { ba, entrar, contador } = armar();
    ba.respuesta = 'limite';
    await codigoDe(entrar('ialvear'));
    ba.respuesta = 'origen';
    await codigoDe(entrar('ialvear'));
    expect(contador.cuentas.size).toBe(0);
  });
});

describe('el tope por identificador (10 en 15 minutos)', () => {
  it('usa prefijo propio, la ventana y el máximo del ADR', async () => {
    expect(TOPE_DE_FALLOS_DE_INGRESO).toEqual({ maximo: 10, ventanaSegundos: 900 });
    const { entrar, contador } = armar();
    await codigoDe(entrar('ialvear'));
    expect(contador.operaciones).toEqual([`reservar:10:900:${PREFIJO_DE_FALLOS_DE_INGRESO}`]);
  });

  it('correo y apodo comparten contador; no se guarda el apodo ni el correo en claro', async () => {
    const { entrar, contador } = armar();
    for (let i = 0; i < 5; i += 1) await codigoDe(entrar('ialvear'));
    for (let i = 0; i < 5; i += 1) await codigoDe(entrar('isabel@agencia.co'));
    expect(new Set(contador.claves).size).toBe(1);
    const [clave] = contador.claves;
    expect(clave).toMatch(new RegExp(`^${PREFIJO_DE_FALLOS_DE_INGRESO}identidad:[0-9a-f]{64}$`));
    expect(clave).not.toContain('ialvear');
    expect(clave).not.toContain('isabel');
    expect([...contador.cuentas.values()]).toEqual([10]);
  });

  it('sin identidad, la clave es el identificador normalizado (y distinta de la de otra identidad)', async () => {
    const { entrar, contador } = armar();
    await codigoDe(entrar('Nadie'));
    await codigoDe(entrar(' nadie '));
    await codigoDe(entrar('ialvear'));
    expect(contador.claves[0]).toBe(contador.claves[1]);
    expect(contador.claves[0]).toMatch(/identificador:[0-9a-f]{64}$/);
    expect(contador.claves[0]).not.toBe(contador.claves[2]);
  });

  it('agotado el tope, se llama a Better Auth con el centinela y se responde igual aunque la clave sea la correcta', async () => {
    const { ba, entrar, contador } = armar();
    for (let i = 0; i < 10; i += 1)
      expect(await codigoDe(entrar('ialvear'))).toBe('CREDENCIALES_INVALIDAS');
    expect(ba.recibidos.every((c) => c === ISABEL.correo)).toBe(true);

    // Ahora el tope está agotado: la clave correcta ni siquiera llega con el correo real.
    ba.recibidos.length = 0;
    ba.respuesta = 'abierta';
    expect(await codigoDe(entrar('ialvear'))).toBe('CREDENCIALES_INVALIDAS');
    expect(await codigoDe(entrar('isabel@agencia.co'))).toBe('CREDENCIALES_INVALIDAS');
    expect(ba.recibidos).toEqual([CORREO_CENTINELA, CORREO_CENTINELA]);
    expect(contador.cuentas.size).toBe(1);
  });

  it('el intento bloqueado hace EXACTAMENTE las mismas escrituras que uno fallido normal', async () => {
    const normal = armar();
    await codigoDe(normal.entrar('ialvear'));

    const bloqueado = armar();
    for (let i = 0; i < 10; i += 1) await codigoDe(bloqueado.entrar('ialvear'));
    bloqueado.contador.operaciones.length = 0;
    await codigoDe(bloqueado.entrar('ialvear'));

    expect(bloqueado.contador.operaciones).toEqual(normal.contador.operaciones);
  });

  it('con la IP agotada, un identificador bloqueado responde igual que uno que no lo está', async () => {
    const { ba, entrar } = armar();
    for (let i = 0; i < 10; i += 1) await codigoDe(entrar('ialvear'));
    ba.respuesta = 'limite';
    const bloqueado = await codigoDe(entrar('ialvear'));
    const libre = await codigoDe(entrar('nadie'));
    expect(bloqueado).toBe('DEMASIADOS_INTENTOS');
    expect(libre).toBe(bloqueado);
  });

  it('el ingreso exitoso no consume cupo: la reserva se borra', async () => {
    const { ba, entrar, contador } = armar();
    ba.respuesta = 'abierta';
    for (let i = 0; i < 30; i += 1) expect(await entrar('ialvear')).toBe('sesion');
    expect(contador.filas.size).toBe(0);
    expect(contador.operaciones.slice(0, 2)).toEqual([
      `reservar:10:900:${PREFIJO_DE_FALLOS_DE_INGRESO}`,
      'liberar',
    ]);
  });

  it('una ráfaga con la clave correcta sobre una identidad con 9 fallos abre como mucho UNA sesión', async () => {
    const { ba, entrar, contador } = armar();
    for (let i = 0; i < 9; i += 1) await codigoDe(entrar('ialvear'));
    ba.respuesta = 'abierta';
    ba.recibidos.length = 0;
    const r = await Promise.allSettled(Array.from({ length: 20 }, () => entrar('ialvear')));
    expect(r.filter((x) => x.status === 'fulfilled').length).toBeLessThanOrEqual(1);
    // Las bloqueadas probaron el centinela, no el correo real.
    expect(ba.recibidos.filter((c) => c === ISABEL.correo).length).toBeLessThanOrEqual(1);
    expect(contador.filas.size).toBeGreaterThanOrEqual(9);
  });

  it('una ráfaga con la clave errónea: no más de 10 comprobaciones efectivas por ventana', async () => {
    const { ba, entrar } = armar();
    await Promise.allSettled(Array.from({ length: 40 }, () => entrar('ialvear')));
    expect(ba.recibidos.filter((c) => c === ISABEL.correo)).toHaveLength(10);
    expect(ba.recibidos.filter((c) => c === CORREO_CENTINELA)).toHaveLength(30);
  });
});
