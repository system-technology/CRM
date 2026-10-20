/**
 * Pruebas del guardia de identidad de rol.
 *
 * Son las primeras pruebas de `apps/api`, y existen por una razón concreta: el ADR-0008 dice
 * que **una protección sin una aserción que la ponga en rojo no es una protección**. Este
 * guardia es la única defensa contra apuntar un proceso al rol equivocado, y ninguna aserción
 * de base de datos puede cubrirlo.
 */

import { describe, expect, it } from 'vitest';
import {
  ROLES_DE_CONEXION,
  resolverCadena,
  verificarIdentidad,
  verificarSinPrivilegiosDeNegocio,
} from './guardia-de-rol.js';

const sano = { usuario: 'viajapro_app', esSuperusuario: false, saltaRls: false };

describe('verificarIdentidad', () => {
  it('acepta el rol esperado sin privilegios de más', () => {
    expect(verificarIdentidad(sano, 'viajapro_app')).toBeNull();
  });

  it('acepta cada uno de los roles de login cuando es el que toca', () => {
    expect(
      verificarIdentidad({ ...sano, usuario: 'viajapro_webhook' }, 'viajapro_webhook'),
    ).toBeNull();
    expect(verificarIdentidad({ ...sano, usuario: 'viajapro_altas' }, 'viajapro_altas')).toBeNull();
  });

  /**
   * El caso que motiva todo el archivo: `DATABASE_APP_URL` apuntando al rol de altas.
   * Es un copiar y pegar entre dos bloques contiguos del `.env`, los privilegios sobre las
   * tablas son idénticos, y le devuelve a toda la API la capacidad de repuntar el número de
   * cualquier agencia.
   */
  it('RECHAZA el rol de altas donde se esperaba el de la aplicación', () => {
    const motivo = verificarIdentidad({ ...sano, usuario: 'viajapro_altas' }, 'viajapro_app');
    expect(motivo).toContain('viajapro_altas');
    expect(motivo).toContain('viajapro_app');
  });

  it('RECHAZA el rol de la aplicación donde se esperaba el del webhook', () => {
    expect(verificarIdentidad(sano, 'viajapro_webhook')).not.toBeNull();
  });

  /**
   * El agujero que la comprobación anterior dejaba abierto: un superusuario responde
   * `rolbypassrls = false` porque no necesita el atributo. En local y en CI el rol de
   * migraciones ES superusuario, así que ahí la defensa no existía.
   */
  it('RECHAZA un superusuario aunque NO tenga BYPASSRLS', () => {
    const motivo = verificarIdentidad(
      { usuario: 'viajapro_app', esSuperusuario: true, saltaRls: false },
      'viajapro_app',
    );
    expect(motivo).toContain('superusuario');
  });

  it('RECHAZA un rol con BYPASSRLS', () => {
    const motivo = verificarIdentidad({ ...sano, saltaRls: true }, 'viajapro_app');
    expect(motivo).toContain('BYPASSRLS');
  });

  it('comprueba la identidad ANTES que los atributos', () => {
    // Un rol equivocado que además es superusuario debe delatarse por lo primero: el nombre
    // es lo accionable —«revisa la variable»—, y el atributo es consecuencia.
    const motivo = verificarIdentidad(
      { usuario: 'postgres', esSuperusuario: true, saltaRls: true },
      'viajapro_app',
    );
    expect(motivo).toContain('postgres');
    expect(motivo).not.toContain('superusuario');
  });
});

describe('resolverCadena', () => {
  it('devuelve la cadena cuando está definida', () => {
    expect(resolverCadena({ DATABASE_APP_URL: 'postgres://x' }, 'DATABASE_APP_URL')).toBe(
      'postgres://x',
    );
  });

  /**
   * **No hay respaldo, y es deliberado.** La versión anterior hacía
   * `DATABASE_APP_URL ?? DATABASE_URL`, que al activarse conectaba la aplicación con el rol
   * propietario sin producir ningún error. Es la misma forma que el `??` de la prueba de
   * aislamiento y que el escape por `CI=true` del script de roles: **el respaldo cómodo es el
   * agujero**.
   */
  it('LANZA si falta la variable, en vez de caer a otra cadena', () => {
    expect(() => resolverCadena({ DATABASE_URL: 'postgres://dueño' }, 'DATABASE_APP_URL')).toThrow(
      /Falta DATABASE_APP_URL/,
    );
  });

  it('LANZA si la variable está vacía', () => {
    expect(() => resolverCadena({ DATABASE_APP_URL: '' }, 'DATABASE_APP_URL')).toThrow();
  });
});

describe('rol de identidad (ADR-0011)', () => {
  it('es uno de los roles de login, con el mismo rigor que los otros', () => {
    expect(ROLES_DE_CONEXION).toContain('viajapro_identidad');
    const identidad = { ...sano, usuario: 'viajapro_identidad' };
    expect(verificarIdentidad(identidad, 'viajapro_identidad')).toBeNull();
    expect(
      verificarIdentidad({ ...identidad, esSuperusuario: true }, 'viajapro_identidad'),
    ).toMatch(/superusuario/);
    expect(verificarIdentidad({ ...identidad, saltaRls: true }, 'viajapro_identidad')).toMatch(
      /BYPASSRLS/,
    );
  });

  it('el pool de identidad no arranca como el rol de la API, ni al revés', () => {
    expect(verificarIdentidad({ ...sano, usuario: 'viajapro_app' }, 'viajapro_identidad')).toMatch(
      /debe conectarse como 'viajapro_identidad'/,
    );
    expect(verificarIdentidad({ ...sano, usuario: 'viajapro_identidad' }, 'viajapro_app')).toMatch(
      /debe conectarse como 'viajapro_app'/,
    );
  });

  it('se niega a arrancar si el rol de identidad lee alguna tabla de negocio', () => {
    expect(verificarSinPrivilegiosDeNegocio([])).toBeNull();
    expect(verificarSinPrivilegiosDeNegocio(['usuarios', 'mensajes'])).toMatch(
      /usuarios, mensajes/,
    );
  });
});
