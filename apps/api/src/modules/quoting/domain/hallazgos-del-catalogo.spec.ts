/**
 * Hallazgos de la tanda 2026-10-26 sobre el núcleo (T-064, T-065): el validador ve como cambio lo
 * que solo toca opciones de salida, cargos en destino o formato (también su orden); la moneda de
 * tarifas y cargos se valida contra la tabla `monedas`; y sin permiso de neto no se puede cambiar
 * la moneda de una tarifa que ya tiene neto.
 */
import {
  PropuestaDeCatalogo,
  type Permiso,
  type PropuestaDeCatalogoEntrada,
} from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import {
  validarYPlanificar,
  type CatalogoActual,
  type PaqueteActual,
} from './validar-y-planificar.js';

type Entrada = PropuestaDeCatalogoEntrada['productos'][number];

const CON_NETO: readonly Permiso[] = ['catalogo.administrar', 'cotizacion.ver_neto_y_margen'];
const SIN_NETO: readonly Permiso[] = ['catalogo.administrar'];

const CONDICION = {
  acomodacion: null,
  tipoPasajero: null,
  edadMinima: null,
  edadMaxima: null,
  pasajerosMinimo: null,
  pasajerosMaximo: null,
  ocupaSilla: null,
} as const;

const producto = (extra: Partial<Entrada> = {}): Entrada => ({
  codigo: 'IP-1',
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

const parse = (p: Entrada) =>
  PropuestaDeCatalogo.parse({ version: 1, origen: 'PANTALLA', productos: [p] });

const CARGO = {
  concepto: 'Tasa',
  monto: { unidades: '29000', moneda: 'COP' },
  unidad: 'POR_PERSONA',
} as const;

const OPCIONES = [
  {
    etiqueta: 'Lancha',
    horaSalida: '08:00',
    horaRegreso: null,
    puntoDeEncuentro: null,
    activa: true,
  },
  {
    etiqueta: 'Catamarán',
    horaSalida: '09:00',
    horaRegreso: null,
    puntoDeEncuentro: null,
    activa: true,
  },
];

/** El paquete tal como lo dejó `producto()`: vigencias y tarifas idénticas, para aislar el cambio. */
const actual = (
  extra: Partial<PaqueteActual> = {},
  neto: string | null = null,
): CatalogoActual => ({
  mayoristas: [],
  paquetes: [
    {
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
      cargosEnDestino: [CARGO],
      opcionesDeSalida: OPCIONES,
      vigencias: [
        {
          desde: '2026-12-01',
          hasta: '2027-03-31',
          publicada: false,
          tarifas: [
            {
              nombre: 'Adulto',
              unidad: 'POR_PERSONA',
              cubrePasajeros: 1,
              neto: neto === null ? null : { unidades: neto, moneda: 'COP' },
              venta: { unidades: '320000', moneda: 'COP' },
              lista: null,
              promoHasta: null,
              mayorista: null,
              aditiva: false,
              condicion: CONDICION,
            },
          ],
        },
      ],
      ...extra,
    },
  ],
});

const correr = (p: Entrada, catalogo: CatalogoActual, permisos: readonly Permiso[] = CON_NETO) =>
  validarYPlanificar(parse(p), catalogo, permisos, { tenantId: 't' });

const mismo = {
  formato: 'Pasadía',
  cargosEnDestino: [CARGO],
  opcionesDeSalida: [
    { etiqueta: 'Lancha', horaSalida: '08:00' },
    { etiqueta: 'Catamarán', horaSalida: '09:00' },
  ],
} satisfies Partial<Entrada>;

describe('T-065: el validador detecta cambios que solo tocan M2', () => {
  it('línea base: lo mismo es SIN_CAMBIOS', () => {
    const r = correr(producto(mismo), actual());
    expect(r.informe.resumen).toMatchObject({ errores: 0, sinCambios: 1, actualizados: 0 });
  });

  it('solo una opción de salida (la hora) es ACTUALIZAR', () => {
    const r = correr(
      producto({
        ...mismo,
        opcionesDeSalida: [
          { etiqueta: 'Lancha', horaSalida: '08:30' },
          { etiqueta: 'Catamarán', horaSalida: '09:00' },
        ],
      }),
      actual(),
    );
    expect(r.plan.paquetes[0]?.accion).toBe('ACTUALIZAR');
  });

  it('solo reordenar las opciones de salida es ACTUALIZAR (el orden es dato)', () => {
    const r = correr(
      producto({
        ...mismo,
        opcionesDeSalida: [
          { etiqueta: 'Catamarán', horaSalida: '09:00' },
          { etiqueta: 'Lancha', horaSalida: '08:00' },
        ],
      }),
      actual(),
    );
    expect(r.plan.paquetes[0]?.accion).toBe('ACTUALIZAR');
  });

  it('solo quitar una opción de salida es ACTUALIZAR', () => {
    const r = correr(
      producto({ ...mismo, opcionesDeSalida: [{ etiqueta: 'Lancha', horaSalida: '08:00' }] }),
      actual(),
    );
    expect(r.plan.paquetes[0]?.accion).toBe('ACTUALIZAR');
  });

  it('solo un cargo en destino (monto, o quitarlos todos) es ACTUALIZAR', () => {
    const monto = correr(
      producto({
        ...mismo,
        cargosEnDestino: [{ ...CARGO, monto: { unidades: '30000', moneda: 'COP' } }],
      }),
      actual(),
    );
    expect(monto.plan.paquetes[0]?.accion).toBe('ACTUALIZAR');
    const vaciar = correr(producto({ ...mismo, cargosEnDestino: [] }), actual());
    expect(vaciar.plan.paquetes[0]?.accion).toBe('ACTUALIZAR');
  });

  it('solo el formato es ACTUALIZAR', () => {
    const r = correr(producto({ ...mismo, formato: 'Excursión' }), actual());
    expect(r.plan.paquetes[0]?.accion).toBe('ACTUALIZAR');
  });
});

describe('T-065: la moneda se valida contra la tabla monedas', () => {
  it('una moneda que no está en la tabla es ERROR MONEDA_NO_HABILITADA', () => {
    const catalogo: CatalogoActual = { paquetes: [], mayoristas: [], monedas: ['COP'] };
    const usd = producto({
      vigencias: [
        {
          desde: '2026-12-01',
          hasta: '2027-03-31',
          tarifas: [
            { nombre: 'Adulto', unidad: 'POR_PERSONA', venta: { unidades: '250', moneda: 'USD' } },
          ],
        },
      ],
    });
    const r = correr(usd, catalogo);
    expect(r.informe.elementos.filter((e) => e.codigo === 'MONEDA_NO_HABILITADA')).toHaveLength(1);
    expect(r.informe.resumen.errores).toBe(1);
  });

  it('con la moneda habilitada pasa; sin lista de monedas no se valida (compatibilidad)', () => {
    const vigencias = [
      {
        desde: '2026-12-01',
        hasta: '2027-03-31',
        tarifas: [
          {
            nombre: 'Adulto',
            unidad: 'POR_PERSONA' as const,
            venta: { unidades: '250', moneda: 'USD' as const },
          },
        ],
      },
    ];
    const vacio: CatalogoActual = { paquetes: [], mayoristas: [] };
    expect(
      correr(producto({ vigencias }), { ...vacio, monedas: ['COP', 'USD'] }).informe.resumen
        .errores,
    ).toBe(0);
    expect(correr(producto({ vigencias }), vacio).informe.resumen.errores).toBe(0);
  });

  it('el monto de un cargo en destino también se valida', () => {
    const vacio: CatalogoActual = { paquetes: [], mayoristas: [], monedas: ['COP'] };
    const r = correr(
      producto({
        cargosEnDestino: [{ ...CARGO, monto: { unidades: '10', moneda: 'EUR' } }],
      }),
      vacio,
    );
    expect(r.informe.elementos.map((e) => e.codigo)).toContain('MONEDA_NO_HABILITADA');
  });
});

describe('T-064: moneda y neto sin permiso de neto', () => {
  const enUsd = producto({
    vigencias: [
      {
        desde: '2026-12-01',
        hasta: '2027-03-31',
        tarifas: [
          { nombre: 'Adulto', unidad: 'POR_PERSONA', venta: { unidades: '90', moneda: 'USD' } },
        ],
      },
    ],
  });

  it('sin permiso, cambiar la moneda de una tarifa con neto es ERROR', () => {
    const r = correr(enUsd, actual({}, '250000'), SIN_NETO);
    expect(r.informe.elementos.filter((e) => e.nivel === 'ERROR').map((e) => e.codigo)).toEqual([
      'CAMBIO_DE_MONEDA_SIN_PERMISO_DE_NETO',
    ]);
  });

  it('sin permiso, cambiar la moneda de una tarifa SIN neto es válido (no hay neto que descuadrar)', () => {
    expect(correr(enUsd, actual({}, null), SIN_NETO).informe.resumen.errores).toBe(0);
  });

  it('sin permiso, cambiar solo el importe en la misma moneda sigue siendo válido', () => {
    const r = correr(
      producto({
        vigencias: [
          {
            desde: '2026-12-01',
            hasta: '2027-03-31',
            tarifas: [
              {
                nombre: 'Adulto',
                unidad: 'POR_PERSONA',
                venta: { unidades: '350000', moneda: 'COP' },
              },
            ],
          },
        ],
      }),
      actual({}, '250000'),
      SIN_NETO,
    );
    expect(r.informe.resumen.errores).toBe(0);
  });

  it('con permiso y sin mandar el neto, el desajuste lo atrapa MONEDA_INCOHERENTE si se manda otro neto', () => {
    const r = correr(
      producto({
        vigencias: [
          {
            desde: '2026-12-01',
            hasta: '2027-03-31',
            tarifas: [
              {
                nombre: 'Adulto',
                unidad: 'POR_PERSONA',
                venta: { unidades: '90', moneda: 'USD' },
                neto: { unidades: '250000', moneda: 'COP' },
              },
            ],
          },
        ],
      }),
      actual({}, '250000'),
      CON_NETO,
    );
    expect(r.informe.elementos.map((e) => e.codigo)).toContain('MONEDA_INCOHERENTE');
  });
});
