/**
 * Los puertos de salida de `payments`. Clases abstractas y no interfaces: Nest necesita un símbolo
 * en ejecución para inyectarlas.
 *
 * Todo corre bajo el tenant de la petición (`ContextoTenant` → `app.current_tenant` → RLS): ningún
 * método recibe un `tenantId` que alguien pueda pasar mal. Una fila de otra agencia no se ve, y el
 * puerto responde `null` igual que si no existiera.
 */
import type { SumasDeCobro } from '@viajapro/domain';
import type { ArchivoParaCobro } from '../../../shared/puertos/puertos-hacia-booking.js';
import type { EventoParaOutbox } from '../domain/eventos.js';
import type { Movimiento, MovimientoNuevo } from '../domain/movimiento.js';

/** Lo que se puede hacer dentro de UNA transacción, con el archivo ya bloqueado. */
export interface OperacionesDeCobro {
  /**
   * ADR-0034 §4 paso 1: `pg_advisory_xact_lock` por `(tenant, archivo)`, en su propia sentencia y
   * con el MISMO espacio que `pagos_validar_alta`, para que la base y la API se serialicen.
   */
  bloquearCobroDelArchivo(archivoId: string): Promise<void>;
  /** El archivo, leído DESPUÉS del candado y con su fila bloqueada contra la cancelación. */
  leerArchivoBloqueado(archivoId: string): Promise<ArchivoParaCobro | null>;
  /** Zona IANA de la agencia (R9: solo para decidir qué es «hoy»). */
  zonaHoraria(): Promise<string>;
  /** Por `(tenant, clave)`. */
  buscarPorClave(clave: string): Promise<Movimiento | null>;
  /** Por `id AND travel_file_id` además del tenant: no se opera desde la URL de otro archivo. */
  buscarMovimiento(archivoId: string, pagoId: string): Promise<Movimiento | null>;
  yaReversado(pagoId: string): Promise<boolean>;
  /** Sumas de los movimientos VIGENTES del archivo, como `bigint`. */
  sumasVigentes(archivoId: string): Promise<SumasDeCobro>;
  /** `ON CONFLICT (tenant_id, clave_idempotencia) DO NOTHING`: `null` si la clave ya estaba. */
  insertar(nuevo: MovimientoNuevo): Promise<Movimiento | null>;
  /** Al outbox, en esta misma transacción. */
  escribirEvento(evento: EventoParaOutbox): Promise<void>;
  /** Última fila de `plazos_de_cobro` del archivo, por `(registrado_en, id)`. */
  ultimoPlazo(archivoId: string): Promise<PlazoDeCobro | null>;
  insertarPlazo(plazo: PlazoNuevo): Promise<PlazoDeCobro>;
}

export interface PlazoDeCobro {
  id: string;
  travelFileId: string;
  /** `AAAA-MM-DD`. */
  venceEl: string;
  motivo: string | null;
  registradoPor: string;
  registradoEn: Date;
}

export type PlazoNuevo = Omit<PlazoDeCobro, 'registradoEn'>;

/** Todo lo que el cálculo del cobro necesita de UN archivo, leído en una sola transacción. */
export interface LecturaDeCobro {
  archivo: ArchivoParaCobro;
  /** Orden `(registrado_en, id)`. */
  movimientos: Movimiento[];
  zonaHoraria: string;
  /** `null` = la agencia no fijó nada: rige el valor por defecto. */
  diasDePlazo: number | null;
  /** `vence_el` de la última fila de `plazos_de_cobro`. */
  plazoManual: string | null;
}

/** Lo que la vista necesita de la agencia, y las sumas ya agrupadas en la base. */
export interface LecturaDeVista {
  archivos: ArchivoParaCobro[];
  /** Por archivo; sin entrada = sin movimientos vigentes. */
  sumas: Map<string, SumasDeCobro>;
  plazosManuales: Map<string, string>;
  zonaHoraria: string;
  diasDePlazo: number | null;
  /** Había más archivos abiertos que el tope. */
  truncado: boolean;
}

export abstract class RepositorioDeCobros {
  abstract enTransaccion<T>(fn: (ops: OperacionesDeCobro) => Promise<T>): Promise<T>;
  /** `null` si el archivo no existe en esta agencia. */
  abstract leerCobro(archivoId: string): Promise<LecturaDeCobro | null>;
  abstract leerVista(tope: number): Promise<LecturaDeVista>;
  /** Upsert de los días por defecto de la agencia. */
  abstract fijarDiasDePlazo(dias: number, usuarioId: string): Promise<void>;
}
