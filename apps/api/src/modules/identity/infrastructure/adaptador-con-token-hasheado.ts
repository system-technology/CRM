/**
 * Envuelve el adaptador de base de datos de Better Auth para que el token de sesión se guarde
 * hasheado, sin que Better Auth lo note. Ver `token-de-sesion.ts` para el porqué.
 *
 * **Dónde se coloca.** Envuelve el adaptador YA construido, así que habla en los nombres que usa
 * Better Auth (`model: 'session'`, `field: 'token'`) y no en los de nuestras tablas.
 * Better Auth sigue creyendo que maneja el token en claro:
 *
 *   · **Al crear**, guarda `sha256(token)` y devuelve la fila con el token EN CLARO, para que la
 *     cookie se firme con el valor que el navegador va a presentar.
 *   · **Al buscar o modificar por token** (`where token = X`), busca por `sha256(X)`, y a la fila
 *     que vuelve le devuelve el token `X`. Eso importa en la renovación de la sesión: Better
 *     Auth vuelve a emitir la cookie con el token que lee de la fila, y si fuera el hash la
 *     cookie quedaría inservible en la petición siguiente.
 *   · Una fila que NO se pidió por token (por ejemplo, las sesiones de una identidad) sale con
 *     el hash. Nadie puede usar ese valor como token, y es lo que se quiere.
 *
 * **Lo que no hace, a propósito:** no reconoce un hash ya hasheado. Si lo hiciera, quien
 * poseyera el secreto de las cookies y una copia de la tabla podría presentar el hash tal cual.
 * La consecuencia es que **las sesiones se revocan por identidad o por id, no por token leído de
 * la base** (`deleteSessions(identidadId)`); hay una prueba que lo fija.
 */
import type { DBAdapter, Where } from 'better-auth/types';
import { hashearTokenDeSesion } from './token-de-sesion.js';

const MODELO_SESION = 'session';
const CAMPO_TOKEN = 'token';

type Fila = Record<string, unknown>;

function hashearDondeToken(where: Where[] | undefined): {
  where: Where[] | undefined;
  alReves: Map<string, string>;
} {
  const alReves = new Map<string, string>();
  if (!where) return { where, alReves };
  const nuevo = where.map((condicion) => {
    if (condicion.field !== CAMPO_TOKEN) return condicion;
    const valor = condicion.value;
    if (typeof valor === 'string') {
      const hash = hashearTokenDeSesion(valor);
      alReves.set(hash, valor);
      return { ...condicion, value: hash };
    }
    if (Array.isArray(valor)) {
      return {
        ...condicion,
        value: valor.map((v) => {
          if (typeof v !== 'string') return v;
          const hash = hashearTokenDeSesion(v);
          alReves.set(hash, v);
          return hash;
        }),
      };
    }
    return condicion;
  });
  return { where: nuevo as Where[], alReves };
}

/** Devuelve el token en claro a las filas que se pidieron por él. El resto queda hasheado. */
function destapar<T>(fila: T, alReves: Map<string, string>): T {
  if (alReves.size === 0 || fila === null || typeof fila !== 'object') return fila;
  const f = fila as Fila;
  const token = f[CAMPO_TOKEN];
  if (typeof token !== 'string') return fila;
  const enClaro = alReves.get(token);
  return enClaro === undefined ? fila : ({ ...f, [CAMPO_TOKEN]: enClaro } as T);
}

export function conTokenDeSesionHasheado<A extends DBAdapter>(base: A): A {
  const esSesion = (modelo: string): boolean => modelo === MODELO_SESION;

  const envuelto: DBAdapter = {
    ...base,

    create: async (datos) => {
      if (!esSesion(datos.model)) return base.create(datos);
      const enClaro = (datos.data as Fila)[CAMPO_TOKEN];
      if (typeof enClaro !== 'string') return base.create(datos);
      const creada = await base.create({
        ...datos,
        data: { ...datos.data, [CAMPO_TOKEN]: hashearTokenDeSesion(enClaro) },
      });
      return { ...(creada as Fila), [CAMPO_TOKEN]: enClaro } as never;
    },

    findOne: async (datos) => {
      if (!esSesion(datos.model)) return base.findOne(datos);
      const { where, alReves } = hashearDondeToken(datos.where);
      return destapar(await base.findOne({ ...datos, where: where ?? datos.where }), alReves);
    },

    findMany: async (datos) => {
      if (!esSesion(datos.model)) return base.findMany(datos);
      const { where, alReves } = hashearDondeToken(datos.where);
      const filas = await base.findMany({ ...datos, ...(where ? { where } : {}) });
      return filas.map((f) => destapar(f, alReves));
    },

    count: async (datos) => {
      if (!esSesion(datos.model)) return base.count(datos);
      const { where } = hashearDondeToken(datos.where);
      return base.count({ ...datos, ...(where ? { where } : {}) });
    },

    update: async (datos) => {
      if (!esSesion(datos.model)) return base.update(datos);
      const { where, alReves } = hashearDondeToken(datos.where);
      return destapar(await base.update({ ...datos, where: where ?? datos.where }), alReves);
    },

    updateMany: async (datos) => {
      if (!esSesion(datos.model)) return base.updateMany(datos);
      const { where } = hashearDondeToken(datos.where);
      return base.updateMany({ ...datos, where: where ?? datos.where });
    },

    delete: async (datos) => {
      if (!esSesion(datos.model)) return base.delete(datos);
      const { where } = hashearDondeToken(datos.where);
      return base.delete({ ...datos, where: where ?? datos.where });
    },

    deleteMany: async (datos) => {
      if (!esSesion(datos.model)) return base.deleteMany(datos);
      const { where } = hashearDondeToken(datos.where);
      return base.deleteMany({ ...datos, where: where ?? datos.where });
    },

    consumeOne: async (datos) => {
      if (!esSesion(datos.model)) return base.consumeOne(datos);
      const { where, alReves } = hashearDondeToken(datos.where);
      return destapar(await base.consumeOne({ ...datos, where: where ?? datos.where }), alReves);
    },

    incrementOne: async (datos) => {
      if (!esSesion(datos.model)) return base.incrementOne(datos);
      const { where, alReves } = hashearDondeToken(datos.where);
      return destapar(await base.incrementOne({ ...datos, where: where ?? datos.where }), alReves);
    },

    transaction: (callback) =>
      base.transaction((trx) => callback(conTokenDeSesionHasheado(trx as unknown as A) as never)),
  };

  return envuelto as A;
}
