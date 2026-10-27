/**
 * Plantillas de catálogo — el descriptor de las columnas que pide cada tipo de producto.
 *
 * **No es la plantilla de WhatsApp** (`plantillas.ts`). Una plantilla de catálogo describe qué
 * columnas tiene la hoja (CSV o `.xlsx`) con que una agencia carga un tipo de producto; la web
 * renderiza el archivo a partir de este descriptor. ADR-0017 §4.2.
 *
 * Es solo de entrada y presentación: ninguna ruta de cálculo ramifica sobre el formato (ADR-0009).
 * Hasta que exista `formatos_de_viaje` (migración M2), estas constantes son la fuente; M2 siembra
 * la tabla desde ellas.
 *
 * Las claves de columna son **contrato estable**: renombrar una es un cambio incompatible y exige
 * subir `version`.
 */

import { z } from 'zod';

export const TipoDeColumna = z.enum([
  'TEXTO',
  'ENTERO',
  /** Entero en la unidad mínima de la moneda (en COP, el peso). */
  'DINERO',
  'MONEDA',
  'FECHA',
  'HORA',
  'BOOLEANO',
  'ENUM',
  'LISTA',
]);
export type TipoDeColumna = z.infer<typeof TipoDeColumna>;

export const ColumnaDePlantilla = z
  .object({
    clave: z.string().regex(/^[a-z][a-z0-9_]*$/),
    etiqueta: z.string().min(1),
    tipo: TipoDeColumna,
    obligatoria: z.boolean(),
    ejemplo: z.string(),
    /** Valores admitidos cuando `tipo` es `ENUM`. */
    valores: z.array(z.string()).optional(),
  })
  .strict();
export type ColumnaDePlantilla = z.infer<typeof ColumnaDePlantilla>;

export const DescriptorDePlantilla = z
  .object({
    /** Clave del formato de sistema: `excursion-un-dia`, `pasadia`, … */
    formato: z.string().regex(/^[a-z][a-z0-9-]*$/),
    nombre: z.string().min(1),
    version: z.number().int().min(1),
    columnas: z.array(ColumnaDePlantilla).min(1),
    /** Valores por defecto de la hoja cuando la celda viene vacía. */
    valoresPorDefecto: z
      .object({
        dias: z.number().int().min(1).optional(),
        noches: z.number().int().min(0).optional(),
        unidad: z.enum(['POR_PERSONA', 'POR_GRUPO']).optional(),
      })
      .strict(),
  })
  .strict();
export type DescriptorDePlantilla = z.infer<typeof DescriptorDePlantilla>;

const texto = (
  clave: string,
  etiqueta: string,
  obligatoria: boolean,
  ejemplo: string,
): ColumnaDePlantilla => ({ clave, etiqueta, tipo: 'TEXTO', obligatoria, ejemplo });
const entero = (
  clave: string,
  etiqueta: string,
  obligatoria: boolean,
  ejemplo: string,
): ColumnaDePlantilla => ({ clave, etiqueta, tipo: 'ENTERO', obligatoria, ejemplo });
const dinero = (
  clave: string,
  etiqueta: string,
  obligatoria: boolean,
  ejemplo: string,
): ColumnaDePlantilla => ({ clave, etiqueta, tipo: 'DINERO', obligatoria, ejemplo });
const fecha = (
  clave: string,
  etiqueta: string,
  obligatoria: boolean,
  ejemplo: string,
): ColumnaDePlantilla => ({ clave, etiqueta, tipo: 'FECHA', obligatoria, ejemplo });
const hora = (clave: string, etiqueta: string, ejemplo: string): ColumnaDePlantilla => ({
  clave,
  etiqueta,
  tipo: 'HORA',
  obligatoria: false,
  ejemplo,
});

const PLAN_DE_ALIMENTACION = [
  'TODO_INCLUIDO',
  'DESAYUNO',
  'MEDIA_PENSION',
  'PENSION_COMPLETA',
  'SIN_ALIMENTACION',
];

/** Producto: lo que identifica y describe al paquete. Se repite en cada fila del mismo producto. */
const columnasDeProducto = (opciones: {
  dias: boolean;
  noches: boolean;
  plan: 'NO' | 'OPCIONAL' | 'OBLIGATORIO';
}): ColumnaDePlantilla[] => [
  texto('codigo', 'Código', false, 'CT-001'),
  texto('nombre', 'Nombre del producto', true, 'Isla Palma'),
  texto('destino', 'Destino', true, 'Cartagena'),
  entero('dias', 'Días', opciones.dias, '1'),
  entero('noches', 'Noches', opciones.noches, '0'),
  ...(opciones.plan === 'NO'
    ? []
    : [
        {
          clave: 'plan_alimentacion',
          etiqueta: 'Plan de alimentación',
          tipo: 'ENUM' as const,
          obligatoria: opciones.plan === 'OBLIGATORIO',
          ejemplo: 'TODO_INCLUIDO',
          valores: PLAN_DE_ALIMENTACION,
        },
      ]),
  {
    clave: 'inclusiones',
    etiqueta: 'Incluye',
    tipo: 'LISTA',
    obligatoria: false,
    ejemplo: 'Almuerzo | Transporte',
  },
  {
    clave: 'exclusiones',
    etiqueta: 'No incluye',
    tipo: 'LISTA',
    obligatoria: false,
    ejemplo: 'Impuesto de muelle',
  },
];

/** Vigencia, tarifa y opción de salida: una fila por tarifa. */
const columnasDeTarifa = (opciones: { acomodacion: boolean }): ColumnaDePlantilla[] => [
  fecha('vigencia_desde', 'Vigencia desde', true, '2026-12-01'),
  fecha('vigencia_hasta', 'Vigencia hasta', true, '2027-03-31'),
  {
    clave: 'publicada',
    etiqueta: 'Salida publicada',
    tipo: 'BOOLEANO',
    obligatoria: false,
    ejemplo: 'no',
  },
  texto('tarifa_nombre', 'Nombre de la tarifa', true, 'Adulto'),
  {
    clave: 'unidad',
    etiqueta: 'Unidad de cobro',
    tipo: 'ENUM',
    obligatoria: false,
    ejemplo: 'POR_PERSONA',
    valores: ['POR_PERSONA', 'POR_GRUPO'],
  },
  entero('cubre_pasajeros', 'Pasajeros que cubre', false, '1'),
  ...(opciones.acomodacion
    ? [
        {
          clave: 'acomodacion',
          etiqueta: 'Acomodación',
          tipo: 'ENUM' as const,
          obligatoria: false,
          ejemplo: 'DOBLE',
          valores: ['SENCILLA', 'DOBLE', 'TRIPLE', 'CUADRUPLE'],
        },
        {
          clave: 'tipo_pasajero',
          etiqueta: 'Tipo de pasajero',
          tipo: 'ENUM' as const,
          obligatoria: false,
          ejemplo: 'ADT',
          valores: ['ADT', 'CHD', 'INF'],
        },
      ]
    : []),
  dinero('precio_neto', 'Precio neto (unidad mínima)', false, '240000'),
  dinero('precio_venta', 'Precio de venta (unidad mínima)', true, '320000'),
  {
    clave: 'moneda',
    etiqueta: 'Moneda',
    tipo: 'MONEDA',
    obligatoria: true,
    ejemplo: 'COP',
    valores: ['COP', 'USD', 'EUR', 'MXN'],
  },
  dinero('precio_lista', 'Precio de lista (tachado)', false, '380000'),
  fecha('promo_hasta', 'Promoción hasta', false, '2026-12-31'),
  texto('mayorista', 'Mayorista', false, 'Operador Caribe'),
  texto('opcion_salida', 'Opción de salida', false, 'Lancha'),
  hora('hora_salida', 'Hora de salida', '07:30'),
  hora('hora_regreso', 'Hora de regreso', '16:00'),
  texto('punto_encuentro', 'Punto de encuentro', false, 'Muelle de la Bodeguita'),
];

const VERSION = 1;

export const PLANTILLAS_DE_SISTEMA: readonly DescriptorDePlantilla[] = [
  {
    formato: 'excursion-un-dia',
    nombre: 'Excursión de un día',
    version: VERSION,
    columnas: [
      ...columnasDeProducto({ dias: false, noches: false, plan: 'NO' }),
      ...columnasDeTarifa({ acomodacion: false }),
    ],
    valoresPorDefecto: { dias: 1, noches: 0, unidad: 'POR_PERSONA' },
  },
  {
    formato: 'pasadia',
    nombre: 'Pasadía',
    version: VERSION,
    columnas: [
      ...columnasDeProducto({ dias: false, noches: false, plan: 'OPCIONAL' }),
      ...columnasDeTarifa({ acomodacion: false }),
    ],
    valoresPorDefecto: { dias: 1, noches: 0, unidad: 'POR_PERSONA' },
  },
  {
    formato: 'pasanoche',
    nombre: 'Pasanoche',
    version: VERSION,
    columnas: [
      ...columnasDeProducto({ dias: false, noches: false, plan: 'OBLIGATORIO' }),
      ...columnasDeTarifa({ acomodacion: true }),
    ],
    valoresPorDefecto: { dias: 2, noches: 1, unidad: 'POR_PERSONA' },
  },
  {
    formato: 'paquete-con-hotel',
    nombre: 'Paquete con hotel',
    version: VERSION,
    columnas: [
      ...columnasDeProducto({ dias: true, noches: true, plan: 'OBLIGATORIO' }),
      ...columnasDeTarifa({ acomodacion: true }),
    ],
    valoresPorDefecto: { unidad: 'POR_PERSONA' },
  },
];
