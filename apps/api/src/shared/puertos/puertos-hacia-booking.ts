/**
 * Lo que `payments` pide a `booking` sin importarlo ni tocar sus tablas (R4, ADR-0004, ADR-0034 §1).
 * Mismo esquema que `puertos-para-avisos.ts` y `puertos-hacia-quoting.ts`: lo define quien lo
 * necesita, vive en `shared/`, y `booking` lo implementa (`BookingPuertosModule`).
 *
 * Recibe la transacción `tx` del llamador (ya con `app.current_tenant` fijado) y el `tenantId` de la
 * SESIÓN, explícito como defensa en profundidad (R1). Nunca abre otra transacción ni toma el tenant
 * de un cuerpo. **Nunca neto ni margen**: siguen tras `cotizacion.ver_neto_y_margen`.
 */
import type { ClienteTenant } from '../prisma/prisma.service.js';

export interface ArchivoParaCobro {
  id: string;
  /** El número de file legible («file 1043»). */
  numero: number;
  contactoId: string;
  destino: string;
  /** `AAAA-MM-DD` (R9: `date`). */
  fechaSalida: string;
  estado: 'ABIERTO' | 'CANCELADO';
  /** R8: unidad mínima de `monedaIso`. El total vendido no cambia nunca (ADR-0034 §2.1). */
  ventaUnidades: bigint;
  monedaIso: string;
  /** Instante de creación del archivo, UTC. El día en la zona de la agencia lo calcula `payments`. */
  creadoEn: Date;
  /**
   * El pago total al mayorista más próximo entre las reservas vivas (ni caídas ni canceladas), o
   * `null` si ninguna lo tiene. Solo para avisar si la fecha límite de cobro lo pasa (ADR-0034 §3).
   */
  pagoTotalVenceEn: Date | null;
  /**
   * Composición vendida del archivo (columnas de `travel_files`, sin tocar `pasajeros`). Solo
   * cifras: los nombres exigen `archivo.ver` y son dato personal (R10, T-582).
   */
  adultos: number;
  ninos: number;
  infantes: number;
}

export interface OpcionesDeLectura {
  /**
   * Bloquea la fila del archivo en modo compartido (`FOR SHARE`) ANTES de leerla. Serializa el
   * registro de un movimiento con «cancelar el archivo» (que toma `FOR UPDATE`): o el movimiento
   * ve el archivo ya cancelado, o la cancelación espera a que el movimiento confirme. Y lo que se
   * lee después del candado es el estado vigente, no una foto anterior.
   */
  bloquear?: boolean;
}

export abstract class PuertoArchivoParaCobro {
  /** `null` si el archivo no existe en ESE tenant. */
  abstract leer(
    tx: ClienteTenant,
    tenantId: string,
    travelFileId: string,
    opciones?: OpcionesDeLectura,
  ): Promise<ArchivoParaCobro | null>;

  /**
   * Archivos ABIERTOS de la agencia, por fecha de salida y número. Hasta `limite` filas: quien llama
   * pide una más que las que muestra para saber si hubo recorte.
   *
   * `deAsesor` es OBLIGATORIO y sin valor por defecto (T-528): olvidarlo no compila, y olvidarlo
   * era devolver toda la agencia. `null` = sin filtro de asesor, que es lo que pide la pantalla de
   * cobros (hoy muestra la agencia entera a cualquier miembro: T-490, fuera de este cambio).
   * Con un id, son los archivos cuya OPORTUNIDAD tiene a esa persona como asesor actual
   * (ADR-0035 §2); los que no tienen oportunidad, o cuya oportunidad no tiene asesor, no son de
   * nadie y quedan fuera. Quien llama desde reportes lo deriva del `AlcanceDeReporte`, que sale de
   * la sesión: este puerto nunca lo recibe del cliente.
   */
  abstract listarAbiertos(
    tx: ClienteTenant,
    tenantId: string,
    filtros: { limite: number; deAsesor: string | null },
  ): Promise<ArchivoParaCobro[]>;
}
