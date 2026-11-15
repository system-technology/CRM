/**
 * ADR-0015: la primitiva de cifrado de columnas con PII sensible, sin base de datos.
 *
 * Afirma las concreciones que se pueden probar en memoria: ida y vuelta; el criptograma no abre en
 * otra agencia, otra fila, otra columna ni con otra versión (AAD y derivación); IV nuevo por
 * cifrado; formato fijo (nonce 12, etiqueta 16); rotación con la clave anterior; el claro no
 * aparece en los bytes; sin clave o sin versión no hay servicio; y un fallo no filtra contenido.
 */
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  armarAad,
  CifradoDeCampos,
  clavesDeCamposDesdeEntorno,
  derivarClave,
  etiquetaDe,
  SAL_DE_HKDF,
} from './cifrado-de-campos.js';
import { CampoCifradoIlegibleError, COLUMNAS_CIFRADAS } from './puerto-de-cifrado.js';
import { uuidV7 } from './uuid-v7.js';

const MAESTRA_V1 = randomBytes(32);
const MAESTRA_V2 = randomBytes(32);
const TENANT_A = uuidV7();
const TENANT_B = uuidV7();
const FILA = uuidV7();
const TEXTO = 'Mi pasaporte es AB123456 y mi hija nació el 2019-03-04 🧳';
const { MENSAJES_TEXTO, CONTACTOS_PREFERENCIAS, CONVERSACIONES_ULTIMO_MENSAJE_TEXTO } =
  COLUMNAS_CIFRADAS;

const v1 = new CifradoDeCampos({ version: 1, actual: MAESTRA_V1, anterior: null });

// Los fallos esperados se registran; aquí se recogen en memoria (la prueba de abajo mira qué).
let registrado: string[] = [];
beforeEach(() => {
  registrado = [];
  const apuntar = (m: unknown): void => void registrado.push(String(m));
  Logger.overrideLogger({
    log: apuntar,
    error: apuntar,
    warn: apuntar,
    debug: apuntar,
    verbose: apuntar,
  });
});
afterEach(() => {
  Logger.overrideLogger(true);
});

describe('CifradoDeCampos — ida y vuelta', () => {
  it('descifra lo que cifró, con la agencia, la fila y la columna dueñas', () => {
    const c = v1.cifrar(MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    expect(v1.descifrar(MENSAJES_TEXTO, TENANT_A, FILA, c)).toBe(TEXTO);
    expect(v1.descifrarObligatorio(MENSAJES_TEXTO, TENANT_A, FILA, c)).toBe(TEXTO);
  });

  it('el texto vacío también hace ida y vuelta (no es lo mismo que nulo)', () => {
    const c = v1.cifrar(CONTACTOS_PREFERENCIAS, TENANT_A, FILA, '');
    expect(v1.descifrar(CONTACTOS_PREFERENCIAS, TENANT_A, FILA, c)).toBe('');
  });

  it('las cuatro columnas nulas son un valor nulo, no un error', () => {
    const nulo = { cifrado: null, nonce: null, tag: null, claveVersion: null };
    expect(v1.descifrar(MENSAJES_TEXTO, TENANT_A, FILA, nulo)).toBeNull();
  });

  it('el claro no aparece en los bytes guardados, y GCM no expande', () => {
    const c = v1.cifrar(MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    expect(c.cifrado.includes(Buffer.from('AB123456'))).toBe(false);
    expect(c.cifrado.length).toBe(Buffer.byteLength(TEXTO, 'utf8'));
    expect(c.nonce.length).toBe(12);
    expect(c.tag.length).toBe(16);
    expect(c.claveVersion).toBe(1);
  });

  it('un IV nuevo por cifrado: el mismo texto dos veces da criptogramas distintos', () => {
    const a = v1.cifrar(MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    const b = v1.cifrar(MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.cifrado.equals(b.cifrado)).toBe(false);
  });
});

describe('CifradoDeCampos — el AAD y la derivación atan el criptograma', () => {
  const c = v1.cifrar(MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);

  it('no abre con el AAD de OTRA AGENCIA', () => {
    expect(() => v1.descifrar(MENSAJES_TEXTO, TENANT_B, FILA, c)).toThrow(
      CampoCifradoIlegibleError,
    );
  });

  it('no abre en OTRA FILA de la misma agencia', () => {
    expect(() => v1.descifrar(MENSAJES_TEXTO, TENANT_A, uuidV7(), c)).toThrow(
      CampoCifradoIlegibleError,
    );
  });

  it('no abre como OTRA COLUMNA (la vista previa no es el mensaje)', () => {
    expect(() => v1.descifrar(CONVERSACIONES_ULTIMO_MENSAJE_TEXTO, TENANT_A, FILA, c)).toThrow(
      CampoCifradoIlegibleError,
    );
  });

  it('no abre si un byte del criptograma, del nonce o de la etiqueta cambia', () => {
    for (const campo of ['cifrado', 'nonce', 'tag'] as const) {
      const manipulado = { ...c, [campo]: Buffer.from(c[campo]) };
      manipulado[campo][0] = (manipulado[campo][0] ?? 0) ^ 0x01;
      expect(() => v1.descifrar(MENSAJES_TEXTO, TENANT_A, FILA, manipulado), campo).toThrow(
        CampoCifradoIlegibleError,
      );
    }
  });

  it('no abre con columnas a medias (la base lo impide con un CHECK; esto es la segunda barrera)', () => {
    expect(() =>
      v1.descifrar(MENSAJES_TEXTO, TENANT_A, FILA, { ...c, claveVersion: null }),
    ).toThrow(CampoCifradoIlegibleError);
  });

  it('la clave derivada es distinta por agencia, por columna y por versión', () => {
    const base = derivarClave(MAESTRA_V1, MENSAJES_TEXTO, TENANT_A, 1);
    expect(base.length).toBe(32);
    expect(base.equals(derivarClave(MAESTRA_V1, MENSAJES_TEXTO, TENANT_B, 1))).toBe(false);
    expect(base.equals(derivarClave(MAESTRA_V1, CONTACTOS_PREFERENCIAS, TENANT_A, 1))).toBe(false);
    expect(base.equals(derivarClave(MAESTRA_V1, MENSAJES_TEXTO, TENANT_A, 2))).toBe(false);
  });

  it('la derivación es HKDF-SHA256 con la sal fija e info = etiqueta ‖ tenant (RFC 5869, a mano)', () => {
    const info = Buffer.concat([
      Buffer.from('viajapro/mensajes.texto/v1/', 'utf8'),
      Buffer.from(TENANT_A.replace(/-/g, ''), 'hex'),
    ]);
    const prk = createHmac('sha256', SAL_DE_HKDF).update(MAESTRA_V1).digest();
    const okm = createHmac('sha256', prk)
      .update(Buffer.concat([info, Buffer.from([1])]))
      .digest();
    expect(derivarClave(MAESTRA_V1, MENSAJES_TEXTO, TENANT_A, 1).equals(okm)).toBe(true);
    expect(SAL_DE_HKDF.length).toBe(32);
  });

  it('el AAD es etiqueta ‖ tenant (16) ‖ fila (16) ‖ código de columna (1)', () => {
    const aad = armarAad(MENSAJES_TEXTO, 1, TENANT_A, FILA);
    const etiqueta = etiquetaDe(MENSAJES_TEXTO, 1);
    expect(etiqueta).toBe('viajapro/mensajes.texto/v1/');
    expect(aad.length).toBe(Buffer.byteLength(etiqueta) + 16 + 16 + 1);
    expect(aad.subarray(-33, -17).toString('hex')).toBe(TENANT_A.replace(/-/g, ''));
    expect(aad.subarray(-17, -1).toString('hex')).toBe(FILA.replace(/-/g, ''));
    expect(aad.at(-1)).toBe(1);
    expect(armarAad(CONTACTOS_PREFERENCIAS, 1, TENANT_A, FILA).at(-1)).toBe(3);
  });

  it('rechaza un id que no sea UUID: el AAD no admite ambigüedad', () => {
    expect(() => v1.cifrar(MENSAJES_TEXTO, 'agencia-a', FILA, TEXTO)).toThrow(/UUID/);
  });
});

describe('CifradoDeCampos — versión de clave y rotación', () => {
  const deV1 = v1.cifrar(MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
  const v2 = new CifradoDeCampos({ version: 2, actual: MAESTRA_V2, anterior: MAESTRA_V1 });

  it('cifra con la vigente y lo marca con su versión', () => {
    expect(v2.cifrar(MENSAJES_TEXTO, TENANT_A, FILA, TEXTO).claveVersion).toBe(2);
  });

  it('durante la rotación abre lo de la versión anterior con la clave anterior', () => {
    expect(v2.descifrar(MENSAJES_TEXTO, TENANT_A, FILA, deV1)).toBe(TEXTO);
  });

  it('sin la anterior configurada, lo de v1 no abre (y no se prueba con la vigente)', () => {
    const soloV2 = new CifradoDeCampos({ version: 2, actual: MAESTRA_V2, anterior: null });
    expect(() => soloV2.descifrar(MENSAJES_TEXTO, TENANT_A, FILA, deV1)).toThrow(
      CampoCifradoIlegibleError,
    );
  });

  it('una versión que no es la vigente ni la anterior no tiene clave', () => {
    const v3 = new CifradoDeCampos({ version: 3, actual: MAESTRA_V2, anterior: MAESTRA_V1 });
    expect(() => v3.descifrar(MENSAJES_TEXTO, TENANT_A, FILA, deV1)).toThrow(
      CampoCifradoIlegibleError,
    );
  });

  it('cambiar la versión escrita en la fila no engaña: la versión está en la etiqueta del AAD', () => {
    // Misma maestra para v1 y v2: solo cambia la etiqueta, y basta para que no abra.
    const misma = new CifradoDeCampos({ version: 2, actual: MAESTRA_V1, anterior: MAESTRA_V1 });
    expect(() =>
      misma.descifrar(MENSAJES_TEXTO, TENANT_A, FILA, { ...deV1, claveVersion: 2 }),
    ).toThrow(CampoCifradoIlegibleError);
  });
});

describe('CifradoDeCampos — un fallo no filtra nada', () => {
  it('registra Clase:código y la columna, sin contenido, sin agencia y sin fila', () => {
    const c = v1.cifrar(MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    let lanzado: unknown;
    try {
      v1.descifrar(MENSAJES_TEXTO, TENANT_B, FILA, c);
    } catch (e) {
      lanzado = e;
    }
    expect(lanzado).toBeInstanceOf(CampoCifradoIlegibleError);
    expect((lanzado as CampoCifradoIlegibleError).code).toBe('CAMPO_CIFRADO_ILEGIBLE');
    const texto = registrado.join('\n');
    expect(texto).toContain('CampoCifradoIlegibleError:CAMPO_CIFRADO_ILEGIBLE');
    for (const secreto of ['AB123456', TENANT_A, TENANT_B, FILA]) {
      expect(texto).not.toContain(secreto);
      expect((lanzado as Error).message).not.toContain(secreto);
    }
  });
});

describe('clavesDeCamposDesdeEntorno — sin respaldo (concreción 4)', () => {
  const hex = randomBytes(32).toString('hex');

  it('sin CAMPOS_SENSIBLES_KEY no hay configuración', () => {
    expect(() => clavesDeCamposDesdeEntorno({ CAMPOS_SENSIBLES_KEY_VERSION: '1' })).toThrow(
      /Falta CAMPOS_SENSIBLES_KEY/,
    );
  });

  it('sin versión, o con una versión inválida, tampoco', () => {
    for (const v of [undefined, '', '0', '-1', '1.5', 'uno']) {
      expect(() =>
        clavesDeCamposDesdeEntorno({ CAMPOS_SENSIBLES_KEY: hex, CAMPOS_SENSIBLES_KEY_VERSION: v }),
      ).toThrow(/CAMPOS_SENSIBLES_KEY_VERSION/);
    }
  });

  it('acepta hexadecimal y base64; una clave que no mide 32 bytes no construye el servicio', () => {
    const deHex = clavesDeCamposDesdeEntorno({
      CAMPOS_SENSIBLES_KEY: hex,
      CAMPOS_SENSIBLES_KEY_VERSION: '3',
    });
    expect(deHex.actual.toString('hex')).toBe(hex);
    expect(deHex.version).toBe(3);
    expect(deHex.anterior).toBeNull();
    const b64 = Buffer.from(hex, 'hex').toString('base64');
    expect(
      clavesDeCamposDesdeEntorno({
        CAMPOS_SENSIBLES_KEY: b64,
        CAMPOS_SENSIBLES_KEY_VERSION: '1',
        CAMPOS_SENSIBLES_KEY_PREVIOUS: hex,
      }).anterior?.toString('hex'),
    ).toBe(hex);

    const corta = clavesDeCamposDesdeEntorno({
      CAMPOS_SENSIBLES_KEY: randomBytes(16).toString('base64'),
      CAMPOS_SENSIBLES_KEY_VERSION: '1',
    });
    expect(() => new CifradoDeCampos(corta)).toThrow(/32 bytes/);
  });

  it('el mensaje de error nunca lleva la clave', () => {
    const corta = randomBytes(16).toString('base64');
    try {
      new CifradoDeCampos(
        clavesDeCamposDesdeEntorno({
          CAMPOS_SENSIBLES_KEY: corta,
          CAMPOS_SENSIBLES_KEY_VERSION: '1',
        }),
      );
    } catch (e) {
      expect((e as Error).message).not.toContain(corta);
    }
  });
});

describe('uuidV7', () => {
  it('versión 7, variante RFC, y ordenable por el instante', () => {
    const a = uuidV7(1_700_000_000_000);
    const b = uuidV7(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(a.replace(/-/g, '').slice(0, 12)).toBe(
      (1_700_000_000_000).toString(16).padStart(12, '0'),
    );
    expect(uuidV7()).not.toBe(uuidV7());
    // Y es un UUID que el AAD acepta.
    expect(() => v1.cifrar(MENSAJES_TEXTO, randomUUID(), uuidV7(), 'x')).not.toThrow();
  });
});
