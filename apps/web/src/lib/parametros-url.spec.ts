import { describe, expect, it } from 'vitest';
import { esUuid, hrefDePestana, leerIdDeUrl, leerPestanaDeUrl } from './parametros-url';

const UUID = '01932000-0000-7000-8000-0000000000a1';
const P = (s: string) => new URLSearchParams(s);
const PESTANAS = ['uno', 'dos', 'tres'] as const;

describe('parametros-url (T-318)', () => {
  it('esUuid acepta UUID y rechaza todo lo demás', () => {
    expect(esUuid(UUID)).toBe(true);
    expect(esUuid('1043')).toBe(false);
    expect(esUuid(`${UUID}/../x`)).toBe(false);
    expect(esUuid("' or 1=1 --")).toBe(false);
    expect(esUuid(null)).toBe(false);
  });

  it('leerIdDeUrl distingue ausente, inválido y válido', () => {
    expect(leerIdDeUrl(P(''), 'id')).toEqual({ estado: 'ausente' });
    expect(leerIdDeUrl(P('id='), 'id')).toEqual({ estado: 'ausente' });
    expect(leerIdDeUrl(P('id=hola'), 'id')).toEqual({ estado: 'invalido' });
    expect(leerIdDeUrl(P(`op=${UUID}`), 'op')).toEqual({ estado: 'valido', id: UUID });
  });

  it('leerPestanaDeUrl cae a la primera si falta o no está permitida', () => {
    expect(leerPestanaDeUrl(P('pestana=dos'), PESTANAS)).toBe('dos');
    expect(leerPestanaDeUrl(P(''), PESTANAS)).toBe('uno');
    expect(leerPestanaDeUrl(P('pestana=hack'), PESTANAS)).toBe('uno');
    expect(leerPestanaDeUrl(P('pestana=__proto__'), PESTANAS)).toBe('uno');
  });

  it('hrefDePestana omite el parámetro en la primera pestaña y conserva los demás', () => {
    expect(hrefDePestana('/x', 'uno', PESTANAS)).toBe('/x');
    expect(hrefDePestana('/x', 'tres', PESTANAS)).toBe('/x?pestana=tres');
    expect(hrefDePestana('/x', 'dos', PESTANAS, P('a=1&pestana=tres'))).toBe('/x?a=1&pestana=dos');
    expect(hrefDePestana('/x', 'uno', PESTANAS, P('a=1&pestana=tres'))).toBe('/x?a=1');
  });
});
