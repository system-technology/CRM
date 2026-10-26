/**
 * La máquina de estados del mensaje saliente. Cada caso es una forma en que la bandeja mentiría.
 */
import { describe, expect, it } from 'vitest';
import type { EstadoMensaje } from './contenido-del-cambio.js';
import { estadoTrasReporte } from './estado-de-entrega.js';

describe('estadoTrasReporte — con el wamid ya conocido', () => {
  it('avanza en el orden de Meta', () => {
    expect(estadoTrasReporte('PENDIENTE', 'ENVIADO', true)).toBe('ENVIADO');
    expect(estadoTrasReporte('ENVIADO', 'ENTREGADO', true)).toBe('ENTREGADO');
    expect(estadoTrasReporte('ENTREGADO', 'LEIDO', true)).toBe('LEIDO');
    expect(estadoTrasReporte('LEIDO', 'REPRODUCIDO', true)).toBe('REPRODUCIDO');
  });

  it('salta estados: un `read` que llega antes que `delivered` vale', () => {
    expect(estadoTrasReporte('PENDIENTE', 'LEIDO', true)).toBe('LEIDO');
  });

  it('nunca retrocede: un `sent` tardío no deshace un `read`', () => {
    expect(estadoTrasReporte('LEIDO', 'ENVIADO', true)).toBeNull();
    expect(estadoTrasReporte('ENTREGADO', 'ENTREGADO', true)).toBeNull();
  });

  it('FALLIDO gana siempre, incluso sobre LEIDO', () => {
    const todos: EstadoMensaje[] = ['PENDIENTE', 'ENVIADO', 'ENTREGADO', 'LEIDO', 'REPRODUCIDO'];
    for (const actual of todos) expect(estadoTrasReporte(actual, 'FALLIDO', true)).toBe('FALLIDO');
  });

  it('FALLIDO es terminal: nada lo saca', () => {
    expect(estadoTrasReporte('FALLIDO', 'ENTREGADO', true)).toBeNull();
    expect(estadoTrasReporte('FALLIDO', 'FALLIDO', true)).toBeNull();
  });
});

describe('estadoTrasReporte — sin wamid: nuestro estado es una suposición', () => {
  it('un envío que marcamos «sin confirmar» se corrige si Meta dice que salió', () => {
    expect(estadoTrasReporte('FALLIDO', 'ENVIADO', false)).toBe('ENVIADO');
    expect(estadoTrasReporte('FALLIDO', 'ENTREGADO', false)).toBe('ENTREGADO');
  });

  it('el webhook que gana la carrera a la respuesta del envío se aplica', () => {
    expect(estadoTrasReporte('PENDIENTE', 'ENVIADO', false)).toBe('ENVIADO');
  });
});
