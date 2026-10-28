/**
 * Pruebas de los contratos de `crm`.
 *
 * No se prueba que Zod sepa validar un `uuid`. Se prueban **las reglas de negocio que viven en
 * el contrato**, que son las que valen por estar aquí: las cumple la web, las cumple la API, y
 * las cumpliría una integración futura que nadie ha escrito todavía.
 *
 * **Lo que ya NO se prueba aquí, y conviene saber dónde fue a parar:** «una oportunidad perdida
 * exige motivo» y «el motivo solo existe en una etapa de pérdida». Dejaron de ser comprobables
 * en el esquema cuando la etapa pasó a viajar como `etapaId`: saber si ese id es una etapa de
 * pérdida exige leer `etapas_pipeline`, y un esquema no lee otra tabla. Viven en el caso de uso
 * `MoverOportunidad` de `apps/api`, con sus propias pruebas.
 */

import { describe, expect, it } from 'vitest';
import {
  CrearContacto,
  CrearOportunidad,
  CrearSeguimiento,
  EditarContacto,
  EtapaDefinida,
  MoverOportunidad,
  Oportunidad,
  DefinicionCampoPersonalizado,
  type MotivoPerdida,
} from './crm.js';

const ETAPA = {
  id: '00000000-0000-4000-8000-0000000000e1',
  clave: 'EN_COTIZACION' as const,
  nombre: 'En cotización',
  orden: 1,
  probabilidad: 40,
  esGanada: false,
  esPerdida: false,
};

const BASE = {
  id: '00000000-0000-4000-8000-000000000001',
  contactoId: '00000000-0000-4000-8000-000000000002',
  contactoNombre: 'Carolina Ramírez',
  titulo: 'Paquete San Andrés Dic 2026',
  destino: 'San Andrés',
  paqueteId: null,
  fechaSalida: '2026-12-15',
  etapa: ETAPA,
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

describe('EtapaDefinida — el tablero se pinta desde los datos, no desde un enum', () => {
  it('acepta una etapa con clave canónica', () => {
    expect(EtapaDefinida.safeParse(ETAPA).success).toBe(true);
  });

  it('ACEPTA una etapa sin clave: una agencia puede tener más etapas que las cinco', () => {
    // Es la corrección que motivó este cambio. La agencia demo tenía siete etapas; con la
    // etapa como enum cerrado, dos de ellas existían en la base y no eran representables.
    const propia = { ...ETAPA, clave: null, nombre: 'Esperando anticipo', orden: 3 };
    expect(EtapaDefinida.safeParse(propia).success).toBe(true);
  });

  it('RECHAZA una clave inventada: el vocabulario común sí es cerrado', () => {
    expect(EtapaDefinida.safeParse({ ...ETAPA, clave: 'EN_REMOJO' }).success).toBe(false);
  });

  it('exige nombre: una columna sin título no se puede leer', () => {
    expect(EtapaDefinida.safeParse({ ...ETAPA, nombre: '' }).success).toBe(false);
  });

  it('lleva esGanada y esPerdida, que es lo que decide el comportamiento', () => {
    const perdida = EtapaDefinida.parse({ ...ETAPA, clave: null, esPerdida: true });
    // Sin renombrar nada: la agencia puede llamarla «Se fue con otra» y sigue siendo terminal.
    expect(perdida.esPerdida).toBe(true);
    expect(perdida.clave).toBeNull();
  });
});

describe('Oportunidad', () => {
  it('acepta una oportunidad viva', () => {
    expect(Oportunidad.safeParse(BASE).success).toBe(true);
  });

  it('RECHAZA «OTRO» sin explicación: no es un motivo', () => {
    const r = Oportunidad.safeParse({ ...BASE, motivoPerdida: 'OTRO' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/notaPerdida/);
  });

  it('RECHAZA «OTRO» con una explicación de solo espacios', () => {
    expect(
      Oportunidad.safeParse({ ...BASE, motivoPerdida: 'OTRO', notaPerdida: '   ' }).success,
    ).toBe(false);
  });

  it('acepta «OTRO» explicado', () => {
    expect(
      Oportunidad.safeParse({
        ...BASE,
        motivoPerdida: 'OTRO',
        notaPerdida: 'La empresa canceló el viaje de incentivo.',
      }).success,
    ).toBe(true);
  });

  it('la probabilidad vive entre 0 y 100', () => {
    expect(Oportunidad.safeParse({ ...BASE, probabilidad: 101 }).success).toBe(false);
    expect(Oportunidad.safeParse({ ...BASE, probabilidad: -1 }).success).toBe(false);
    expect(Oportunidad.safeParse({ ...BASE, probabilidad: 0 }).success).toBe(true);
  });

  it('el título no puede estar vacío: una tarjeta sin nombre no se lee en el tablero', () => {
    expect(Oportunidad.safeParse({ ...BASE, titulo: '' }).success).toBe(false);
  });

  it('el valor estimado puede faltar mientras se explora', () => {
    expect(Oportunidad.safeParse({ ...BASE, valorEstimado: null }).success).toBe(true);
  });

  it('exige la etapa entera, no un identificador suelto', () => {
    // Si solo viajara el id, el tablero tendría que pedir las etapas aparte para pintar una
    // tarjeta, y con 40 oportunidades eso son 40 preguntas o un mapa que mantener a mano.
    expect(Oportunidad.safeParse({ ...BASE, etapa: ETAPA.id }).success).toBe(false);
  });
});

describe('MoverOportunidad — arrastrar una tarjeta', () => {
  const DESTINO = '00000000-0000-4000-8000-0000000000e2';

  it('mover a otra etapa solo necesita su id', () => {
    expect(MoverOportunidad.safeParse({ etapaId: DESTINO }).success).toBe(true);
  });

  it('va por id y no por clave: el destino puede ser una etapa propia de la agencia', () => {
    const r = MoverOportunidad.safeParse({ etapaId: DESTINO });
    expect(r.success && 'etapaId' in r.data).toBe(true);
  });

  it('RECHAZA un destino que no es un identificador', () => {
    expect(MoverOportunidad.safeParse({ etapaId: 'PERDIDA' }).success).toBe(false);
  });

  it('exige explicación cuando el motivo es «OTRO»', () => {
    expect(MoverOportunidad.safeParse({ etapaId: DESTINO, motivoPerdida: 'OTRO' }).success).toBe(
      false,
    );
  });

  it('acepta un motivo con su explicación', () => {
    expect(
      MoverOportunidad.safeParse({
        etapaId: DESTINO,
        motivoPerdida: 'OTRO',
        notaPerdida: 'Aplazaron el viaje a enero.',
      }).success,
    ).toBe(true);
  });
});

describe('CrearOportunidad', () => {
  it('basta con el contacto y el título', () => {
    expect(
      CrearOportunidad.safeParse({ contactoId: BASE.contactoId, titulo: 'Consulta Cancún familia' })
        .success,
    ).toBe(true);
  });

  it('no acepta la etapa como entrada: una oportunidad nace donde el embudo empieza', () => {
    const r = CrearOportunidad.safeParse({
      contactoId: BASE.contactoId,
      titulo: 'X',
      etapa: ETAPA,
    });
    expect(r.success).toBe(true);
    expect(r.data && 'etapa' in r.data).toBe(false);
  });
});

describe('Contacto: alta y edición (T-075)', () => {
  it('el alta exige teléfono y rellena etiquetas vacías', () => {
    const r = CrearContacto.parse({ telefono: '+57 300 123 4567' });
    expect(r.etiquetas).toEqual([]);
    expect(CrearContacto.safeParse({ nombre: 'Ana' }).success).toBe(false);
  });

  it('el correo debe ser un correo', () => {
    expect(CrearContacto.safeParse({ telefono: '+573001234567', correo: 'no-es' }).success).toBe(
      false,
    );
  });

  it('editar exige al menos un campo; null es un valor válido (borrar)', () => {
    expect(EditarContacto.safeParse({}).success).toBe(false);
    expect(EditarContacto.safeParse({ correo: null }).success).toBe(true);
  });
});

describe('CrearSeguimiento (T-077)', () => {
  const OP = '33333333-3333-4333-8333-333333333333';
  const CONV = '44444444-4444-4444-8444-444444444444';
  const base = { descripcion: 'Llamar', venceEn: '2026-10-28T15:00:00.000Z' };

  it('exactamente uno: oportunidad o conversación', () => {
    expect(CrearSeguimiento.safeParse({ ...base, oportunidadId: OP }).success).toBe(true);
    expect(CrearSeguimiento.safeParse({ ...base, conversacionId: CONV }).success).toBe(true);
    expect(CrearSeguimiento.safeParse(base).success).toBe(false);
    expect(
      CrearSeguimiento.safeParse({ ...base, oportunidadId: OP, conversacionId: CONV }).success,
    ).toBe(false);
  });

  it('la fecha es un instante con zona', () => {
    expect(
      CrearSeguimiento.safeParse({ ...base, venceEn: '2026-10-28', oportunidadId: OP }).success,
    ).toBe(false);
  });
});

describe('DefinicionCampoPersonalizado (T-026)', () => {
  it('valida una definición de campo personalizada completa para contacto', () => {
    const res = DefinicionCampoPersonalizado.safeParse({
      id: 'campo-1',
      entidad: 'contacto',
      nombre: 'Número de Pasaporte',
      clave: 'numero_pasaporte',
      tipo: 'texto',
      requerido: false,
      descripcion: 'Documento internacional para reservas',
    });
    expect(res.success).toBe(true);
  });

  it('valida una definición de campo de tipo lista con opciones', () => {
    const res = DefinicionCampoPersonalizado.safeParse({
      id: 'campo-2',
      entidad: 'oportunidad',
      nombre: 'Flexibilidad de Fechas',
      clave: 'flexibilidad_fechas',
      tipo: 'lista',
      opciones: ['Fechas Exactas', 'Flexible +/- 3 días'],
      requerido: true,
    });
    expect(res.success).toBe(true);
  });

  it('rechaza tipos de dato no admitidos', () => {
    const res = DefinicionCampoPersonalizado.safeParse({
      id: 'campo-3',
      entidad: 'contacto',
      nombre: 'Campo Invalido',
      clave: 'campo_invalido',
      tipo: 'archivo_binario',
    });
    expect(res.success).toBe(false);
  });
});
