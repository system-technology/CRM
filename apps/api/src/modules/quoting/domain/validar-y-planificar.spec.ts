import {
  PropuestaDeCatalogo,
  type ElementoDeInforme,
  type Permiso,
  type PropuestaDeCatalogoEntrada,
} from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import {
  validarYPlanificar,
  type CatalogoActual,
  type PaqueteActual,
} from './validar-y-planificar.js';

const CON_NETO: readonly Permiso[] = ['catalogo.administrar', 'cotizacion.ver_neto_y_margen'];
const SIN_NETO: readonly Permiso[] = ['catalogo.administrar'];
const VACIO: CatalogoActual = { paquetes: [], mayoristas: [] };

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

const propuesta = (
  productos: Entrada[] = [producto()],
  origen: 'PANTALLA' | 'ARCHIVO' | 'API' | 'IA' = 'PANTALLA',
) => PropuestaDeCatalogo.parse({ version: 1, origen, productos });

const correr = (
  p: ReturnType<typeof propuesta>,
  actual: CatalogoActual = VACIO,
  permisos: readonly Permiso[] = CON_NETO,
  tenantId = 'tenant-a',
  soportaM2 = false,
) => validarYPlanificar(p, actual, permisos, { tenantId, soportaM2 });

const con = (r: ReturnType<typeof correr>, nivel: ElementoDeInforme['nivel'], codigo: string) =>
  r.informe.elementos.filter((e) => e.nivel === nivel && e.codigo === codigo);

/** El catálogo actual que resulta de aplicar la propuesta tal cual (para la convergencia). */
function catalogoDesde(p: ReturnType<typeof propuesta>, ids = 'p'): CatalogoActual {
  return {
    mayoristas: [],
    paquetes: p.productos.map((pr, i): PaqueteActual => ({
      id: `${ids}${i}`,
      codigo: pr.codigo ?? null,
      nombre: pr.nombre,
      destino: pr.destino,
      dias: pr.dias,
      noches: pr.noches,
      planAlimentacion: pr.planAlimentacion ?? null,
      inclusiones: pr.inclusiones ?? [],
      exclusiones: pr.exclusiones ?? [],
      vigencias: pr.vigencias.map((v) => ({
        desde: v.desde,
        hasta: v.hasta,
        publicada: v.publicada,
        tarifas: v.tarifas.map((t) => ({
          nombre: t.nombre,
          unidad: t.unidad,
          cubrePasajeros: t.cubrePasajeros,
          neto: t.neto,
          venta: t.venta,
          mayorista: t.mayorista,
          aditiva: t.aditiva,
          condicion: t.condicion,
        })),
      })),
    })),
  };
}

describe('invariantes del producto y de la tarifa', () => {
  it('una propuesta sana: todo CREAR, sin errores ni avisos', () => {
    const r = correr(propuesta());
    expect(r.informe.resumen).toMatchObject({ errores: 0, avisos: 0, creados: 1 });
    expect(r.plan.paquetes[0]?.accion).toBe('CREAR');
    expect(r.plan.paquetes[0]?.vigencias[0]?.tarifas[0]?.accion).toBe('CREAR');
    expect(con(r, 'OK', 'PRODUCTO_OK')).toHaveLength(1);
  });

  it('noches > dias es ERROR', () => {
    const r = correr(propuesta([producto({ dias: 2, noches: 3 })]));
    expect(con(r, 'ERROR', 'NOCHES_MAYOR_QUE_DIAS')).toHaveLength(1);
    expect(r.informe.resumen.errores).toBe(1);
  });

  it('POR_PERSONA con cubrePasajeros != 1 es ERROR; POR_GRUPO con 2 es válido', () => {
    const t = (unidad: 'POR_PERSONA' | 'POR_GRUPO', cubrePasajeros: number) =>
      producto({
        vigencias: [
          {
            desde: '2026-12-01',
            hasta: '2026-12-31',
            tarifas: [
              { nombre: 'Pareja', unidad, cubrePasajeros, venta: { unidades: '1', moneda: 'COP' } },
            ],
          },
        ],
      });
    expect(
      con(correr(propuesta([t('POR_PERSONA', 2)])), 'ERROR', 'POR_PERSONA_CUBRE_UNO'),
    ).toHaveLength(1);
    expect(correr(propuesta([t('POR_GRUPO', 2)])).informe.resumen.errores).toBe(0);
  });

  it('neto sin permiso es ERROR NETO_SIN_PERMISO; con permiso pasa', () => {
    const conNeto = producto({
      vigencias: [
        {
          desde: '2026-12-01',
          hasta: '2026-12-31',
          tarifas: [
            {
              nombre: 'Adulto',
              unidad: 'POR_PERSONA',
              neto: { unidades: '250000', moneda: 'COP' },
              venta: { unidades: '320000', moneda: 'COP' },
            },
          ],
        },
      ],
    });
    expect(
      con(correr(propuesta([conNeto]), VACIO, SIN_NETO), 'ERROR', 'NETO_SIN_PERMISO'),
    ).toHaveLength(1);
    expect(correr(propuesta([conNeto]), VACIO, CON_NETO).informe.resumen.errores).toBe(0);
  });

  it('moneda incoherente y lista no mayor que venta son ERROR', () => {
    const p = producto({
      vigencias: [
        {
          desde: '2026-12-01',
          hasta: '2026-12-31',
          tarifas: [
            {
              nombre: 'A',
              unidad: 'POR_PERSONA',
              neto: { unidades: '1', moneda: 'USD' },
              venta: { unidades: '100', moneda: 'COP' },
            },
            {
              nombre: 'B',
              unidad: 'POR_PERSONA',
              venta: { unidades: '100', moneda: 'COP' },
              lista: { unidades: '100', moneda: 'COP' },
            },
          ],
        },
      ],
    });
    const r = correr(propuesta([p]), VACIO, CON_NETO, 't', true);
    expect(con(r, 'ERROR', 'MONEDA_INCOHERENTE')).toHaveLength(1);
    expect(con(r, 'ERROR', 'LISTA_NO_MAYOR_QUE_VENTA')).toHaveLength(1);
  });

  it('producto sin vigencias es AVISO SIN_PRECIO, no error', () => {
    const r = correr(propuesta([producto({ vigencias: [] })]));
    expect(con(r, 'AVISO', 'SIN_PRECIO')).toHaveLength(1);
    expect(r.informe.resumen.errores).toBe(0);
    expect(r.plan.paquetes[0]?.accion).toBe('CREAR');
  });

  it('tarifa repetida en una vigencia y fecha inexistente son ERROR', () => {
    const t = {
      nombre: 'Adulto',
      unidad: 'POR_PERSONA' as const,
      venta: { unidades: '1', moneda: 'COP' as const },
    };
    const r = correr(
      propuesta([
        producto({
          vigencias: [
            {
              desde: '2026-12-01',
              hasta: '2026-12-31',
              tarifas: [t, { ...t, nombre: ' ADULTO ' }],
            },
            { desde: '2026-02-30', hasta: '2026-03-01', tarifas: [] },
          ],
        }),
      ]),
    );
    expect(con(r, 'ERROR', 'TARIFA_DUPLICADA')).toHaveLength(1);
    expect(con(r, 'ERROR', 'FECHA_INVALIDA')).toHaveLength(1);
  });
});

describe('empate de vigencias (resolverVigencia)', () => {
  const vig = (desde: string, hasta: string, publicada = false) => ({
    desde,
    hasta,
    publicada,
    tarifas: [
      {
        nombre: 'Adulto',
        unidad: 'POR_PERSONA' as const,
        venta: { unidades: '1', moneda: 'COP' as const },
      },
    ],
  });

  it('dos vigencias abiertas de igual longitud solapadas = ERROR VIGENCIA_EMPATADA', () => {
    const r = correr(
      propuesta([
        producto({ vigencias: [vig('2026-12-01', '2026-12-10'), vig('2026-12-05', '2026-12-14')] }),
      ]),
    );
    expect(con(r, 'ERROR', 'VIGENCIA_EMPATADA')).toHaveLength(1);
  });

  it('longitudes distintas (la corta gana), contiguas o salida publicada no empatan', () => {
    const corta = correr(
      propuesta([
        producto({ vigencias: [vig('2026-12-01', '2026-12-31'), vig('2026-12-05', '2026-12-08')] }),
      ]),
    );
    expect(con(corta, 'ERROR', 'VIGENCIA_EMPATADA')).toHaveLength(0);
    const contiguas = correr(
      propuesta([
        producto({ vigencias: [vig('2026-12-01', '2026-12-10'), vig('2026-12-11', '2026-12-20')] }),
      ]),
    );
    expect(con(contiguas, 'ERROR', 'VIGENCIA_EMPATADA')).toHaveLength(0);
    const salida = correr(
      propuesta([
        producto({
          vigencias: [vig('2026-12-01', '2026-12-31'), vig('2026-12-05', '2026-12-05', true)],
        }),
      ]),
    );
    expect(con(salida, 'ERROR', 'VIGENCIA_EMPATADA')).toHaveLength(0);
  });

  it('el empate se detecta contra vigencias que ya están en el catálogo', () => {
    const existente = propuesta([producto({ vigencias: [vig('2026-12-01', '2026-12-10')] })]);
    const nueva = propuesta([producto({ vigencias: [vig('2026-12-05', '2026-12-14')] })]);
    const r = correr(nueva, catalogoDesde(existente));
    expect(con(r, 'ERROR', 'VIGENCIA_EMPATADA')).toHaveLength(1);
  });

  it('vigencia duplicada en la propuesta es ERROR', () => {
    const r = correr(
      propuesta([
        producto({ vigencias: [vig('2026-12-01', '2026-12-10'), vig('2026-12-01', '2026-12-10')] }),
      ]),
    );
    expect(con(r, 'ERROR', 'VIGENCIA_DUPLICADA')).toHaveLength(1);
  });
});

describe('clave natural', () => {
  it('«Piangüita + Ballenas» con 0 y con 1 noche son dos CREAR', () => {
    const r = correr(
      propuesta([
        producto({ nombre: 'Piangüita + Ballenas', noches: 0 }),
        producto({ nombre: 'Piangüita + Ballenas', dias: 2, noches: 1 }),
      ]),
    );
    expect(r.plan.paquetes.map((p) => p.accion)).toEqual(['CREAR', 'CREAR']);
    expect(con(r, 'ERROR', 'PRODUCTO_DUPLICADO')).toHaveLength(0);
  });

  it('el mismo nombre y noches (sin tildes ni mayúsculas) dos veces es PRODUCTO_DUPLICADO', () => {
    const r = correr(
      propuesta([producto({ nombre: 'Piangüita' }), producto({ nombre: ' PIANGUITA ' })]),
    );
    expect(con(r, 'ERROR', 'PRODUCTO_DUPLICADO')).toHaveLength(1);
  });

  it('un nombre que casa con dos paquetes actuales es ERROR PAQUETE_AMBIGUO', () => {
    const base = catalogoDesde(propuesta([producto()]));
    const p0 = base.paquetes[0];
    if (!p0) throw new Error('fixture');
    const actual: CatalogoActual = {
      mayoristas: [],
      paquetes: [p0, { ...p0, id: 'otro', codigo: 'X-2' }],
    };
    const r = correr(propuesta([producto({ nombre: 'ISLA PALMA' })]), actual);
    expect(con(r, 'ERROR', 'PAQUETE_AMBIGUO')).toHaveLength(1);
  });

  it('con codigo, el codigo manda sobre el nombre', () => {
    const base = catalogoDesde(propuesta([producto({ codigo: 'CT-1' })]));
    const r = correr(
      propuesta([producto({ codigo: 'CT-1', nombre: 'Isla Palma Renombrada' })], 'API'),
      base,
    );
    expect(r.plan.paquetes[0]).toMatchObject({ accion: 'ACTUALIZAR', paqueteId: 'p0' });
  });

  it('misma propuesta contra el catálogo ya igual: todo SIN_CAMBIOS, nada que escribir', () => {
    const p = propuesta([producto({ inclusiones: ['Almuerzo'] })]);
    const r = correr(p, catalogoDesde(p));
    expect(r.informe.resumen).toMatchObject({
      creados: 0,
      actualizados: 0,
      sinCambios: 1,
      errores: 0,
    });
    const paquete = r.plan.paquetes[0];
    expect(paquete?.accion).toBe('SIN_CAMBIOS');
    expect(paquete?.vigencias.every((v) => v.accion === 'SIN_CAMBIOS')).toBe(true);
    expect(
      paquete?.vigencias.flatMap((v) => v.tarifas).every((t) => t.accion === 'SIN_CAMBIOS'),
    ).toBe(true);
  });

  it('un precio distinto es ACTUALIZAR de la tarifa, la vigencia y el paquete', () => {
    const anterior = propuesta();
    const nueva = propuesta([
      producto({
        vigencias: [
          {
            desde: '2026-12-01',
            hasta: '2027-03-31',
            tarifas: [
              {
                nombre: 'Adulto',
                unidad: 'POR_PERSONA',
                venta: { unidades: '330000', moneda: 'COP' },
              },
            ],
          },
        ],
      }),
    ]);
    const r = correr(nueva, catalogoDesde(anterior));
    expect(r.plan.paquetes[0]?.accion).toBe('ACTUALIZAR');
    expect(r.plan.paquetes[0]?.vigencias[0]?.tarifas[0]?.accion).toBe('ACTUALIZAR');
  });

  it('lo que no viene en la propuesta no se toca y se lista como no incluido', () => {
    const otro = catalogoDesde(propuesta([producto({ nombre: 'City Tour', codigo: 'CT-9' })]));
    const r = correr(propuesta(), otro);
    expect(r.informe.noIncluidos).toEqual([{ codigo: 'CT-9', nombre: 'City Tour' }]);
    expect(r.plan.paquetes).toHaveLength(1);
  });

  it('un mayorista que no existe es un aviso, una sola vez', () => {
    const t = (nombre: string) => ({
      nombre,
      unidad: 'POR_PERSONA' as const,
      venta: { unidades: '1', moneda: 'COP' as const },
      mayorista: 'Operador Caribe',
    });
    const r = correr(
      propuesta([
        producto({
          vigencias: [{ desde: '2026-12-01', hasta: '2026-12-31', tarifas: [t('A'), t('B')] }],
        }),
      ]),
    );
    expect(con(r, 'AVISO', 'MAYORISTA_NUEVO')).toHaveLength(1);
  });
});

describe('huella', () => {
  it('es estable para la misma entrada, independiente del orden de claves, y cambia con el tenantId', () => {
    const a = correr(propuesta(), VACIO, CON_NETO, 'tenant-a').informe.huella;
    expect(correr(propuesta(), VACIO, CON_NETO, 'tenant-a').informe.huella).toBe(a);
    expect(correr(propuesta(), VACIO, CON_NETO, 'tenant-b').informe.huella).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);

    const reordenado = PropuestaDeCatalogo.parse({
      productos: [
        {
          vigencias: producto().vigencias,
          noches: 0,
          dias: 1,
          destino: 'Cartagena',
          nombre: 'Isla Palma',
        },
      ],
      origen: 'PANTALLA',
      version: 1,
    });
    expect(correr(reordenado).informe.huella).toBe(a);
  });

  it('cambia si cambia un precio', () => {
    const otro = propuesta([
      producto({
        vigencias: [
          {
            desde: '2026-12-01',
            hasta: '2027-03-31',
            tarifas: [
              {
                nombre: 'Adulto',
                unidad: 'POR_PERSONA',
                venta: { unidades: '320001', moneda: 'COP' },
              },
            ],
          },
        ],
      }),
    ]);
    expect(correr(otro).informe.huella).not.toBe(correr(propuesta()).informe.huella);
  });
});

describe('campos que dependen de M2', () => {
  const conM2 = producto({
    codigo: 'CT-1',
    formato: 'excursion-un-dia',
    planAlimentacion: null,
    opcionesDeSalida: [{ etiqueta: 'Lancha', horaSalida: '07:30' }],
    cargosEnDestino: [
      {
        concepto: 'Tasa portuaria',
        monto: { unidades: '29000', moneda: 'COP' },
        unidad: 'POR_PERSONA',
      },
    ],
    camposPersonalizados: { nivel: 'bajo' },
    vigencias: [
      {
        desde: '2026-12-01',
        hasta: '2026-12-31',
        tarifas: [
          {
            nombre: 'Adulto',
            unidad: 'POR_PERSONA',
            venta: { unidades: '100', moneda: 'COP' },
            lista: { unidades: '150', moneda: 'COP' },
            promoHasta: '2026-12-15',
            opcionDeSalida: 'Lancha',
          },
        ],
      },
    ],
  });

  it('producen AVISO CAMPO_NO_SOPORTADO_AUN y no ERROR', () => {
    const r = correr(propuesta([conM2]));
    const rutas = con(r, 'AVISO', 'CAMPO_NO_SOPORTADO_AUN').map(
      (e) => e.ruta.split('.').slice(-1)[0],
    );
    expect(rutas).toEqual(
      expect.arrayContaining([
        'codigo',
        'formato',
        'planAlimentacion (nulo)',
        'opcionesDeSalida',
        'cargosEnDestino',
        'camposPersonalizados',
        'lista',
        'promoHasta',
        'opcionDeSalida',
      ]),
    );
    expect(r.informe.resumen.errores).toBe(0);
  });

  it('con M2 soportado ya no avisan', () => {
    const r = correr(propuesta([conM2]), VACIO, CON_NETO, 't', true);
    expect(con(r, 'AVISO', 'CAMPO_NO_SOPORTADO_AUN')).toHaveLength(0);
  });
});

describe('opciones de salida', () => {
  const t = (opcionDeSalida?: string) => ({
    nombre: 'Adulto',
    unidad: 'POR_PERSONA' as const,
    venta: { unidades: '1', moneda: 'COP' as const },
    ...(opcionDeSalida ? { opcionDeSalida } : {}),
  });
  const con2 = (tarifaOpcion: string | undefined, etiquetas: string[]) =>
    propuesta([
      producto({
        opcionesDeSalida: etiquetas.map((etiqueta) => ({ etiqueta })),
        vigencias: [{ desde: '2026-12-01', hasta: '2026-12-31', tarifas: [t(tarifaOpcion)] }],
      }),
    ]);

  it('una tarifa que nombra una etiqueta del mismo producto es válida (sin importar tildes ni caso)', () => {
    const r = correr(con2('LANCHA', ['Lancha', 'Terrestre']), VACIO, CON_NETO, 't', true);
    expect(r.informe.resumen.errores).toBe(0);
  });

  it('una etiqueta que el producto no tiene es ERROR OPCION_DE_SALIDA_DESCONOCIDA', () => {
    const r = correr(con2('Helicóptero', ['Lancha']), VACIO, CON_NETO, 't', true);
    expect(con(r, 'ERROR', 'OPCION_DE_SALIDA_DESCONOCIDA')).toHaveLength(1);
    const sinOpciones = correr(con2('Lancha', []), VACIO, CON_NETO, 't', true);
    expect(con(sinOpciones, 'ERROR', 'OPCION_DE_SALIDA_DESCONOCIDA')).toHaveLength(1);
  });

  it('etiqueta repetida en un producto es ERROR', () => {
    const r = correr(con2(undefined, ['Lancha', ' lancha ']), VACIO, CON_NETO, 't', true);
    expect(con(r, 'ERROR', 'OPCION_DE_SALIDA_REPETIDA')).toHaveLength(1);
  });
});
