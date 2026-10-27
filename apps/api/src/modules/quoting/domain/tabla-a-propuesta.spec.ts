import type { MapeoDeColumnas, TablaDeImportacion } from '@viajapro/contracts';
import { describe, expect, it } from 'vitest';
import { leerDinero, leerFecha, MapeoInvalidoError, tablaAPropuesta } from './tabla-a-propuesta.js';
import { validarYPlanificar } from './validar-y-planificar.js';

describe('leerDinero', () => {
  it.each([
    ['$ 1.236.000', 'COP', '1236000'],
    ['1236000', 'COP', '1236000'],
    ['12,50', 'USD', '1250'],
    ['12.5', 'USD', '1250'],
    ['1,236.50', 'USD', '123650'],
    ['1.236,5', 'EUR', '123650'],
    ['100', 'USD', '10000'],
  ] as const)('%s en %s = %s', (texto, moneda, esperado) => {
    expect(leerDinero(texto, moneda)).toBe(esperado);
  });

  it.each([
    ['12,50', 'COP'],
    ['abc', 'COP'],
    ['-5', 'USD'],
    ['1.23', 'COP'],
    ['1.2.3', 'USD'],
    ['', 'USD'],
  ] as const)('%s en %s no se lee', (texto, moneda) => {
    expect(leerDinero(texto, moneda)).toBeNull();
  });
});

describe('leerFecha', () => {
  it('lee DD/MM/AAAA y AAAA-MM-DD', () => {
    expect(leerFecha('15/12/2026', 'DD/MM/AAAA')).toBe('2026-12-15');
    expect(leerFecha('12/15/2026', 'MM/DD/AAAA')).toBe('2026-12-15');
    expect(leerFecha('2026-12-05')).toBe('2026-12-05');
  });
  it('rechaza fechas que no existen', () => {
    expect(leerFecha('31/02/2026')).toBeNull();
    expect(leerFecha('2026-13-01')).toBeNull();
    expect(leerFecha('mañana')).toBeNull();
  });
});

const ENCABEZADOS = [
  'Tour',
  'Destino',
  'Fecha salida',
  'Tarifa',
  'Precio',
  'Neto',
  'Opción',
  'Hora salida',
];
const mapeo = (extra: Partial<MapeoDeColumnas> = {}): MapeoDeColumnas => ({
  formato: 'excursion-un-dia',
  columnas: {
    nombre: 0,
    destino: 1,
    vigencia_desde: 2,
    tarifa_nombre: 3,
    precio_venta: 4,
    precio_neto: 5,
    opcion_salida: 6,
    hora_salida: 7,
  },
  moneda: 'COP',
  formatoDeFecha: 'DD/MM/AAAA',
  ...extra,
});
const tabla = (filas: string[][]): TablaDeImportacion => ({
  encabezados: ENCABEZADOS,
  filas,
  filaInicial: 2,
});
const CATALOGO_VACIO = { paquetes: [], mayoristas: [] };
const PERMISOS = ['catalogo.administrar'] as const;

describe('tablaAPropuesta', () => {
  it('convierte filas en una propuesta ARCHIVO con procedencia', () => {
    const r = tablaAPropuesta(
      tabla([
        ['Isla Palma', 'Cartagena', '15/12/2026', 'Adulto', '$ 320.000', '', '', ''],
        ['Isla Palma', 'Cartagena', '15/12/2026', 'Niño', '250.000', '', '', ''],
      ]),
      mapeo(),
    );
    expect(r.errores).toEqual([]);
    const p = r.propuesta;
    expect(p?.origen).toBe('ARCHIVO');
    expect(p?.productos).toHaveLength(1);
    const v = p?.productos[0]?.vigencias;
    expect(v).toHaveLength(1);
    expect(v?.[0]).toMatchObject({ desde: '2026-12-15', hasta: '2026-12-15' });
    expect(v?.[0]?.tarifas.map((t) => t.venta.unidades)).toEqual(['320000', '250000']);
    expect(v?.[0]?.tarifas[0]?.procedencia).toEqual({ fila: 2, columna: 'Precio' });
  });

  it('31/02/2026 es FECHA_INVALIDA con fila y columna, y la fila no entra', () => {
    const r = tablaAPropuesta(
      tabla([
        ['Isla Palma', 'Cartagena', '15/12/2026', 'Adulto', '320000', '', '', ''],
        ['Rosario', 'Cartagena', '31/02/2026', 'Adulto', '100000', '', '', ''],
      ]),
      mapeo(),
    );
    expect(r.errores).toHaveLength(1);
    expect(r.errores[0]).toMatchObject({
      nivel: 'ERROR',
      codigo: 'FECHA_INVALIDA',
      procedencia: { fila: 3, columna: 'Fecha salida' },
    });
    expect(r.propuesta?.productos.map((p) => p.nombre)).toEqual(['Isla Palma']);
  });

  it('sin precio no es error: el núcleo avisa SIN_PRECIO', () => {
    const r = tablaAPropuesta(tabla([['Mantas', 'Cartagena', '', '', '', '', '', '']]), mapeo());
    expect(r.errores).toEqual([]);
    const { informe } = validarYPlanificar(r.propuesta!, CATALOGO_VACIO, PERMISOS, {
      tenantId: 't',
      soportaM2: true,
    });
    expect(informe.elementos.map((e) => e.codigo)).toEqual(['SIN_PRECIO']);
  });

  it('un lote de 19 filas (17 con precio, 2 sin) da 17 OK y 2 AVISO SIN_PRECIO', () => {
    const filas: string[][] = [];
    for (let i = 1; i <= 17; i++) {
      filas.push([`Tour ${i}`, 'Cartagena', '15/12/2026', 'Adulto', `${100 + i}.000`, '', '', '']);
    }
    filas.push(['Mantas', 'Cartagena', '', '', '', '', '', '']);
    filas.push(['Coco Liso', 'Cartagena', '', '', '', '', '', '']);
    const r = tablaAPropuesta(tabla(filas), mapeo());
    const { informe } = validarYPlanificar(r.propuesta!, CATALOGO_VACIO, PERMISOS, {
      tenantId: 't',
      soportaM2: true,
    });
    expect(informe.elementos.filter((e) => e.nivel === 'OK')).toHaveLength(17);
    const avisos = informe.elementos.filter((e) => e.codigo === 'SIN_PRECIO');
    expect(avisos).toHaveLength(2);
    expect(informe.resumen).toMatchObject({ errores: 0, avisos: 2, creados: 19 });
  });

  it('la misma opción con otras horas es OPCION_INCOHERENTE', () => {
    const r = tablaAPropuesta(
      tabla([
        ['VIP', 'Cartagena', '15/12/2026', 'Adulto', '100000', '', 'Mañana', '08:00'],
        ['VIP', 'Cartagena', '15/12/2026', 'Niño', '80000', '', 'Mañana', '09:00'],
      ]),
      mapeo(),
    );
    expect(r.errores.map((e) => e.codigo)).toEqual(['OPCION_INCOHERENTE']);
  });

  it('celda obligatoria vacía y moneda sin columna ni valor por defecto', () => {
    const r = tablaAPropuesta(
      tabla([['', 'Cartagena', '15/12/2026', 'Adulto', '100000', '', '', '']]),
      mapeo(),
    );
    expect(r.errores[0]).toMatchObject({ codigo: 'CELDA_OBLIGATORIA' });
    expect(r.propuesta).toBeNull();
  });

  it('mapeo inválido: formato, clave o índice desconocidos y obligatorias sin mapear', () => {
    const t = tabla([]);
    expect(() => tablaAPropuesta(t, mapeo({ formato: 'no-existe' }))).toThrow(MapeoInvalidoError);
    expect(() => tablaAPropuesta(t, mapeo({ columnas: { inventada: 0 } }))).toThrow(
      MapeoInvalidoError,
    );
    expect(() =>
      tablaAPropuesta(t, mapeo({ columnas: { nombre: 0, destino: 1, precio_venta: 99 } })),
    ).toThrow(MapeoInvalidoError);
    expect(() => tablaAPropuesta(t, mapeo({ columnas: { nombre: 0 } }))).toThrow(
      /faltan columnas obligatorias/,
    );
  });

  it('el neto se lee y el núcleo lo rechaza sin permiso de neto', () => {
    const r = tablaAPropuesta(
      tabla([['Isla', 'Cartagena', '15/12/2026', 'Adulto', '100000', '80000', '', '']]),
      mapeo(),
    );
    const { informe } = validarYPlanificar(r.propuesta!, CATALOGO_VACIO, PERMISOS, {
      tenantId: 't',
      soportaM2: true,
    });
    expect(informe.elementos.map((e) => e.codigo)).toContain('NETO_SIN_PERMISO');
  });
});
