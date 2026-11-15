import { describe, expect, it } from 'vitest';
import {
  ClaveDeCamposHuerfanaError,
  comprobarClavesAlArrancar,
  exigirClaveParaLosDatos,
  PuertoVersionesDeClave,
  versionesSinClave,
} from './comprobacion-de-claves.js';

class Falso extends PuertoVersionesDeClave {
  constructor(private readonly v: number[]) {
    super();
  }
  versionesEnUso(): Promise<number[]> {
    return Promise.resolve(this.v);
  }
}

describe('comprobación de claves al arrancar (T-226 b)', () => {
  it('sin datos cifrados arranca', async () => {
    await expect(
      exigirClaveParaLosDatos(new Falso([]), { version: 1, tienePrevia: false }),
    ).resolves.toBeUndefined();
  });

  it('versiones cubiertas por la vigente y la previa arrancan', async () => {
    await expect(
      exigirClaveParaLosDatos(new Falso([3, 2, 3]), { version: 3, tienePrevia: true }),
    ).resolves.toBeUndefined();
  });

  it('vigente - 1 sin previa cargada es huérfana', async () => {
    await expect(
      exigirClaveParaLosDatos(new Falso([2, 3]), { version: 3, tienePrevia: false }),
    ).rejects.toBeInstanceOf(ClaveDeCamposHuerfanaError);
  });

  it('una versión huérfana aborta con mensaje que la nombra y no revela claves', async () => {
    const clave = Buffer.alloc(32, 7);
    const error = await comprobarClavesAlArrancar(new Falso([1, 3, 4]), {
      version: 4,
      anterior: clave,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ClaveDeCamposHuerfanaError);
    const { message, versionesSinClave: v } = error as ClaveDeCamposHuerfanaError;
    expect(v).toEqual([1]);
    expect(message).toContain('versión de clave 1');
    expect(message).not.toContain(clave.toString('hex'));
    expect(message).not.toContain(clave.toString('base64'));
  });

  it('una versión mayor que la vigente (configuración retrocedida) es huérfana', () => {
    expect(versionesSinClave([5], { version: 4, tienePrevia: true })).toEqual([5]);
  });

  it('ordena y no repite las huérfanas', () => {
    expect(versionesSinClave([7, 2, 7, 9], { version: 9, tienePrevia: false })).toEqual([2, 7]);
  });
});
