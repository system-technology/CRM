/**
 * Campos de M2 en el núcleo (T-049): ya no dan CAMPO_NO_SOPORTADO_AUN, los campos personalizados
 * se validan contra las definiciones del tenant y los cargos en destino llevan monto.
 */
import { PropuestaDeCatalogo, type PropuestaDeCatalogoEntrada } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import {
  paqueteCambia,
  validarYPlanificar,
  type CatalogoActual,
  type DefinicionDeCampo,
  type PaqueteActual,
} from './validar-y-planificar.js';

type Entrada = PropuestaDeCatalogoEntrada['productos'][number];

const producto = (extra: Partial<Entrada> = {}): Entrada => ({
  nombre: 'Isla Palma',
  destino: 'Cartagena',
  dias: 1,
  noches: 0,
  vigencias: [
    {
      desde: '2026-12-01',
      hasta: '2027-03-31',
      tarifas: [
        { nombre: 'Adulto', unidad: 'POR_PERSONA', venta: { unidades: '320000', moneda: 'COP' } },
      ],
    },
  ],
  ...extra,
});

const DEFINICIONES: readonly DefinicionDeCampo[] = [
  { clave: 'restricciones', tipo: 'TEXTO', obligatorio: false, opciones: null },
  { clave: 'cupo', tipo: 'NUMERO', obligatorio: false, opciones: null },
  { clave: 'nivel', tipo: 'SELECCION', obligatorio: false, opciones: ['facil', 'duro'] },
  { clave: 'fecha_corte', tipo: 'FECHA', obligatorio: false, opciones: null },
  { clave: 'incluye_seguro', tipo: 'BOOLEANO', obligatorio: false, opciones: null },
];

const correr = (productos: Entrada[], actual: Partial<CatalogoActual> = {}) =>
  validarYPlanificar(
    PropuestaDeCatalogo.parse({ version: 1, origen: 'PANTALLA', productos }),
    { paquetes: [], mayoristas: [], definicionesDePaquete: DEFINICIONES, ...actual },
    ['catalogo.administrar'],
    { tenantId: 't' },
  );

const codigos = (r: ReturnType<typeof correr>, nivel: 'ERROR' | 'AVISO') =>
  r.informe.elementos.filter((e) => e.nivel === nivel).map((e) => e.codigo);

describe('campos de M2 en el núcleo', () => {
  it('por defecto soporta M2: ningún campo extendido da CAMPO_NO_SOPORTADO_AUN', () => {
    const r = correr([
      producto({
        codigo: 'IP-1',
        formato: 'Pasadía',
        cargosEnDestino: [
          {
            concepto: 'Tasa portuaria',
            monto: { unidades: '29000', moneda: 'COP' },
            unidad: 'POR_PERSONA',
          },
        ],
        camposPersonalizados: { restricciones: 'Mayores de 4 años' },
      }),
    ]);
    expect(codigos(r, 'AVISO')).not.toContain('CAMPO_NO_SOPORTADO_AUN');
    expect(r.informe.resumen.errores).toBe(0);
  });

  it('un campo personalizado sin definición es ERROR CAMPO_PERSONALIZADO_NO_DEFINIDO', () => {
    const r = correr([producto({ camposPersonalizados: { inventado: 'x' } })]);
    expect(codigos(r, 'ERROR')).toEqual(['CAMPO_PERSONALIZADO_NO_DEFINIDO']);
    expect(r.informe.elementos.find((e) => e.nivel === 'ERROR')?.ruta).toBe(
      'productos[0].camposPersonalizados.inventado',
    );
  });

  it.each([
    ['restricciones', 42],
    ['cupo', 'diez'],
    ['nivel', 'medio'],
    ['fecha_corte', '2026-02-30'],
    ['incluye_seguro', 'si'],
  ])('el valor inválido de %s es ERROR CAMPO_PERSONALIZADO_INVALIDO', (clave, valor) => {
    const r = correr([producto({ camposPersonalizados: { [clave]: valor } })]);
    expect(codigos(r, 'ERROR')).toEqual(['CAMPO_PERSONALIZADO_INVALIDO']);
  });

  it('valores válidos de todos los tipos pasan', () => {
    const r = correr([
      producto({
        camposPersonalizados: {
          restricciones: 'ninguna',
          cupo: 12,
          nivel: 'facil',
          fecha_corte: '2026-11-30',
          incluye_seguro: true,
        },
      }),
    ]);
    expect(r.informe.resumen.errores).toBe(0);
  });

  it('un campo obligatorio ausente es ERROR cuando se envían campos personalizados', () => {
    const r = correr([producto({ camposPersonalizados: { cupo: 3 } })], {
      definicionesDePaquete: [
        ...DEFINICIONES,
        { clave: 'guia', tipo: 'TEXTO', obligatorio: true, opciones: null },
      ],
    });
    expect(codigos(r, 'ERROR')).toEqual(['CAMPO_PERSONALIZADO_OBLIGATORIO']);
  });

  it('sin camposPersonalizados en el producto no se exige nada (compatibilidad)', () => {
    const r = correr([producto()], {
      definicionesDePaquete: [{ clave: 'guia', tipo: 'TEXTO', obligatorio: true, opciones: null }],
    });
    expect(r.informe.resumen.errores).toBe(0);
  });

  it('cargos en destino repetidos o con monto negativo son ERROR', () => {
    const cargo = (concepto: string, unidades: string) => ({
      concepto,
      monto: { unidades, moneda: 'COP' as const },
      unidad: 'POR_PERSONA' as const,
    });
    const repetido = correr([
      producto({ cargosEnDestino: [cargo('Tasa', '1000'), cargo(' tasa ', '1000')] }),
    ]);
    expect(codigos(repetido, 'ERROR')).toEqual(['CARGO_EN_DESTINO_DUPLICADO']);
    const negativo = correr([producto({ cargosEnDestino: [cargo('Tasa', '-5')] })]);
    expect(codigos(negativo, 'ERROR')).toEqual(['CARGO_EN_DESTINO_NEGATIVO']);
  });

  it('un cargo con monto desconocido (null) es válido', () => {
    const r = correr([
      producto({
        cargosEnDestino: [{ concepto: 'Muelle', monto: null, unidad: 'POR_PERSONA' }],
      }),
    ]);
    expect(r.informe.resumen.errores).toBe(0);
  });

  it('un formato que la agencia no tiene es ERROR FORMATO_DE_VIAJE_DESCONOCIDO', () => {
    const malo = correr([producto({ formato: 'Crucero' })], { formatos: ['Pasadía'] });
    expect(codigos(malo, 'ERROR')).toEqual(['FORMATO_DE_VIAJE_DESCONOCIDO']);
    const bueno = correr([producto({ formato: 'pasadia' })], { formatos: ['Pasadía'] });
    expect(bueno.informe.resumen.errores).toBe(0);
  });

  it('una tarifa con la opción de un paquete existente es válida aunque la propuesta no la repita', () => {
    const actual: PaqueteActual = {
      id: 'p1',
      codigo: null,
      nombre: 'Isla Palma',
      destino: 'Cartagena',
      dias: 1,
      noches: 0,
      planAlimentacion: null,
      inclusiones: [],
      exclusiones: [],
      opcionesDeSalida: [
        {
          etiqueta: 'Lancha',
          horaSalida: null,
          horaRegreso: null,
          puntoDeEncuentro: null,
          activa: true,
        },
      ],
      vigencias: [],
    };
    const p = producto();
    p.vigencias[0]!.tarifas[0]!.opcionDeSalida = 'Lancha';
    expect(correr([p], { paquetes: [actual] }).informe.resumen.errores).toBe(0);
    const otra = producto();
    otra.vigencias[0]!.tarifas[0]!.opcionDeSalida = 'Terrestre';
    expect(codigos(correr([otra], { paquetes: [actual] }), 'ERROR')).toEqual([
      'OPCION_DE_SALIDA_DESCONOCIDA',
    ]);
  });
});

describe('paqueteCambia con campos de M2', () => {
  const actual: PaqueteActual = {
    id: 'p1',
    codigo: 'IP-1',
    nombre: 'Isla Palma',
    destino: 'Cartagena',
    dias: 1,
    noches: 0,
    planAlimentacion: null,
    inclusiones: [],
    exclusiones: [],
    formato: 'Pasadía',
    cargosEnDestino: [
      { concepto: 'Tasa', monto: { unidades: '29000', moneda: 'COP' }, unidad: 'POR_PERSONA' },
    ],
    camposPersonalizados: { restricciones: 'a' },
    opcionesDeSalida: [],
    vigencias: [],
  };
  const parse = (extra: Partial<Entrada>) =>
    PropuestaDeCatalogo.parse({ version: 1, origen: 'PANTALLA', productos: [producto(extra)] })
      .productos[0]!;

  it('lo mismo no cambia; un cargo, un campo, el código o el formato distintos sí', () => {
    expect(paqueteCambia(parse({}), actual)).toBe(false);
    expect(
      paqueteCambia(
        parse({
          codigo: 'IP-1',
          formato: 'pasadia'.replace('pasadia', 'Pasadía'),
          cargosEnDestino: [
            {
              concepto: 'Tasa',
              monto: { unidades: '29000', moneda: 'COP' },
              unidad: 'POR_PERSONA',
            },
          ],
          camposPersonalizados: { restricciones: 'a' },
        }),
        actual,
      ),
    ).toBe(false);
    expect(
      paqueteCambia(
        parse({
          cargosEnDestino: [
            {
              concepto: 'Tasa',
              monto: { unidades: '30000', moneda: 'COP' },
              unidad: 'POR_PERSONA',
            },
          ],
        }),
        actual,
      ),
    ).toBe(true);
    expect(paqueteCambia(parse({ camposPersonalizados: { restricciones: 'b' } }), actual)).toBe(
      true,
    );
    expect(paqueteCambia(parse({ codigo: 'IP-2' }), actual)).toBe(true);
    expect(paqueteCambia(parse({ formato: 'Excursión' }), actual)).toBe(true);
    expect(
      paqueteCambia(
        parse({ opcionesDeSalida: [{ etiqueta: 'Lancha', horaSalida: '07:30' }] }),
        actual,
      ),
    ).toBe(true);
  });
});
