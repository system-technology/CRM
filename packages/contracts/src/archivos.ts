/**
 * El archivo de viaje (`TravelFile`, «Reservas» en la interfaz) y sus reservas (`Booking`) — ADR-0024 §3.
 *
 *   GET  /api/v1/archivos                              lista con avance y semáforo
 *   GET  /api/v1/archivos/:id                          detalle con reservas y pasajeros
 *   PUT  /api/v1/archivos/:id/reservas/:reservaId      fija el estado y los datos del paso
 *   PUT  /api/v1/archivos/:id/pasajeros                reemplaza la lista completa
 *   POST /api/v1/archivos/:id/cancelacion              cancela el archivo con motivo
 *
 * **Neto y margen (T-248).** `ReservaDelArchivo.netoUnidades` se OMITE —la clave entera, no un
 * `null`— cuando quien lee no tiene `cotizacion.ver_neto_y_margen`. Un `null` diría «desconocido»,
 * que es otra cosa y filtraría que el permiso falta. El archivo no lleva margen.
 *
 * **Pasajeros.** Nombre y edad son datos personales (Ley 1581): viajan solo por estas rutas, nunca
 * al outbox, a la auditoría ni a los logs. Documento y fecha de nacimiento no existen todavía.
 */
import { z } from 'zod';
import { Dinero, FechaViaje, Id, Instante, TipoPasajero } from './comunes.js';

export const EstadoDeReserva = z.enum([
  'PENDIENTE',
  'SOLICITADA',
  'EN_ESPERA',
  'CONFIRMADA',
  'ABONADA_AL_PROVEEDOR',
  'PAGADA_AL_PROVEEDOR',
  'CAIDA',
  'CANCELADA',
]);
export type EstadoDeReserva = z.infer<typeof EstadoDeReserva>;

export const MotivoDeCaida = z.enum([
  'TIME_LIMIT_VENCIDO',
  'PAGO_TOTAL_VENCIDO',
  'SIN_CUPO',
  'NEGADA_EN_ESPERA',
  'OTRO',
]);
export type MotivoDeCaida = z.infer<typeof MotivoDeCaida>;

export const MotivoDeCancelacionDelArchivo = z.enum([
  'CLIENTE_DESISTIO',
  'SIN_DISPONIBILIDAD',
  'CAMBIO_DE_FECHA',
  'OTRO',
]);
export type MotivoDeCancelacionDelArchivo = z.infer<typeof MotivoDeCancelacionDelArchivo>;

/** El único eje del archivo que alguien fija con un botón. */
export const EstadoDelArchivo = z.enum(['ABIERTO', 'CANCELADO']);
export type EstadoDelArchivo = z.infer<typeof EstadoDelArchivo>;

/** Lo deriva el dominio de las reservas vivas; no se guarda. `null` en un archivo cancelado. */
export const AvanceDelArchivo = z.enum([
  'POR_CONFIRMAR',
  'CONFIRMADO',
  'PAGADO_A_PROVEEDORES',
  'SIN_RESERVAS_VIVAS',
]);
export type AvanceDelArchivo = z.infer<typeof AvanceDelArchivo>;

export const SemaforoDePlazo = z.enum(['VENCIDO', 'MENOS_DE_24_H', 'EN_PLAZO']);
export type SemaforoDePlazo = z.infer<typeof SemaforoDePlazo>;

/** El importe entero en la unidad mínima de la moneda, como texto (R8). */
const UnidadesEnTexto = z.string().regex(/^\d+$/, 'debe ser un entero no negativo en texto');

export const ReservaDelArchivo = z.object({
  id: Id,
  /** `null` = «por definir» (una línea sin mayorista) o el mayorista salió del catálogo. */
  mayoristaId: Id.nullable(),
  /** Copia: sobrevive a que el mayorista se borre. */
  mayoristaNombre: z.string().nullable(),
  /** Moneda del neto. */
  moneda: Dinero.shape.moneda,
  /**
   * Neto del mayorista en unidades mínimas de `moneda`. **Ausente** sin
   * `cotizacion.ver_neto_y_margen`; `null` = neto desconocido (alguna línea sin neto cargado).
   */
  netoUnidades: UnidadesEnTexto.nullable().optional(),
  localizador: z.string().nullable(),
  estado: EstadoDeReserva,
  solicitadaEn: Instante.nullable(),
  confirmadaEn: Instante.nullable(),
  abonadaEn: Instante.nullable(),
  pagadaEn: Instante.nullable(),
  /** Hasta cuándo el mayorista sostiene la reserva sin abono (UTC). Obligatorio desde CONFIRMADA. */
  timeLimit: Instante.nullable(),
  /** Hasta cuándo hay que pagarle el total (UTC). Obligatorio desde ABONADA_AL_PROVEEDOR. */
  pagoTotalVenceEn: Instante.nullable(),
  motivoCaida: MotivoDeCaida.nullable(),
  nota: z.string().nullable(),
  /** El plazo vigente de su estado: `timeLimit` si CONFIRMADA, `pagoTotalVenceEn` si ABONADA. */
  plazoVigente: Instante.nullable(),
  semaforo: SemaforoDePlazo.nullable(),
});
export type ReservaDelArchivo = z.infer<typeof ReservaDelArchivo>;

export const TrmDelArchivo = z.object({
  monedaOrigen: z.string().length(3),
  monedaDestino: z.string().length(3),
  /** Decimal exacto, en texto: nunca `float`. */
  valor: z.string(),
  fecha: FechaViaje,
  fuente: z.enum(['OFICIAL', 'AGENCIA']),
});
export type TrmDelArchivo = z.infer<typeof TrmDelArchivo>;

export const ResumenDeArchivo = z.object({
  id: Id,
  /** El número de file legible («file 1043»), consecutivo por agencia. */
  numero: z.number().int().min(1),
  contactoId: Id,
  oportunidadId: Id.nullable(),
  cotizacionId: Id,
  versionCotizacion: z.number().int().min(1),
  paqueteNombre: z.string(),
  destino: z.string(),
  fechaSalida: FechaViaje,
  noches: z.number().int().min(0),
  adultos: z.number().int().min(0),
  ninos: z.number().int().min(0),
  infantes: z.number().int().min(0),
  venta: Dinero,
  trm: TrmDelArchivo.nullable(),
  estado: EstadoDelArchivo,
  avance: AvanceDelArchivo.nullable(),
  motivoCancelacion: MotivoDeCancelacionDelArchivo.nullable(),
  notaCancelacion: z.string().nullable(),
  canceladoEn: Instante.nullable(),
  /** El plazo vigente más próximo entre sus reservas; `null` si ninguna tiene plazo vigente. */
  proximoPlazo: Instante.nullable(),
  /** El peor semáforo entre sus reservas vivas. */
  semaforo: SemaforoDePlazo.nullable(),
  reservas: z.array(ReservaDelArchivo),
  creadoEn: Instante,
});
export type ResumenDeArchivo = z.infer<typeof ResumenDeArchivo>;

export const PasajeroDelArchivo = z.object({
  id: Id,
  nombre: z.string(),
  tipo: TipoPasajero,
  edadAlViaje: z.number().int().min(0).max(120).nullable(),
  esTitular: z.boolean(),
  orden: z.number().int().min(0),
});
export type PasajeroDelArchivo = z.infer<typeof PasajeroDelArchivo>;

/** Avisos que no impiden guardar. */
export const AvisoDelArchivo = z.enum(['PASAJEROS_NO_CUADRAN_CON_LA_VENTA']);
export type AvisoDelArchivo = z.infer<typeof AvisoDelArchivo>;

export const DetalleDeArchivo = ResumenDeArchivo.extend({
  pasajeros: z.array(PasajeroDelArchivo),
  avisos: z.array(AvisoDelArchivo),
});
export type DetalleDeArchivo = z.infer<typeof DetalleDeArchivo>;

/** `GET /api/v1/archivos` — por defecto los abiertos, ordenados por el plazo más próximo. */
export const ListarArchivos = z
  .object({
    estado: z.enum(['ABIERTO', 'CANCELADO', 'TODOS']).default('ABIERTO'),
    /** Sin cursor: la lista de una agencia pequeña cabe en una página (ADR-0024 §3.7). */
    limite: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();
export type ListarArchivos = z.infer<typeof ListarArchivos>;

export const ListaDeArchivos = z.object({ datos: z.array(ResumenDeArchivo) });
export type ListaDeArchivos = z.infer<typeof ListaDeArchivos>;

/**
 * `PUT /api/v1/archivos/:id/reservas/:reservaId` — fija el estado y los datos del paso.
 *
 * Idempotente: repetir el mismo cuerpo no cambia nada (las fechas de cada paso se escriben al
 * entrar al estado, no al repetirlo). En los campos opcionales, **ausente** = conservar y
 * **`null`** = borrar. El plazo del `time_limit` lo dice el mayorista: el asesor lo escribe, el
 * sistema nunca lo inventa.
 */
export const ActualizarReserva = z
  .object({
    estado: EstadoDeReserva,
    localizador: z.string().trim().min(1).max(64).nullable().optional(),
    timeLimit: Instante.nullable().optional(),
    pagoTotalVenceEn: Instante.nullable().optional(),
    motivoCaida: MotivoDeCaida.nullable().optional(),
    nota: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict();
export type ActualizarReserva = z.infer<typeof ActualizarReserva>;

export const PasajeroNuevo = z
  .object({
    nombre: z.string().trim().min(1).max(200),
    tipo: TipoPasajero,
    /** Obligatoria para CHD e INF. */
    edadAlViaje: z.number().int().min(0).max(120).nullable().default(null),
    esTitular: z.boolean().default(false),
  })
  .strict();
export type PasajeroNuevo = z.infer<typeof PasajeroNuevo>;

/** `PUT /api/v1/archivos/:id/pasajeros` — la lista COMPLETA; el orden del arreglo es el orden. */
export const ReemplazarPasajeros = z.object({ pasajeros: z.array(PasajeroNuevo).max(60) }).strict();
export type ReemplazarPasajeros = z.infer<typeof ReemplazarPasajeros>;

/** `POST /api/v1/archivos/:id/cancelacion` — la nota es obligatoria si el motivo es `OTRO`. */
export const CancelarArchivo = z
  .object({
    motivo: MotivoDeCancelacionDelArchivo,
    nota: z.string().trim().min(1).max(500).nullable().default(null),
  })
  .strict()
  .refine((v) => v.motivo !== 'OTRO' || v.nota !== null, {
    message: 'con el motivo OTRO la nota es obligatoria',
    path: ['nota'],
  });
export type CancelarArchivo = z.infer<typeof CancelarArchivo>;
