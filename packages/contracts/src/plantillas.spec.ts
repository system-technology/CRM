/**
 * Pruebas del contrato de plantillas.
 *
 * Se prueba la regla que evita el error más frecuente de esta integración —mandar una plantilla
 * con un hueco vacío— y las formas que Meta impone y nosotros no podemos inventar.
 */

import { describe, expect, it } from 'vitest';
import { EnviarPlantilla, PlantillaWhatsApp } from './plantillas.js';

const ENVIO = {
  conversacionId: '00000000-0000-4000-8000-000000000001',
  plantillaId: '00000000-0000-4000-8000-000000000002',
  idioma: 'es_CO',
  valores: ['Carolina', 'San Andrés'],
  claveIdempotencia: '00000000-0000-4000-8000-000000000003',
};

describe('EnviarPlantilla', () => {
  it('acepta un envío con todos los huecos rellenos', () => {
    expect(EnviarPlantilla.safeParse(ENVIO).success).toBe(true);
  });

  it('RECHAZA un hueco vacío: Meta rechaza «Hola , su reserva»', () => {
    const r = EnviarPlantilla.safeParse({ ...ENVIO, valores: ['Carolina', ''] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/\{\{2\}\}/);
  });

  it('RECHAZA un hueco de solo espacios, que se ve igual de vacío', () => {
    expect(EnviarPlantilla.safeParse({ ...ENVIO, valores: ['   ', 'San Andrés'] }).success).toBe(
      false,
    );
  });

  it('señala CUÁL hueco falta, no «hay un error»', () => {
    const r = EnviarPlantilla.safeParse({ ...ENVIO, valores: ['Ana', 'Cali', ''] });
    expect(JSON.stringify(r.error?.issues)).toMatch(/\{\{3\}\}/);
  });

  it('acepta una plantilla sin variables', () => {
    expect(EnviarPlantilla.safeParse({ ...ENVIO, valores: [] }).success).toBe(true);
  });

  it('exige clave de idempotencia: una plantilla se cobra cada vez que sale', () => {
    const { claveIdempotencia: _omitida, ...sinClave } = ENVIO;
    expect(EnviarPlantilla.safeParse(sinClave).success).toBe(false);
  });
});

const PLANTILLA = {
  id: '00000000-0000-4000-8000-000000000010',
  nombre: 'seguimiento_cotizacion',
  idioma: 'es_CO',
  categoria: 'UTILIDAD',
  estado: 'APROBADA',
  motivoEstado: null,
  encabezado: null,
  cuerpo: 'Hola {{1}}, ¿seguimos con su viaje a {{2}}?',
  pie: null,
  botones: [],
  variables: [
    { indice: 1, descripcion: 'nombre del viajero', ejemplo: 'Carolina' },
    { indice: 2, descripcion: 'destino', ejemplo: 'San Andrés' },
  ],
  actualizadaEn: '2026-10-10T12:00:00.000Z',
};

describe('PlantillaWhatsApp', () => {
  it('acepta una plantilla aprobada', () => {
    expect(PlantillaWhatsApp.safeParse(PLANTILLA).success).toBe(true);
  });

  it('RECHAZA un nombre con mayúsculas o espacios: Meta no los admite', () => {
    expect(
      PlantillaWhatsApp.safeParse({ ...PLANTILLA, nombre: 'Seguimiento Cotización' }).success,
    ).toBe(false);
  });

  it('admite los cinco estados, PAUSADA incluida', () => {
    // Meta pausa sola una plantilla cuando la marcan como spam. Una que funcionaba el martes
    // puede no funcionar el jueves, y si el contrato no lo admite, la lista revienta.
    for (const estado of ['APROBADA', 'PENDIENTE', 'RECHAZADA', 'PAUSADA', 'DESHABILITADA']) {
      expect(PlantillaWhatsApp.safeParse({ ...PLANTILLA, estado }).success).toBe(true);
    }
  });

  it('las variables se numeran desde 1, como en el texto de Meta', () => {
    expect(
      PlantillaWhatsApp.safeParse({
        ...PLANTILLA,
        variables: [{ indice: 0, descripcion: null, ejemplo: null }],
      }).success,
    ).toBe(false);
  });

  it('el texto de un botón cabe en 25 caracteres, que es el tope de Meta', () => {
    const largo = { tipo: 'RESPUESTA_RAPIDA', texto: 'x'.repeat(26), valor: null };
    expect(PlantillaWhatsApp.safeParse({ ...PLANTILLA, botones: [largo] }).success).toBe(false);
  });
});
