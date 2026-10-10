import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { abrirPayload, resolverClavePayload, sellarPayload } from './payload-sellado.js';
import { identificarRecepcion } from './identidad-recepcion.js';

const CLAVE = Buffer.alloc(32, 7);
const CUERPO = Buffer.from(
  JSON.stringify({ texto: '¿Cuánto cuesta el plan a San Andrés?', telefono: '+573001112233' }),
  'utf8',
);
const ID = identificarRecepcion(CUERPO);

describe('sellarPayload / abrirPayload', () => {
  it('lo que se cierra se vuelve a abrir igual', () => {
    const sellado = sellarPayload(CUERPO, CLAVE, ID);
    expect(abrirPayload(sellado, CLAVE, ID).equals(CUERPO)).toBe(true);
  });

  it('el texto cifrado no contiene el original', () => {
    const { cifrado } = sellarPayload(CUERPO, CLAVE, ID);
    expect(cifrado.includes(Buffer.from('San Andrés', 'utf8'))).toBe(false);
    expect(cifrado.includes(Buffer.from('573001112233', 'utf8'))).toBe(false);
  });

  it('usa un nonce distinto cada vez, aunque el cuerpo sea idéntico', () => {
    // Repetir nonce con la misma clave en GCM permite recuperar la clave de autenticación.
    const nonces = new Set(
      Array.from({ length: 50 }, () => sellarPayload(CUERPO, CLAVE, ID).nonce.toString('hex')),
    );
    expect(nonces.size).toBe(50);
  });

  it('el nonce mide 96 bits y la etiqueta 128', () => {
    const s = sellarPayload(CUERPO, CLAVE, ID);
    expect(s.nonce.length).toBe(12);
    expect(s.tag.length).toBe(16);
  });

  it('NO abre con otra clave', () => {
    const sellado = sellarPayload(CUERPO, CLAVE, ID);
    expect(() => abrirPayload(sellado, Buffer.alloc(32, 8), ID)).toThrow();
  });

  it('NO abre con el identificador de otra recepción: el criptograma está atado a su fila', () => {
    const sellado = sellarPayload(CUERPO, CLAVE, ID);
    const otraFila = identificarRecepcion(Buffer.from('otro cuerpo', 'utf8'));
    expect(() => abrirPayload(sellado, CLAVE, otraFila)).toThrow();
  });

  it('NO abre si alguien cambia un byte del texto cifrado', () => {
    const sellado = sellarPayload(CUERPO, CLAVE, ID);
    const alterado = Buffer.from(sellado.cifrado);
    alterado[0] = (alterado[0] ?? 0) ^ 0x01;
    expect(() => abrirPayload({ ...sellado, cifrado: alterado }, CLAVE, ID)).toThrow();
  });

  it('NO abre si alguien cambia la etiqueta', () => {
    const sellado = sellarPayload(CUERPO, CLAVE, ID);
    expect(() => abrirPayload({ ...sellado, tag: randomBytes(16) }, CLAVE, ID)).toThrow();
  });

  it('rechaza una clave que no mide 32 bytes', () => {
    expect(() => sellarPayload(CUERPO, Buffer.alloc(16, 1), ID)).toThrow(/32 bytes/);
  });

  it('cifra un cuerpo vacío sin romperse', () => {
    const vacio = Buffer.alloc(0);
    const sellado = sellarPayload(vacio, CLAVE, identificarRecepcion(vacio));
    expect(abrirPayload(sellado, CLAVE, identificarRecepcion(vacio)).length).toBe(0);
  });
});

describe('resolverClavePayload', () => {
  it('decodifica base64 de 32 bytes', () => {
    const clave = resolverClavePayload({ K: CLAVE.toString('base64') }, 'K');
    expect(clave.equals(CLAVE)).toBe(true);
  });

  it('acepta la clave en hexadecimal, que es como la escribe el generador', () => {
    // Esta prueba nace de un 500 a todo contra la API viva: el generador escribe hexadecimal
    // y esto leía base64, así que los 32 bytes llegaban como 48.
    const clave = resolverClavePayload({ K: CLAVE.toString('hex') }, 'K');
    expect(clave.equals(CLAVE)).toBe(true);
  });

  it('no tiene respaldo: si falta la variable, lanza', () => {
    expect(() => resolverClavePayload({}, 'K')).toThrow(/No hay respaldo/);
  });

  it('rechaza una clave de largo equivocado en vez de rellenarla', () => {
    expect(() => resolverClavePayload({ K: Buffer.alloc(16, 1).toString('base64') }, 'K')).toThrow(
      /32 bytes/,
    );
  });
});

describe('identificarRecepcion', () => {
  it('mide 32 bytes', () => {
    expect(ID.length).toBe(32);
  });

  it('el mismo cuerpo da el mismo identificador: el reintento de Meta cae en la misma fila', () => {
    expect(identificarRecepcion(CUERPO).equals(identificarRecepcion(Buffer.from(CUERPO)))).toBe(
      true,
    );
  });

  it('un byte distinto da otro identificador', () => {
    const otro = Buffer.from(CUERPO);
    otro[0] = (otro[0] ?? 0) ^ 0x01;
    expect(identificarRecepcion(otro).equals(ID)).toBe(false);
  });

  it('no deja el teléfono legible en el identificador', () => {
    expect(ID.includes(Buffer.from('573001112233', 'utf8'))).toBe(false);
  });
});
