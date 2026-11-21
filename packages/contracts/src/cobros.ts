/**
 * Cobros del viajero (`payments`, ADR-0034 §8): el libro de movimientos de cobro de un archivo de
 * viaje, su saldo y la vista «quién pagó y quién debe».
 *
 *   POST /api/v1/archivos/:id/pagos                    registra PAGO (`cobro.registrar`);
 *                                                      DEVOLUCION, AJUSTE y PENALIDAD (`cobro.corregir`)
 *   POST /api/v1/archivos/:id/pagos/:pagoId/reverso    anula un movimiento, con motivo (`cobro.corregir`)
 *   POST /api/v1/archivos/:id/plazo-de-cobro           fija la fecha límite del archivo (`cobro.corregir`)
 *   PUT  /api/v1/cobros/parametros                     días del plazo por defecto de la agencia (`cobro.corregir`)
 *   GET  /api/v1/archivos/:id/cobro                    total, pagado, saldo, situación, estado e historial (`cobro.ver`)
 *   GET  /api/v1/cobros                                la vista, con totales por moneda (`cobro.ver`)
 *
 * **Lo que el cliente NUNCA manda.** Ningún esquema de entrada acepta `registradoPor`,
 * `registradoEn`, `tenantId`, saldo, estado ni moneda del archivo como verdad: son `.strict()`,
 * así que una clave de más es un 400 y no un dato que se descarta en silencio. El autor sale de la
 * sesión; el instante, de la base; la agencia, de la sesión.
 *
 * **Dinero.** Entero en la unidad mínima de la moneda (en COP, el peso; en USD, el centavo),
 * serializado como texto (R8). Lo que el cliente manda es el monto con SU moneda, y el servidor la
 * compara con la del archivo. Nunca neto ni margen.
 *
 * **Sin datos de tarjeta** (ADR-0034 §2.4). `nota`, `referencia` y `motivo` rechazan un texto que,
 * tras quitar espacios, guiones y puntos, contenga 13 a 19 dígitos que pasen Luhn. El error NO
 * repite el valor.
 */
import { z } from 'zod';
import { Dinero, FechaViaje, Id, Instante } from './comunes.js';

export const TipoDeMovimientoDeCobro = z.enum([
  'PAGO',
  'DEVOLUCION',
  'AJUSTE',
  'PENALIDAD',
  'REVERSO',
]);
export type TipoDeMovimientoDeCobro = z.infer<typeof TipoDeMovimientoDeCobro>;

/** Catálogo cerrado (ADR-0034 §2.3), igual al CHECK `pagos_medio_del_catalogo`. */
export const MedioDePago = z.enum([
  'TRANSFERENCIA',
  'EFECTIVO',
  'TARJETA',
  'CONSIGNACION',
  'BILLETERA_DIGITAL',
  'PSE',
  'LINK_DE_PAGO',
  'OTRO',
]);
export type MedioDePago = z.infer<typeof MedioDePago>;

export const SituacionDelSaldo = z.enum(['SIN_PAGOS', 'PARCIAL', 'PAGADO', 'SALDO_A_FAVOR']);
export type SituacionDelSaldo = z.infer<typeof SituacionDelSaldo>;

export const EstadoDeCobro = z.enum([
  'AL_DIA',
  'SALDO_PENDIENTE',
  'POR_VENCER',
  'VENCIDO',
  'CANCELADO',
]);
export type EstadoDeCobro = z.infer<typeof EstadoDeCobro>;

/** Tope por movimiento: 10^15 − 1 (el CHECK `pagos_monto_por_tipo`). */
export const MONTO_MAXIMO_DE_COBRO = 999_999_999_999_999n;

// ---------------------------------------------------------------------------------------------
// Luhn: una red contra el asesor que pega la tarjeta en un campo de texto. No es una garantía.
// ---------------------------------------------------------------------------------------------

/** Luhn sobre una cadena de solo dígitos. Aritmética de dígitos sueltos: no es dinero. */
function pasaLuhn(digitos: string): boolean {
  let suma = 0;
  let doblar = false;
  for (let i = digitos.length - 1; i >= 0; i--) {
    let d = digitos.charCodeAt(i) - 48;
    if (doblar) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
    doblar = !doblar;
  }
  return suma % 10 === 0;
}

/**
 * `true` si el texto, tras quitar espacios, guiones y puntos, contiene una racha de 13 a 19
 * dígitos seguidos que pase Luhn. Se evalúa la racha ENTERA, no sus tramos: probar cada tramo de
 * 13 a 19 dígitos marcaría como tarjeta casi cualquier número largo (un tramo pasa Luhn una de cada
 * diez veces). Es una red contra quien pega la tarjeta, no una garantía.
 */
export function contieneNumeroDeTarjeta(texto: string): boolean {
  const limpio = texto.replace(/[\s.-]/g, '');
  return (limpio.match(/\d+/g) ?? []).some(
    (racha) => racha.length >= 13 && racha.length <= 19 && pasaLuhn(racha),
  );
}

const MENSAJE_DE_TARJETA =
  'El texto parece contener un número de tarjeta. Quítalo: no se guardan datos de tarjeta.';

/** Texto libre sin número de tarjeta. El mensaje no repite el valor. */
const textoSinTarjeta = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((t) => !contieneNumeroDeTarjeta(t), { message: MENSAJE_DE_TARJETA });

const Referencia = textoSinTarjeta(100);
const Nota = textoSinTarjeta(500);
const Motivo = textoSinTarjeta(500);

/** Fecha de calendario real (rechaza `2027-02-30`, que Postgres rechazaría con un 500). */
const FechaDeCalendario = FechaViaje.refine(
  (f) => {
    const [a = 0, m = 0, d = 0] = f.split('-').map(Number);
    const i = new Date(Date.UTC(a, m - 1, d));
    return i.getUTCFullYear() === a && i.getUTCMonth() === m - 1 && i.getUTCDate() === d;
  },
  { message: 'no es una fecha de calendario' },
);

/**
 * Un uuid normalizado a MINÚSCULAS. Postgres los devuelve así, y el reintento de una petición con
 * el id en mayúsculas no debe verse como «contenido distinto» (409) ni dar otra clave de candado.
 * Se exporta para validar los `:id` y `:pagoId` de las rutas con el mismo criterio.
 */
export const IdEnMinusculas = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

/**
 * El cliente la genera al abrir el formulario y la repite en cada reintento (ADR-0034 §4). Un
 * reintento con la misma clave debe traer **el cuerpo idéntico**, texto libre incluido: si algo
 * difiere —aunque sea solo la `nota` o la `referencia`— el servidor responde `409`
 * `CLAVE_DE_IDEMPOTENCIA_REUTILIZADA` y no guarda nada (ADR-0036). Para corregir lo que ya quedó
 * escrito hay que reversar y volver a registrar, que es de `cobro.corregir`.
 */
const ClaveDeIdempotencia = IdEnMinusculas;

/** Monto positivo: entero en texto, 1..10^15 − 1, con su moneda. */
const MontoPositivo = z
  .object({
    unidades: z
      .string()
      .regex(/^[1-9]\d{0,14}$/, 'debe ser un entero positivo de hasta 15 dígitos'),
    moneda: Dinero.shape.moneda,
  })
  .strict();

/** Monto de un AJUSTE: cargo (> 0) o descuento (< 0), nunca cero. */
const MontoConSigno = z
  .object({
    unidades: z
      .string()
      .regex(/^-?[1-9]\d{0,14}$/, 'debe ser un entero distinto de cero de hasta 15 dígitos'),
    moneda: Dinero.shape.moneda,
  })
  .strict();

// ---------------------------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------------------------

/** `PAGO`: dinero del viajero a la agencia. Exige `cobro.registrar`. */
export const RegistrarPago = z
  .object({
    tipo: z.literal('PAGO'),
    claveIdempotencia: ClaveDeIdempotencia,
    monto: MontoPositivo,
    pagadoEl: FechaDeCalendario,
    medio: MedioDePago,
    /** Quién pagó, si no es el titular: un contacto de la misma agencia. */
    pagadorId: IdEnMinusculas.optional(),
    referencia: Referencia.optional(),
    nota: Nota.optional(),
    /** Sin esto, un pago que deja el saldo a favor se rechaza. */
    confirmarSobrepago: z.boolean().optional(),
  })
  .strict();
export type RegistrarPago = z.infer<typeof RegistrarPago>;

/** `DEVOLUCION`: dinero que la agencia devolvió de verdad. Exige `cobro.corregir`. */
export const RegistrarDevolucion = z
  .object({
    tipo: z.literal('DEVOLUCION'),
    claveIdempotencia: ClaveDeIdempotencia,
    monto: MontoPositivo,
    pagadoEl: FechaDeCalendario,
    medio: MedioDePago,
    referencia: Referencia.optional(),
    nota: Nota.optional(),
  })
  .strict();
export type RegistrarDevolucion = z.infer<typeof RegistrarDevolucion>;

/** `AJUSTE`: cargo o descuento sobre el total vendido, con motivo. Exige `cobro.corregir`. */
export const RegistrarAjuste = z
  .object({
    tipo: z.literal('AJUSTE'),
    claveIdempotencia: ClaveDeIdempotencia,
    monto: MontoConSigno,
    motivo: Motivo,
  })
  .strict();
export type RegistrarAjuste = z.infer<typeof RegistrarAjuste>;

/** `PENALIDAD`: lo que la agencia retiene al cancelar, con motivo. Exige `cobro.corregir`. */
export const RegistrarPenalidad = z
  .object({
    tipo: z.literal('PENALIDAD'),
    claveIdempotencia: ClaveDeIdempotencia,
    monto: MontoPositivo,
    motivo: Motivo,
  })
  .strict();
export type RegistrarPenalidad = z.infer<typeof RegistrarPenalidad>;

/** `POST /api/v1/archivos/:id/pagos`. El `REVERSO` tiene su propia ruta. */
export const RegistrarMovimiento = z.discriminatedUnion('tipo', [
  RegistrarPago,
  RegistrarDevolucion,
  RegistrarAjuste,
  RegistrarPenalidad,
]);
export type RegistrarMovimiento = z.infer<typeof RegistrarMovimiento>;

/** `POST /api/v1/archivos/:id/pagos/:pagoId/reverso`. El monto, el tipo y el archivo son los del original. */
export const ReversarMovimiento = z
  .object({
    claveIdempotencia: ClaveDeIdempotencia,
    motivo: Motivo,
  })
  .strict();
export type ReversarMovimiento = z.infer<typeof ReversarMovimiento>;

/** `POST /api/v1/archivos/:id/plazo-de-cobro`. */
export const FijarPlazoDeCobro = z
  .object({
    venceEl: FechaDeCalendario,
    motivo: textoSinTarjeta(200).optional(),
  })
  .strict();
export type FijarPlazoDeCobro = z.infer<typeof FijarPlazoDeCobro>;

/** `PUT /api/v1/cobros/parametros`. */
export const FijarParametrosDeCobro = z
  .object({ diasPlazoDeCobro: z.number().int().min(0).max(365) })
  .strict();
export type FijarParametrosDeCobro = z.infer<typeof FijarParametrosDeCobro>;

/** `GET /api/v1/cobros`. Sin `estadoDeCobro`, todos los archivos abiertos. */
export const ListarCobros = z
  .object({
    estadoDeCobro: z.enum(['AL_DIA', 'SALDO_PENDIENTE', 'POR_VENCER', 'VENCIDO']).optional(),
    limite: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();
export type ListarCobros = z.infer<typeof ListarCobros>;

// ---------------------------------------------------------------------------------------------
// Salida
// ---------------------------------------------------------------------------------------------

/** Un movimiento del libro tal como se lee. Sin saldo, sin neto, sin margen. */
export const MovimientoDeCobro = z.object({
  id: Id,
  tipo: TipoDeMovimientoDeCobro,
  /** Con signo: negativo solo en un AJUSTE (descuento) y en el REVERSO que lo copia. */
  monto: Dinero,
  pagadoEl: FechaViaje.nullable(),
  medio: MedioDePago.nullable(),
  pagadorId: Id.nullable(),
  referencia: z.string().nullable(),
  nota: z.string().nullable(),
  /** La pantalla muestra «Nota tachada el …». */
  notaTachadaEn: Instante.nullable(),
  motivo: z.string().nullable(),
  /** Solo en un REVERSO: el movimiento que anula. */
  reversoDeId: Id.nullable(),
  /** Un REVERSO lo apunta: el movimiento ya no cuenta. */
  reversado: z.boolean(),
  registradoPor: Id,
  registradoEn: Instante,
});
export type MovimientoDeCobro = z.infer<typeof MovimientoDeCobro>;

/** Avisos que no impiden guardar. */
export const AvisoDeCobro = z.enum(['FECHA_LIMITE_POSTERIOR_AL_PAGO_TOTAL_DEL_MAYORISTA']);
export type AvisoDeCobro = z.infer<typeof AvisoDeCobro>;

export const CobroDelArchivo = z.object({
  archivoId: Id,
  moneda: Dinero.shape.moneda,
  estadoDelArchivo: z.enum(['ABIERTO', 'CANCELADO']),
  /** Abierto: venta + ajustes vigentes. Cancelado: penalidades vigentes. */
  total: Dinero,
  /** Pagos vigentes menos devoluciones vigentes. */
  pagado: Dinero,
  /** `total − pagado`; negativo = saldo a favor. */
  saldo: Dinero,
  situacion: SituacionDelSaldo,
  estadoDeCobro: EstadoDeCobro,
  /** `AAAA-MM-DD`, la que rige. */
  fechaLimite: FechaViaje,
  /** `true` si la fijó alguien a mano en este archivo; `false` si es la de la agencia. */
  fechaLimiteManual: z.boolean(),
  /** Los días de la agencia que se usaron (o 30 si no los fijó). */
  diasDePlazo: z.number().int().min(0).max(365),
  /** Del más antiguo al más reciente, orden `(registradoEn, id)`. */
  movimientos: z.array(MovimientoDeCobro),
  avisos: z.array(AvisoDeCobro),
});
export type CobroDelArchivo = z.infer<typeof CobroDelArchivo>;

/** La respuesta de registrar o reversar: la fila y cómo quedó el saldo. */
export const ResultadoDeMovimiento = z.object({
  movimiento: MovimientoDeCobro,
  cobro: CobroDelArchivo,
});
export type ResultadoDeMovimiento = z.infer<typeof ResultadoDeMovimiento>;

export const ParametrosDeCobro = z.object({
  diasPlazoDeCobro: z.number().int().min(0).max(365),
  /** `false` = la agencia no ha fijado nada y rige el valor por defecto (30). */
  fijadoPorLaAgencia: z.boolean(),
});
export type ParametrosDeCobro = z.infer<typeof ParametrosDeCobro>;

/**
 * Cuántos viajan en el archivo (T-582). **Solo cifras, ningún nombre**: la vista de cobros la lee
 * quien tenga `cobro.ver` (también OPERACIONES) y acaba en un CSV exportable, mientras que los
 * nombres y edades de los pasajeros exigen `archivo.ver` (ADR-0024 §3.7) y son dato personal
 * (R10). Es la composición vendida del archivo, que `booking` obliga a cuadrar con su lista.
 */
export const PasajerosDeLaFilaDeCobro = z.object({
  adultos: z.number().int().min(0),
  ninos: z.number().int().min(0),
  infantes: z.number().int().min(0),
  /** `adultos + ninos + infantes`. */
  total: z.number().int().min(0),
});
export type PasajerosDeLaFilaDeCobro = z.infer<typeof PasajerosDeLaFilaDeCobro>;

/** Una fila de la vista «quién pagó y quién debe»: un archivo abierto. */
export const FilaDeCobro = z.object({
  archivoId: Id,
  numero: z.number().int().min(1),
  contactoId: Id,
  destino: z.string(),
  fechaSalida: FechaViaje,
  /**
   * Opcional en el esquema para que la web existente compile y las respuestas anteriores sigan
   * siendo válidas; la API la envía siempre. El carril `b` (columna y CSV) puede volverla obligatoria.
   */
  pasajeros: PasajerosDeLaFilaDeCobro.optional(),
  total: Dinero,
  pagado: Dinero,
  saldo: Dinero,
  situacion: SituacionDelSaldo,
  estadoDeCobro: EstadoDeCobro,
  fechaLimite: FechaViaje,
});
export type FilaDeCobro = z.infer<typeof FilaDeCobro>;

/** Totales de la vista, agrupados POR MONEDA: nunca se suman monedas distintas. */
export const TotalDeCobroPorMoneda = z.object({
  moneda: Dinero.shape.moneda,
  archivos: z.number().int().min(0),
  total: Dinero,
  pagado: Dinero,
  /** Solo lo que se debe (suma de saldos positivos): el saldo a favor no compensa deudas ajenas. */
  porCobrar: Dinero,
});
export type TotalDeCobroPorMoneda = z.infer<typeof TotalDeCobroPorMoneda>;

export const VistaDeCobros = z.object({
  datos: z.array(FilaDeCobro),
  totales: z.array(TotalDeCobroPorMoneda),
  /** `true` si hay más archivos abiertos de los que se calcularon (tope de la vista). */
  truncado: z.boolean(),
});
export type VistaDeCobros = z.infer<typeof VistaDeCobros>;

// ---------------------------------------------------------------------------------------------
// Eventos de dominio (ADR-0034 §7): solo identificadores.
// ---------------------------------------------------------------------------------------------

export const TIPO_PAGO_REGISTRADO = 'payments.pago_registrado';
export const TIPO_PAGO_REVERSADO = 'payments.pago_reversado';

export const PagoRegistradoV1 = z.object({
  v: z.literal(1),
  pagoId: Id,
  travelFileId: Id,
  tipo: z.enum(['PAGO', 'DEVOLUCION', 'AJUSTE', 'PENALIDAD']),
});
export type PagoRegistradoV1 = z.infer<typeof PagoRegistradoV1>;

export const PagoReversadoV1 = z.object({
  v: z.literal(1),
  pagoId: Id,
  reversoDeId: Id,
  travelFileId: Id,
});
export type PagoReversadoV1 = z.infer<typeof PagoReversadoV1>;
