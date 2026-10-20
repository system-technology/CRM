/**
 * La regla de visibilidad en sus tres formas. Que `puedeVer`, `filtroDeVisibilidad` y `quienesVen`
 * digan lo mismo es lo que evita que el socket muestre lo que la API esconde.
 */
import { describe, expect, it } from 'vitest';
import type { Permiso } from '@viajapro/contracts';
import {
  filtroDeVisibilidad,
  puedeVer,
  quienesVen,
  VISIBILIDAD_DE_SISTEMA,
  visibilidadDe,
} from './visibilidad-de-conversaciones.js';

const ANA = '01932000-0000-7000-8000-0000000000a1';
const BETO = '01932000-0000-7000-8000-0000000000b1';
const DUENO = '01932000-0000-7000-8000-0000000000d1';

const permisos = (...p: Permiso[]): ReadonlySet<Permiso> => new Set(p);

describe('visibilidadDe', () => {
  it('con conversaciones.ver_todas ve todas', () => {
    expect(
      visibilidadDe({ usuarioId: DUENO, permisos: permisos('conversaciones.ver_todas') }),
    ).toEqual({ alcance: 'TODAS' });
  });

  it('sin el permiso ve las suyas y la cola común', () => {
    expect(visibilidadDe({ usuarioId: ANA, permisos: permisos() })).toEqual({
      alcance: 'ASIGNADAS_Y_COLA',
      usuarioId: ANA,
    });
  });

  it('otro permiso no da visibilidad total', () => {
    expect(
      visibilidadDe({ usuarioId: ANA, permisos: permisos('usuarios.administrar') }).alcance,
    ).toBe('ASIGNADAS_Y_COLA');
  });
});

describe('puedeVer', () => {
  const ana = visibilidadDe({ usuarioId: ANA, permisos: permisos() });
  it('la asignada a ella y la sin asignar, sí; la de otro, no', () => {
    expect(puedeVer(ana, ANA)).toBe(true);
    expect(puedeVer(ana, null)).toBe(true);
    expect(puedeVer(ana, BETO)).toBe(false);
  });
  it('sin identidad de usuario solo ve la cola común', () => {
    const anonima = visibilidadDe({ usuarioId: null, permisos: permisos() });
    expect(puedeVer(anonima, null)).toBe(true);
    expect(puedeVer(anonima, ANA)).toBe(false);
  });
  it('con visibilidad total ve cualquiera', () => {
    expect(puedeVer(VISIBILIDAD_DE_SISTEMA, BETO)).toBe(true);
  });
});

describe('filtroDeVisibilidad', () => {
  it('total: sin restricción', () => {
    expect(filtroDeVisibilidad({ alcance: 'TODAS' })).toEqual({});
  });
  it('restringida: asignada a uno o sin asignar', () => {
    expect(filtroDeVisibilidad({ alcance: 'ASIGNADAS_Y_COLA', usuarioId: ANA })).toEqual({
      OR: [{ asignadoAId: null }, { asignadoAId: ANA }],
    });
  });
  it('restringida sin usuario: solo la cola común', () => {
    expect(filtroDeVisibilidad({ alcance: 'ASIGNADAS_Y_COLA', usuarioId: null })).toEqual({
      OR: [{ asignadoAId: null }],
    });
  });
});

describe('quienesVen', () => {
  const miembros = [
    { usuarioId: DUENO, verTodas: true },
    { usuarioId: ANA, verTodas: false },
    { usuarioId: BETO, verTodas: false },
  ];
  it('la de Ana: Ana y el dueño', () => {
    expect([...quienesVen(miembros, ANA)].sort()).toEqual([ANA, DUENO].sort());
  });
  it('la de nadie: todos', () => {
    expect(quienesVen(miembros, null).size).toBe(3);
  });
  it('coincide con puedeVer para cada miembro y cada asignación', () => {
    for (const asignado of [null, ANA, BETO, DUENO]) {
      const audiencia = quienesVen(miembros, asignado);
      for (const m of miembros) {
        const v = visibilidadDe({
          usuarioId: m.usuarioId,
          permisos: m.verTodas ? permisos('conversaciones.ver_todas') : permisos(),
        });
        expect(audiencia.has(m.usuarioId)).toBe(puedeVer(v, asignado));
      }
    }
  });
});
