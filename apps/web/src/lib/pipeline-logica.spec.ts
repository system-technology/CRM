/**
 * Pruebas del pipeline.
 *
 * **Reescritas el 2026-10-11, y conviene saber por qué.** Las cuatro primeras comprobaban que
 * el contrato rechazara «mover a PERDIDA sin motivo». Esa regla **ya no vive en el contrato**:
 * desde que la etapa viaja como `etapaId`, saber si ese id es una etapa de pérdida exige leer
 * `etapas_pipeline`, y un esquema Zod no lee otra tabla. Vive en el caso de uso de la API, con
 * sus propias pruebas, y sale como 409.
 *
 * Dejarlas aquí habría sido peor que borrarlas: seguirían verdes comprobando una regla que
 * desde este lado ya no se aplica, y eso es confianza falsa.
 */

import { describe, expect, it } from 'vitest';
import { MoverOportunidad } from '@viajapro/contracts';
import {
  esTareaAtrasada,
  formatearDineroCifra,
  moverOportunidadEnTablero,
} from './pipeline-logica';
import { obtenerMockTableroPipeline } from './mock-pipeline';

/** Los identificadores de las etapas del tablero simulado. */
const ETAPA = {
  nuevoLead: '01a114b2-5314-75b1-91ad-3be0518a6a01',
  enCotizacion: '01a114b2-5314-75b1-91ad-3be0518a6a02',
  perdida: '01a114b2-5314-75b1-91ad-3be0518a6a05',
};

describe('El contrato de movimiento', () => {
  it('va por identificador de etapa, no por clave: el destino puede ser una etapa propia', () => {
    // La agencia demo tiene SIETE etapas y el vocabulario común solo nombra cinco. Si el
    // movimiento viajara por clave, dos columnas del tablero serían destinos imposibles.
    expect(MoverOportunidad.safeParse({ etapaId: ETAPA.perdida }).success).toBe(true);
    expect(MoverOportunidad.safeParse({ etapaId: 'PERDIDA' }).success).toBe(false);
  });

  it('exige explicación cuando el motivo es «OTRO»', () => {
    // Esta sí se puede comprobar aquí: se ve en la propia petición, sin mirar otra tabla.
    const r = MoverOportunidad.safeParse({ etapaId: ETAPA.perdida, motivoPerdida: 'OTRO' });
    expect(r.success).toBe(false);
  });

  it('acepta «OTRO» explicado', () => {
    const r = MoverOportunidad.safeParse({
      etapaId: ETAPA.perdida,
      motivoPerdida: 'OTRO',
      notaPerdida: 'Aplazaron el viaje a enero.',
    });
    expect(r.success).toBe(true);
  });

  it('NO rechaza mover a pérdida sin motivo, y eso es correcto', () => {
    // Documenta dónde fue a parar la regla: el contrato no puede saber si este id es una etapa
    // de pérdida. Lo sabe la API, que responde 409 con `PERDIDA_SIN_MOTIVO`.
    expect(MoverOportunidad.safeParse({ etapaId: ETAPA.perdida }).success).toBe(true);
  });
});

describe('moverOportunidadEnTablero', () => {
  const OPORTUNIDAD = '00000000-0010-4000-8000-000000000001';

  it('traslada la tarjeta a la columna destino sin alterar las demás', () => {
    const inicial = obtenerMockTableroPipeline();
    const nuevo = moverOportunidadEnTablero(inicial, OPORTUNIDAD, {
      etapaId: ETAPA.enCotizacion,
      motivoPerdida: null,
      notaPerdida: null,
    });

    const origen = nuevo.columnas.find((c) => c.etapa.id === ETAPA.nuevoLead);
    const destino = nuevo.columnas.find((c) => c.etapa.id === ETAPA.enCotizacion);

    expect(origen?.oportunidades.some((op) => op.id === OPORTUNIDAD)).toBe(false);
    expect(destino?.oportunidades.some((op) => op.id === OPORTUNIDAD)).toBe(true);

    // La tarjeta se lleva la etapa ENTERA, no solo su id: es lo que le permite pintar el
    // nombre que la agencia le puso sin volver a preguntar.
    const tarjeta = destino?.oportunidades.find((op) => op.id === OPORTUNIDAD);
    expect(tarjeta?.etapa.id).toBe(ETAPA.enCotizacion);
    expect(tarjeta?.etapa.nombre.length).toBeGreaterThan(0);
  });

  it('rechaza un destino que no existe en este tablero', () => {
    const inicial = obtenerMockTableroPipeline();
    expect(() =>
      moverOportunidadEnTablero(inicial, OPORTUNIDAD, {
        etapaId: '00000000-0000-4000-8000-00000000beef',
        motivoPerdida: null,
        notaPerdida: null,
      }),
    ).toThrow(/no existe en este tablero/i);
  });
});

describe('El dinero', () => {
  it('el total de la columna viene del servidor y no se recalcula aquí', () => {
    const tablero = obtenerMockTableroPipeline();
    const columna = tablero.columnas.find((c) => c.etapa.id === ETAPA.nuevoLead);
    expect(columna?.valorTotal?.unidades).toBe('18500000');
  });

  it('en pesos colombianos la unidad es el PESO, no el centavo', () => {
    // Esta prueba nace de un error de dos órdenes de magnitud: el formateador dividía entre
    // cien y el simulado traía los centavos, así que los dos errores se compensaban y la
    // pantalla acertaba por casualidad. Al corregir uno solo, aparecían $185.000.
    expect(formatearDineroCifra({ unidades: '18500000', moneda: 'COP' })).toContain('18.500.000');
    expect(formatearDineroCifra({ unidades: '275000', moneda: 'COP' })).toContain('275.000');
  });

  it('sin dinero devuelve algo legible, no «NaN»', () => {
    expect(formatearDineroCifra(null)).toBe('$0');
  });
});

describe('Las tareas', () => {
  it('detecta una fecha de vencimiento en el pasado', () => {
    expect(esTareaAtrasada(new Date(Date.now() - 3_600_000).toISOString())).toBe(true);
  });

  it('no marca como atrasada una que vence en una hora', () => {
    expect(esTareaAtrasada(new Date(Date.now() + 3_600_000).toISOString())).toBe(false);
  });

  it('sin tarea no hay atraso', () => {
    expect(esTareaAtrasada(null)).toBe(false);
  });
});
