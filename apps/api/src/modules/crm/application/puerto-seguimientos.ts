/**
 * Puerto de seguimientos (T-077).
 *
 * El diseño completo necesita una tabla `seguimientos` (varios por oportunidad, y también sobre
 * conversaciones) que todavía no existe: la crea `datos` con aprobación del propietario. Mientras
 * tanto hay dos adaptadores detrás de este mismo puerto:
 *
 *   · `SeguimientosSobreOportunidad` (Prisma): usa las columnas `proxima_tarea_*` que YA existen.
 *     Un seguimiento pendiente por oportunidad; sobre conversación lanza
 *     `SeguimientoNoSoportadoTodaviaError`.
 *   · `SeguimientosEnMemoria` (doble de pruebas): el comportamiento completo.
 *
 * Cuando exista la tabla se escribe un tercer adaptador y se cambia el `useClass`; ni el caso de
 * uso ni el contrato HTTP cambian.
 */
import type { EstadoSeguimiento, Seguimiento } from '@viajapro/contracts';

export type DestinoDeSeguimiento =
  | { tipo: 'OPORTUNIDAD'; oportunidadId: string }
  | { tipo: 'CONVERSACION'; conversacionId: string; contactoId: string };

export interface NuevoSeguimiento {
  destino: DestinoDeSeguimiento;
  descripcion: string;
  venceEn: Date;
  /** Ya resuelto por el caso de uso: el dueño de la oportunidad/conversación, o quien lo crea. */
  asesorId: string | null;
  creadoPorId: string | null;
}

export interface ConsultaDeSeguimientos {
  /** `null` = de cualquier asesor. */
  asesorId: string | null;
  oportunidadId: string | null;
  conversacionId: string | null;
  estado: EstadoSeguimiento;
  /** Solo pendientes que vencen en `[desde, hasta)`; cualquiera de los dos puede faltar. */
  venceDesde: Date | null;
  venceAntes: Date | null;
  limite: number;
}

export abstract class PuertoSeguimientos {
  abstract crear(nuevo: NuevoSeguimiento): Promise<Seguimiento>;
  /** Orden: por fecha de vencimiento ascendente. */
  abstract listar(consulta: ConsultaDeSeguimientos): Promise<Seguimiento[]>;
  abstract buscar(seguimientoId: string): Promise<Seguimiento | null>;
  /** Marca como completado. `null` si no existe. */
  abstract completar(seguimientoId: string, cuando: Date): Promise<Seguimiento | null>;
  /** IANA, p. ej. `America/Bogota`. Es la de la agencia, para calcular «hoy» (R9). */
  abstract zonaHoraria(): Promise<string>;
}
