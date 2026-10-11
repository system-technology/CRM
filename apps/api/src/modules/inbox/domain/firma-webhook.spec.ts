/**
 * Pruebas de la verificación de firma.
 *
 * Es la frontera entre «esto viene de Meta» y «esto lo manda cualquiera». Lo que importa aquí
 * no es que acepte una firma buena —eso es fácil— sino que **rechace todas las malas**, y en
 * particular la que solo aparece en producción: la del cuerpo reserializado.
 */

import { describe, expect, it } from 'vitest';
import { firmar, verificarFirma } from './firma-webhook.js';

const SECRETO = 'un-app-secret-de-prueba';
const cuerpo = (texto: string): Buffer => Buffer.from(texto, 'utf8');

describe('verificarFirma', () => {
  it('acepta un cuerpo firmado con el mismo secreto', () => {
    const b = cuerpo('{"object":"whatsapp_business_account"}');
    expect(verificarFirma(b, firmar(b, SECRETO), SECRETO)).toEqual({ valida: true });
  });

  /**
   * **La prueba que justifica todo el archivo.**
   *
   * Meta serializa los caracteres no ASCII con escapes Unicode. Si alguien parsea el cuerpo y
   * lo vuelve a serializar —que es lo que ocurre si se usa `req.body` en vez del Buffer
   * original— los bytes cambian y la firma deja de coincidir.
   *
   * El modo de fallo es cruel: todo funciona hasta que un cliente escribe con tilde. Es decir,
   * en producción y en español, nunca en una prueba escrita en inglés.
   */
  it('RECHAZA el cuerpo reserializado cuando hay caracteres no ASCII', () => {
    const comoLoManda = cuerpo('{"texto":"\\u00bfCu\\u00e1nto cuesta?"}');
    const firma = firmar(comoLoManda, SECRETO);

    // Esto es lo que produce `JSON.stringify(JSON.parse(cuerpo))`: mismo significado, otros bytes.
    const reserializado = cuerpo(JSON.stringify(JSON.parse(comoLoManda.toString('utf8'))));
    expect(reserializado.equals(comoLoManda)).toBe(false);

    expect(verificarFirma(comoLoManda, firma, SECRETO)).toEqual({ valida: true });
    expect(verificarFirma(reserializado, firma, SECRETO)).toEqual({
      valida: false,
      motivo: 'NO_COINCIDE',
    });
  });

  it('acepta emojis y tildes mientras los bytes sean los originales', () => {
    const b = cuerpo('{"texto":"¿Cuánto cuesta? 🏖️ Niño de 3 años"}');
    expect(verificarFirma(b, firmar(b, SECRETO), SECRETO)).toEqual({ valida: true });
  });

  it('RECHAZA una firma hecha con otro secreto', () => {
    const b = cuerpo('{"a":1}');
    expect(verificarFirma(b, firmar(b, 'otro-secreto'), SECRETO)).toEqual({
      valida: false,
      motivo: 'NO_COINCIDE',
    });
  });

  it('RECHAZA si el cuerpo cambió aunque sea un byte', () => {
    const original = cuerpo('{"monto":100000}');
    const firma = firmar(original, SECRETO);
    expect(verificarFirma(cuerpo('{"monto":900000}'), firma, SECRETO)).toEqual({
      valida: false,
      motivo: 'NO_COINCIDE',
    });
  });

  /**
   * Sin secreto no hay forma de comprobar nada. Aceptar «porque no hay con qué verificar»
   * convertiría una variable de entorno olvidada en un endpoint abierto a cualquiera.
   */
  it('RECHAZA cuando falta el App Secret, en vez de dar por buena la petición', () => {
    const b = cuerpo('{"a":1}');
    expect(verificarFirma(b, firmar(b, SECRETO), undefined)).toEqual({
      valida: false,
      motivo: 'SECRETO_AUSENTE',
    });
    expect(verificarFirma(b, firmar(b, SECRETO), '')).toEqual({
      valida: false,
      motivo: 'SECRETO_AUSENTE',
    });
  });

  it('RECHAZA sin cabecera', () => {
    expect(verificarFirma(cuerpo('{"a":1}'), undefined, SECRETO)).toEqual({
      valida: false,
      motivo: 'FALTA_CABECERA',
    });
  });

  it('RECHAZA un cuerpo vacío', () => {
    const b = Buffer.alloc(0);
    expect(verificarFirma(b, firmar(b, SECRETO), SECRETO)).toEqual({
      valida: false,
      motivo: 'CUERPO_VACIO',
    });
  });

  describe('forma de la cabecera', () => {
    const b = cuerpo('{"a":1}');
    const valida = firmar(b, SECRETO);
    const soloHex = valida.slice('sha256='.length);

    it.each([
      ['sin el prefijo sha256=', soloHex],
      ['con otro algoritmo', `sha1=${soloHex}`],
      ['en mayúsculas', `sha256=${soloHex.toUpperCase()}`],
      ['demasiado corta', `sha256=${soloHex.slice(0, 32)}`],
      ['demasiado larga', `sha256=${soloHex}00`],
      ['con caracteres no hexadecimales', `sha256=${'z'.repeat(64)}`],
      ['vacía tras el prefijo', 'sha256='],
    ])('RECHAZA por formato: %s', (_caso, cabecera) => {
      expect(verificarFirma(b, cabecera, SECRETO)).toEqual({
        valida: false,
        motivo: 'FORMATO_INVALIDO',
      });
    });
  });

  /**
   * `Buffer.from(x, 'hex')` descarta en silencio lo que no sea hexadecimal. Sin validar la
   * forma antes, una cabecera basura produciría un buffer corto y el rechazo se registraría
   * como «no coincide» en vez de «formato inválido» — mismo resultado, motivo engañoso. Y en
   * un incidente el motivo registrado es lo único que se tiene.
   */
  it('distingue formato inválido de firma que no coincide', () => {
    const b = cuerpo('{"a":1}');
    const basura = verificarFirma(b, `sha256=${'g'.repeat(64)}`, SECRETO);
    const otra = verificarFirma(b, firmar(b, 'otro'), SECRETO);
    expect(basura).toEqual({ valida: false, motivo: 'FORMATO_INVALIDO' });
    expect(otra).toEqual({ valida: false, motivo: 'NO_COINCIDE' });
  });
});
