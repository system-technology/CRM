/**
 * Pruebas de los contratos de `crm`.
 *
 * No se prueba que Zod sepa validar un `uuid`. Se prueban **las reglas de negocio que viven en
 * el contrato**, que son las que valen por estar aquí: si están en el esquema, las cumple la
 * web, las cumple la API y las cumpliría una integración futura que nadie ha escrito todavía.
 */

import { describe, expect, it } from 'vitest';
import {
  CrearOportunidad,
  MoverOportunidad,
  Oportunidad,
  type EtapaPipeline,
  type MotivoPerdida,
} from './crm.js';

const BASE = {
  id: '00000000-0000-4000-8000-000000000001',
  contactoId: '00000000-0000-4000-8000-000000000002',
  contactoNombre: 'Carolina Ramírez',
  titulo: 'Paquete San Andrés Dic 2026',
  destino: 'San Andrés',
  paqueteId: null,
  fechaSalida: '2026-12-15',
  etapa: 'EN_COTIZACION' as EtapaPipeline,
  valorEstimado: { unidades: '4200000', moneda: 'COP' as const },
  probabilidad: 70,
  asesorId: null,
  asesorNombre: null,
  proximaTarea: null,
  motivoPerdida: null as MotivoPerdida | null,
  notaPerdida: null as string | null,
  creadaEn: '2026-11-12T15:00:00.000Z',
  ultimoContactoEn: '2026-12-01T16:24:00.000Z',
};

describe('Oportunidad — la regla de pérdida', () => {
  it('acepta una oportunidad viva sin motivo de pérdida', () => {
    expect(Oportunidad.safeParse(BASE).success).toBe(true);
  });

  it('RECHAZA una perdida sin motivo', () => {
    // La razón de existir de la regla: sin motivo, el embudo dice cuántas se pierden y nunca
    // por qué, que es lo único sobre lo que una agencia puede actuar.
    const r = Oportunidad.safeParse({ ...BASE, etapa: 'PERDIDA' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/motivoPerdida/);
  });

  it('acepta una perdida con motivo', () => {
    expect(
      Oportunidad.safeParse({ ...BASE, etapa: 'PERDIDA', motivoPerdida: 'PRECIO' }).success,
    ).toBe(true);
  });

  it('RECHAZA un motivo de pérdida en una oportunidad que no está perdida', () => {
    // Si no, una tarjeta movida de vuelta a negociación se queda con el motivo pegado y el
    // informe de pérdidas cuenta una que no existe.
    const r = Oportunidad.safeParse({ ...BASE, etapa: 'GANADA', motivoPerdida: 'PRECIO' });
    expect(r.success).toBe(false);
  });

  it('RECHAZA «OTRO» sin explicación: no es un motivo', () => {
    const r = Oportunidad.safeParse({ ...BASE, etapa: 'PERDIDA', motivoPerdida: 'OTRO' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/notaPerdida/);
  });

  it('RECHAZA «OTRO» con una explicación de solo espacios', () => {
    const r = Oportunidad.safeParse({
      ...BASE,
      etapa: 'PERDIDA',
      motivoPerdida: 'OTRO',
      notaPerdida: '   ',
    });
    expect(r.success).toBe(false);
  });

  it('acepta «OTRO» explicado', () => {
    expect(
      Oportunidad.safeParse({
        ...BASE,
        etapa: 'PERDIDA',
        motivoPerdida: 'OTRO',
        notaPerdida: 'La empresa canceló el viaje de incentivo.',
      }).success,
    ).toBe(true);
  });
});

describe('MoverOportunidad — la misma regla al arrastrar una tarjeta', () => {
  it('mover a una etapa viva no pide motivo', () => {
    expect(MoverOportunidad.safeParse({ etapa: 'EN_NEGOCIACION' }).success).toBe(true);
  });

  it('arrastrar a PERDIDA sin motivo se rechaza en el contrato, no en el formulario', () => {
    expect(MoverOportunidad.safeParse({ etapa: 'PERDIDA' }).success).toBe(false);
  });

  it('arrastrar a PERDIDA con motivo pasa', () => {
    expect(
      MoverOportunidad.safeParse({ etapa: 'PERDIDA', motivoPerdida: 'NO_RESPONDE' }).success,
    ).toBe(true);
  });
});

describe('Oportunidad — el resto de invariantes', () => {
  it('la probabilidad vive entre 0 y 100', () => {
    expect(Oportunidad.safeParse({ ...BASE, probabilidad: 101 }).success).toBe(false);
    expect(Oportunidad.safeParse({ ...BASE, probabilidad: -1 }).success).toBe(false);
    expect(Oportunidad.safeParse({ ...BASE, probabilidad: 0 }).success).toBe(true);
  });

  it('el título no puede estar vacío: una tarjeta sin nombre no se puede leer en el tablero', () => {
    expect(Oportunidad.safeParse({ ...BASE, titulo: '' }).success).toBe(false);
  });

  it('el valor estimado puede faltar mientras se explora', () => {
    expect(Oportunidad.safeParse({ ...BASE, valorEstimado: null }).success).toBe(true);
  });
});

describe('CrearOportunidad', () => {
  it('basta con el contacto y el título', () => {
    const r = CrearOportunidad.safeParse({
      contactoId: BASE.contactoId,
      titulo: 'Consulta Cancún familia',
    });
    expect(r.success).toBe(true);
  });

  it('no deja crear una oportunidad ya perdida: nace en el embudo, no fuera de él', () => {
    const r = CrearOportunidad.safeParse({
      contactoId: BASE.contactoId,
      titulo: 'X',
      etapa: 'PERDIDA',
    });
    // `etapa` no es un campo de entrada: el servidor la pone. Si llega, se ignora.
    expect(r.success).toBe(true);
    expect(r.data && 'etapa' in r.data).toBe(false);
  });
});
