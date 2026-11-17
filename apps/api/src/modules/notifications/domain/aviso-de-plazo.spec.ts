import { describe, expect, it } from 'vitest';
import { TIPOS_DE_AVISO_DE_PLAZO } from '@viajapro/contracts';
import { AVISOS_DE_PLAZO, destinatariosDelAviso } from './aviso-de-plazo.js';

describe('avisos de plazo', () => {
  it('hay un consumidor por cada uno de los cuatro tipos de evento, con nombres únicos y válidos', () => {
    expect(AVISOS_DE_PLAZO.map((a) => a.tipoEvento).sort()).toEqual(
      [...TIPOS_DE_AVISO_DE_PLAZO].sort(),
    );
    expect(new Set(AVISOS_DE_PLAZO.map((a) => a.consumidor)).size).toBe(4);
    for (const a of AVISOS_DE_PLAZO) expect(a.consumidor).toMatch(/^[a-z]+\.[a-z_]+$/);
  });

  it('con asesor elegible, avisa solo a él', () => {
    expect(destinatariosDelAviso(['a1'], ['o1', 'o2'])).toEqual(['a1']);
  });

  it('sin asesor elegible, avisa a quienes pueden operar', () => {
    expect(destinatariosDelAviso([], ['o1', 'o2', 'o1'])).toEqual(['o1', 'o2']);
  });

  it('sin nadie, no avisa a nadie', () => {
    expect(destinatariosDelAviso([], [])).toEqual([]);
  });
});
