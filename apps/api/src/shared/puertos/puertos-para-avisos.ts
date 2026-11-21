/**
 * Los puertos que `notifications` necesita para decidir A QUIÉN avisa de un plazo de reserva y con
 * qué número de file (T-254, ADR-0024 §3.6), sin importar los contextos que saben esas cosas (R4):
 *
 *   · `booking` sabe el número del file y de qué oportunidad viene;
 *   · `crm` sabe quién es el asesor de la oportunidad;
 *   · `identity` sabe quién está activo y qué permisos tiene.
 *
 * Los define quien los necesita y viven en `shared/`, como `puertos-hacia-quoting.ts`. Reciben la
 * TRANSACCIÓN del despachador (ya con `app.current_tenant` fijado a `outbox.tenant_id`) y el
 * `tenantId` de esa fila como defensa en profundidad (R1). Nunca abren otra transacción ni toman el
 * tenant de un payload.
 */
import type { Permiso } from '@viajapro/contracts';
import type { ClienteTenant } from '../prisma/prisma.service.js';

/** Lo único que `notifications` necesita saber del archivo de una reserva. */
export interface ArchivoDeUnAviso {
  /** El número legible del file («file 1043»). */
  numero: number;
  /** La oportunidad de la que viene el archivo; `null` si no vino de una. */
  oportunidadId: string | null;
}

/** Lo que `notifications` pide a `booking`. */
export abstract class PuertoArchivoDeUnAviso {
  /**
   * `null` si el archivo no existe en ESE tenant o la reserva no pertenece a ESE archivo.
   */
  abstract leer(
    tx: ClienteTenant,
    tenantId: string,
    archivoId: string,
    reservaId: string,
  ): Promise<ArchivoDeUnAviso | null>;
}

/**
 * Lo que `notifications` pide a `crm` —y también `booking` (T-529): las dos preguntas son la misma,
 * «quién responde por esto», y por eso no se duplica el puerto. Una es de a uno, dentro de la
 * transacción del despachador; la otra es de a muchos, para una pantalla.
 */
export abstract class PuertoAsesorDeOportunidad {
  /** El asesor asignado a la oportunidad; `null` si no existe en ese tenant o no tiene asesor. */
  abstract asesorDe(
    tx: ClienteTenant,
    tenantId: string,
    oportunidadId: string,
  ): Promise<string | null>;

  /**
   * El asesor de varias oportunidades, en una sola consulta (T-529: la pantalla «Sin responsable»
   * mira hasta 500 archivos y una por una serían 500 viajes a la base). **Omite** las que no
   * existen en ese tenant: ausencia y `asesorId: null` se tratan igual, «sin asesor».
   */
  abstract asesoresDe(
    tx: ClienteTenant,
    tenantId: string,
    oportunidadIds: readonly string[],
  ): Promise<Array<{ oportunidadId: string; asesorId: string | null }>>;
}

/** Lo que `notifications` pide a `identity`. */
export abstract class PuertoUsuariosConPermiso {
  /**
   * Los usuarios ACTIVOS (no dados de baja) de ese tenant cuyo rol tiene `permiso`. Si `entre` viene,
   * solo se consideran esos usuarios. El orden es estable (por id).
   */
  abstract activosConPermiso(
    tx: ClienteTenant,
    tenantId: string,
    permiso: Permiso,
    entre?: readonly string[],
  ): Promise<string[]>;
}
