import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CifradoDeCampos, clavesDeCamposDesdeEntorno } from './cifrado-de-campos.js';
import {
  CampoCifradoIlegibleError,
  COLUMNAS_CIFRADAS as C,
  type CampoCifrado,
} from './puerto-de-cifrado.js';

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const FILA = randomUUID();
const TEXTO = 'Mi hijo nació el 3 de mayo, pasaporte AB123456, es celíaco.';

function servicio(
  version = 1,
  actual: Buffer = randomBytes(32),
  anterior: Buffer | null = null,
): CifradoDeCampos {
  return new CifradoDeCampos({ version, actual, anterior });
}

function abre(
  s: CifradoDeCampos,
  c: CampoCifrado,
  col: (typeof C)[keyof typeof C] = C.MENSAJES_TEXTO,
  t: string = TENANT_A,
  f: string = FILA,
): string {
  return s.descifrar(col, t, f, c);
}

function volteado(b: Buffer): Buffer {
  const copia = Buffer.from(b);
  copia[0] = (copia[0] ?? 0) ^ 1;
  return copia;
}

describe('CifradoDeCampos', () => {
  it('ida y vuelta, también con Unicode y cadena vacía', () => {
    const s = servicio();
    for (const claro of [TEXTO, '', 'ñandú 😀 日本語']) {
      expect(abre(s, s.cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, claro))).toBe(claro);
    }
  });

  it('el criptograma no contiene el texto y lleva nonce de 12, etiqueta de 16 y la versión', () => {
    const s = servicio(3);
    const c = s.cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    expect(c.cifrado.toString('utf8')).not.toContain('pasaporte');
    expect(c.nonce).toHaveLength(12);
    expect(c.tag).toHaveLength(16);
    expect(c.claveVersion).toBe(3);
  });

  it('nunca reutiliza un nonce entre llamadas, ni cifra igual el mismo texto', () => {
    const s = servicio();
    const nonces = new Set<string>();
    const cifrados = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const c = s.cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
      nonces.add(c.nonce.toString('hex'));
      cifrados.add(c.cifrado.toString('hex'));
    }
    expect(nonces.size).toBe(5000);
    expect(cifrados.size).toBe(5000);
  });

  it('un criptograma trasplantado a OTRA FILA no abre', () => {
    const s = servicio();
    const c = s.cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    expect(() => abre(s, c, C.MENSAJES_TEXTO, TENANT_A, randomUUID())).toThrow(
      CampoCifradoIlegibleError,
    );
  });

  it('un criptograma trasplantado a OTRO TENANT no abre, ni con la misma fila', () => {
    const s = servicio();
    const c = s.cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    expect(() => abre(s, c, C.MENSAJES_TEXTO, TENANT_B)).toThrow(CampoCifradoIlegibleError);
  });

  it('un criptograma trasplantado a OTRA COLUMNA no abre, ni con la misma fila y agencia', () => {
    const s = servicio();
    const c = s.cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    for (const otra of [
      C.CONVERSACIONES_ULTIMO_MENSAJE_TEXTO,
      C.CONTACTOS_PREFERENCIAS,
      C.NOTAS_INTERNAS_TEXTO,
      C.ADJUNTOS_NOMBRE_ARCHIVO,
    ]) {
      expect(() => abre(s, c, otra)).toThrow(CampoCifradoIlegibleError);
    }
  });

  it('una fila manipulada (cifrado, etiqueta, nonce o versión) no abre', () => {
    const s = servicio(2, randomBytes(32), randomBytes(32));
    const c = s.cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    expect(() => abre(s, { ...c, cifrado: volteado(c.cifrado) })).toThrow();
    expect(() => abre(s, { ...c, tag: volteado(c.tag) })).toThrow();
    expect(() => abre(s, { ...c, nonce: volteado(c.nonce) })).toThrow();
    expect(() => abre(s, { ...c, claveVersion: 1 })).toThrow();
    expect(() => abre(s, { ...c, nonce: c.nonce.subarray(0, 11) })).toThrow();
  });

  it('el mismo texto en dos agencias da criptogramas distintos y cada uno solo abre en la suya', () => {
    const s = servicio();
    const a = s.cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    const b = s.cifrar(C.MENSAJES_TEXTO, TENANT_B, FILA, TEXTO);
    expect(a.cifrado.equals(b.cifrado)).toBe(false);
    expect(abre(s, b, C.MENSAJES_TEXTO, TENANT_B)).toBe(TEXTO);
    expect(() => abre(s, a, C.MENSAJES_TEXTO, TENANT_B)).toThrow();
  });

  describe('rotación', () => {
    it('la versión anterior descifra y lo nuevo se cifra con la vigente', () => {
      const v1 = randomBytes(32);
      const v2 = randomBytes(32);
      const viejo = servicio(1, v1).cifrar(C.NOTAS_INTERNAS_TEXTO, TENANT_A, FILA, TEXTO);
      const rotado = servicio(2, v2, v1);
      expect(abre(rotado, viejo, C.NOTAS_INTERNAS_TEXTO)).toBe(TEXTO);
      expect(rotado.cifrar(C.NOTAS_INTERNAS_TEXTO, TENANT_A, FILA, TEXTO).claveVersion).toBe(2);
    });

    it('sin la clave anterior configurada, lo viejo no abre', () => {
      const viejo = servicio(1, randomBytes(32)).cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
      expect(() => abre(servicio(2, randomBytes(32), null), viejo)).toThrow(
        CampoCifradoIlegibleError,
      );
    });

    it('la clave anterior solo vale para la versión inmediatamente anterior', () => {
      const v1 = randomBytes(32);
      const viejo = servicio(1, v1).cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
      expect(() => abre(servicio(3, randomBytes(32), v1), viejo)).toThrow();
    });
  });

  describe('descifrarNulable', () => {
    const s = servicio();
    const nulos = { cifrado: null, nonce: null, tag: null, claveVersion: null };

    it('las cuatro nulas dan null', () => {
      expect(s.descifrarNulable(C.MENSAJES_TEXTO, TENANT_A, FILA, nulos)).toBeNull();
    });

    it('presentes dan el texto; a medias lanza', () => {
      const c = s.cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
      expect(s.descifrarNulable(C.MENSAJES_TEXTO, TENANT_A, FILA, c)).toBe(TEXTO);
      expect(() =>
        s.descifrarNulable(C.MENSAJES_TEXTO, TENANT_A, FILA, { ...c, tag: null }),
      ).toThrow(CampoCifradoIlegibleError);
    });
  });

  it('el error no lleva contenido ni identificadores, y el cifrado rechaza ids que no son UUID', () => {
    const s = servicio();
    const c = s.cifrar(C.MENSAJES_TEXTO, TENANT_A, FILA, TEXTO);
    let mensaje = '';
    try {
      abre(s, c, C.MENSAJES_TEXTO, TENANT_B);
    } catch (e) {
      mensaje = e instanceof Error ? e.message : '';
    }
    expect(mensaje).toBe('No se pudo descifrar mensajes.texto.');
    expect(mensaje).not.toContain(TENANT_B);
    expect(() => s.cifrar(C.MENSAJES_TEXTO, TENANT_A, 'no-es-uuid', TEXTO)).toThrow();
  });

  it('rechaza una clave que no mide 32 bytes sin ponerla en el mensaje', () => {
    let mensaje = '';
    try {
      servicio(1, Buffer.from('secreto-corto-visible'));
    } catch (e) {
      mensaje = e instanceof Error ? e.message : '';
    }
    expect(mensaje).toMatch(/32 bytes/);
    expect(mensaje).not.toContain('secreto-corto-visible');
  });
});

describe('clavesDeCamposDesdeEntorno', () => {
  const hex = randomBytes(32).toString('hex');

  it('aborta sin CAMPOS_SENSIBLES_KEY, sin respaldo', () => {
    expect(() => clavesDeCamposDesdeEntorno({})).toThrow(/Falta CAMPOS_SENSIBLES_KEY/);
    expect(() =>
      clavesDeCamposDesdeEntorno({ CAMPOS_SENSIBLES_KEY: '', CAMPOS_SENSIBLES_KEY_VERSION: '1' }),
    ).toThrow(/Falta CAMPOS_SENSIBLES_KEY/);
  });

  it('aborta sin una versión entera >= 1', () => {
    for (const v of [undefined, '', '0', '-1', '1.5', 'x']) {
      expect(() =>
        clavesDeCamposDesdeEntorno({ CAMPOS_SENSIBLES_KEY: hex, CAMPOS_SENSIBLES_KEY_VERSION: v }),
      ).toThrow(/VERSION/);
    }
  });

  it('acepta hex o base64 y la anterior opcional; el servicio exige 32 bytes', () => {
    const b64 = randomBytes(32).toString('base64');
    const k = clavesDeCamposDesdeEntorno({
      CAMPOS_SENSIBLES_KEY: hex,
      CAMPOS_SENSIBLES_KEY_VERSION: '2',
      CAMPOS_SENSIBLES_KEY_PREVIOUS: b64,
    });
    expect(k.version).toBe(2);
    expect(k.actual).toHaveLength(32);
    expect(k.anterior).toHaveLength(32);
    expect(() => new CifradoDeCampos(k)).not.toThrow();
    const corta = clavesDeCamposDesdeEntorno({
      CAMPOS_SENSIBLES_KEY: 'AAAA',
      CAMPOS_SENSIBLES_KEY_VERSION: '1',
    });
    expect(() => new CifradoDeCampos(corta)).toThrow(/32 bytes/);
  });
});
