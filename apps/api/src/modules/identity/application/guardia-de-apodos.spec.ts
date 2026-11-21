/* eslint-disable @typescript-eslint/require-await -- dobles de prueba: cumplen un puerto asíncrono sin esperar nada */
/**
 * La precondición dura de la fase 1 (ADR-0031 §4, B3): detección del índice global y apagado de la
 * función. El arranque y el PATCH contra la base real están en `apodo-ingreso.e2e-spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  hayIndiceGlobalDeApodos,
  type IndiceUnicoDeAccesos,
  PuertoCatalogoDeApodos,
} from '../domain/puertos-de-apodos.js';
import {
  AutoservicioConApodosGlobalesError,
  GuardiaDeApodos,
  registroAutoservicioHabilitado,
} from './guardia-de-apodos.js';

const indice = (parcial: Partial<IndiceUnicoDeAccesos>): IndiceUnicoDeAccesos => ({
  apodoEnClave: false,
  tenantEnClave: false,
  parcial: false,
  deExpresion: false,
  apodoEnExpresionOPredicado: false,
  ...parcial,
});

describe('hayIndiceGlobalDeApodos', () => {
  it('UNIQUE (apodo) es global (fase 1)', () => {
    expect(hayIndiceGlobalDeApodos([indice({ apodoEnClave: true })])).toBe(true);
  });

  it('UNIQUE (tenant_acceso_id, apodo) no lo es (fase 2), en cualquier orden de columnas', () => {
    expect(hayIndiceGlobalDeApodos([indice({ apodoEnClave: true, tenantEnClave: true })])).toBe(
      false,
    );
  });

  it('un índice parcial o de expresión sobre el apodo cuenta como global, aunque lleve el tenant', () => {
    expect(
      hayIndiceGlobalDeApodos([indice({ apodoEnClave: true, tenantEnClave: true, parcial: true })]),
    ).toBe(true);
    expect(
      hayIndiceGlobalDeApodos([
        indice({ tenantEnClave: true, deExpresion: true, apodoEnExpresionOPredicado: true }),
      ]),
    ).toBe(true);
    expect(
      hayIndiceGlobalDeApodos([
        indice({ tenantEnClave: true, parcial: true, apodoEnExpresionOPredicado: true }),
      ]),
    ).toBe(true);
  });

  it('un índice único que no toca el apodo (la clave primaria) no cuenta', () => {
    expect(hayIndiceGlobalDeApodos([indice({ tenantEnClave: true })])).toBe(false);
    expect(hayIndiceGlobalDeApodos([indice({ parcial: true })])).toBe(false);
    expect(hayIndiceGlobalDeApodos([])).toBe(false);
  });

  it('basta uno global entre varios', () => {
    expect(
      hayIndiceGlobalDeApodos([
        indice({ tenantEnClave: true }),
        indice({ apodoEnClave: true, tenantEnClave: true }),
        indice({ apodoEnClave: true }),
      ]),
    ).toBe(true);
  });
});

class Catalogo extends PuertoCatalogoDeApodos {
  global: boolean | Error = true;
  agencias: number | Error = 1;
  consultasDeAgencias = 0;
  async indiceDeApodosEsGlobal(): Promise<boolean> {
    if (this.global instanceof Error) throw this.global;
    return this.global;
  }
  async cuentaDeAgencias(): Promise<number> {
    this.consultasDeAgencias += 1;
    if (this.agencias instanceof Error) throw this.agencias;
    return this.agencias;
  }
}

describe('GuardiaDeApodos.estaApagada', () => {
  it('índice global y más de una agencia: apagada', async () => {
    const c = new Catalogo();
    c.agencias = 2;
    expect(await new GuardiaDeApodos(c).estaApagada()).toBe(true);
  });

  it('índice global y una sola agencia: encendida', async () => {
    const c = new Catalogo();
    c.agencias = 1;
    expect(await new GuardiaDeApodos(c).estaApagada()).toBe(false);
  });

  it('índice por agencia y más de una agencia: SIGUE apagada (el ingreso de la fase 1 resuelve sin agencia)', async () => {
    const c = new Catalogo();
    c.global = false;
    c.agencias = 2;
    expect(await new GuardiaDeApodos(c).estaApagada()).toBe(true);
    c.agencias = 50;
    expect(await new GuardiaDeApodos(c).estaApagada()).toBe(true);
  });

  it('índice por agencia y una sola agencia: encendida', async () => {
    const c = new Catalogo();
    c.global = false;
    c.agencias = 1;
    expect(await new GuardiaDeApodos(c).estaApagada()).toBe(false);
  });

  it('no depende de la forma del índice: ni siquiera lo consulta', async () => {
    const c = new Catalogo();
    c.global = new Error('no debía consultarse');
    c.agencias = 1;
    expect(await new GuardiaDeApodos(c).estaApagada()).toBe(false);
  });

  it('falla cerrado: si no se puede contar las agencias, está apagada', async () => {
    const c = new Catalogo();
    c.agencias = new Error('base caída');
    expect(await new GuardiaDeApodos(c).estaApagada()).toBe(true);
  });
});

describe('registroAutoservicioHabilitado', () => {
  it('apagado por omisión y con los valores que dicen «no»', () => {
    for (const v of [undefined, '', 'false', 'FALSE', '0', 'no', 'off', ' false ']) {
      expect(
        registroAutoservicioHabilitado({ REGISTRO_AUTOSERVICIO_HABILITADO: v }),
        String(v),
      ).toBe(false);
    }
    expect(registroAutoservicioHabilitado({})).toBe(false);
  });

  it('encendido con true, 1 y cualquier valor que no se entienda (falla cerrado)', () => {
    for (const v of ['true', 'TRUE', '1', 'si', 'talvez']) {
      expect(registroAutoservicioHabilitado({ REGISTRO_AUTOSERVICIO_HABILITADO: v }), v).toBe(true);
    }
  });
});

describe('GuardiaDeApodos.exigirAlArrancar', () => {
  it('se niega con el autoservicio activo y el índice global', async () => {
    const c = new Catalogo();
    await expect(
      new GuardiaDeApodos(c).exigirAlArrancar({ REGISTRO_AUTOSERVICIO_HABILITADO: 'true' }),
    ).rejects.toBeInstanceOf(AutoservicioConApodosGlobalesError);
  });

  it('arranca con el autoservicio activo y el índice por agencia', async () => {
    const c = new Catalogo();
    c.global = false;
    await expect(
      new GuardiaDeApodos(c).exigirAlArrancar({ REGISTRO_AUTOSERVICIO_HABILITADO: 'true' }),
    ).resolves.toBeUndefined();
  });

  it('arranca con el autoservicio apagado, sin ni consultar el catálogo', async () => {
    const c = new Catalogo();
    c.global = new Error('no debía consultarse');
    await expect(new GuardiaDeApodos(c).exigirAlArrancar({})).resolves.toBeUndefined();
  });
});
