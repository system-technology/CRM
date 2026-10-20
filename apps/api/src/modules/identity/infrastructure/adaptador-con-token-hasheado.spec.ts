/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
/**
 * El adaptador que hashea el token de sesión, sin base de datos.
 *
 * Lo que importa afirmar es lo que ve QUIEN LEE LA TABLA (el hash, nunca el token) y lo que ve
 * Better Auth (el token en claro, para que la cookie se firme con el valor correcto y la renovación
 * de la sesión no la deje inservible). La prueba de punta a punta contra PostgreSQL está en
 * `identity.e2e-spec.ts`.
 */
import type { DBAdapter, Where } from 'better-auth/types';
import { beforeEach, describe, expect, it } from 'vitest';
import { conTokenDeSesionHasheado } from './adaptador-con-token-hasheado.js';
import { hashearTokenDeSesion } from './token-de-sesion.js';

type Fila = Record<string, unknown>;

/** Un adaptador en memoria con lo justo para ver qué llega a «la base». */
function adaptadorEnMemoria() {
  const tablas: Record<string, Fila[]> = { session: [], user: [] };
  const coincide = (fila: Fila, where: Where[] | undefined): boolean =>
    (where ?? []).every((w) => {
      const v = fila[w.field];
      return Array.isArray(w.value) ? (w.value as unknown[]).includes(v) : v === w.value;
    });

  const adaptador = {
    id: 'memoria',
    create: async ({ model, data }: { model: string; data: Fila }) => {
      const fila = { id: `id-${tablas[model]?.length ?? 0}`, ...data };
      tablas[model]!.push(fila);
      return { ...fila };
    },
    findOne: async ({ model, where }: { model: string; where: Where[] }) => {
      const f = tablas[model]!.find((x) => coincide(x, where));
      return f ? { ...f } : null;
    },
    findMany: async ({ model, where }: { model: string; where?: Where[] }) =>
      tablas[model]!.filter((x) => coincide(x, where)).map((x) => ({ ...x })),
    count: async ({ model, where }: { model: string; where?: Where[] }) =>
      tablas[model]!.filter((x) => coincide(x, where)).length,
    update: async ({ model, where, update }: { model: string; where: Where[]; update: Fila }) => {
      const f = tablas[model]!.find((x) => coincide(x, where));
      if (!f) return null;
      Object.assign(f, update);
      return { ...f };
    },
    updateMany: async () => 0,
    delete: async ({ model, where }: { model: string; where: Where[] }) => {
      tablas[model] = tablas[model]!.filter((x) => !coincide(x, where));
    },
    deleteMany: async ({ model, where }: { model: string; where: Where[] }) => {
      const antes = tablas[model]!.length;
      const quedan = tablas[model]!.filter((x) => !coincide(x, where));
      tablas[model] = quedan;
      return antes - quedan.length;
    },
    consumeOne: async () => null,
    incrementOne: async () => null,
    transaction: async <R>(cb: (trx: unknown) => Promise<R>) => cb(adaptador),
  };
  return { adaptador: adaptador as unknown as DBAdapter, tablas };
}

const TOKEN = 'TokenEnClaro1234567890abcdefghijkl';

describe('conTokenDeSesionHasheado', () => {
  let tablas: Record<string, Fila[]>;
  let envuelto: DBAdapter;

  beforeEach(() => {
    const memoria = adaptadorEnMemoria();
    tablas = memoria.tablas;
    envuelto = conTokenDeSesionHasheado(memoria.adaptador);
  });

  it('guarda el hash, nunca el token, y devuelve el token a quien creó la sesión', async () => {
    const creada = await envuelto.create<Fila>({
      model: 'session',
      data: { token: TOKEN, userId: 'u1' },
    });
    expect(creada['token']).toBe(TOKEN);

    const guardada = tablas['session']![0]!;
    expect(guardada['token']).toBe(hashearTokenDeSesion(TOKEN));
    expect(guardada['token']).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(JSON.stringify(tablas)).not.toContain(TOKEN);
  });

  it('busca por el hash y devuelve el token pedido, para que la renovación firme el valor bueno', async () => {
    await envuelto.create({ model: 'session', data: { token: TOKEN, userId: 'u1' } });

    const hallada = await envuelto.findOne<Fila>({
      model: 'session',
      where: [{ field: 'token', value: TOKEN }],
    });
    expect(hallada?.['token']).toBe(TOKEN);

    const renovada = await envuelto.update<Fila>({
      model: 'session',
      where: [{ field: 'token', value: TOKEN }],
      update: { expiresAt: 'mañana' },
    });
    expect(renovada?.['token']).toBe(TOKEN);
    expect(tablas['session']![0]!['token']).toBe(hashearTokenDeSesion(TOKEN));
  });

  it('una sesión pedida por otra cosa sale con el hash, que no sirve como token', async () => {
    await envuelto.create({ model: 'session', data: { token: TOKEN, userId: 'u1' } });
    const [fila] = await envuelto.findMany<Fila>({
      model: 'session',
      where: [{ field: 'userId', value: 'u1' }],
    });
    expect(fila?.['token']).toBe(hashearTokenDeSesion(TOKEN));

    // Y presentar ese hash como si fuera el token NO encuentra nada: se vuelve a hashear.
    const conHash = await envuelto.findOne({
      model: 'session',
      where: [{ field: 'token', value: String(fila?.['token']) }],
    });
    expect(conHash).toBeNull();
  });

  it('borra por token, también en lote', async () => {
    await envuelto.create({ model: 'session', data: { token: TOKEN, userId: 'u1' } });
    await envuelto.create({ model: 'session', data: { token: `${TOKEN}-2`, userId: 'u1' } });

    await envuelto.delete({ model: 'session', where: [{ field: 'token', value: TOKEN }] });
    expect(tablas['session']).toHaveLength(1);

    const borradas = await envuelto.deleteMany({
      model: 'session',
      where: [{ field: 'token', operator: 'in', value: [`${TOKEN}-2`] }],
    });
    expect(borradas).toBe(1);
  });

  it('no toca ningún otro modelo', async () => {
    await envuelto.create({ model: 'user', data: { token: TOKEN, email: 'a@b.test' } });
    expect(tablas['user']![0]!['token']).toBe(TOKEN);
  });
});
