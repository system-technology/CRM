/**
 * Lectura auditada de PII sensible (R10; `docs/05-seguridad/02-proteccion-de-datos.md` §5: «todo
 * acceso a datos sensibles registrado: quién, cuándo, a qué»).
 *
 * Cada vez que la API le entrega a una PERSONA un valor descifrado de una de las columnas del
 * ADR-0015, deja una fila en `registros_auditoria` bajo la RLS de la agencia (tabla existente, con
 * `tenant_id` y aislamiento). Si la fila de auditoría no se puede escribir, la lectura falla: no hay
 * lectura sensible sin rastro.
 *
 * - **Por HTTP:** en la MISMA transacción que la lectura. Quién: `usuario_id` del contexto de la
 *   petición (nulo solo en el atajo de desarrollo).
 * - **Por el socket** (`MENSAJE_NUEVO`, `CONVERSACION_ACTUALIZADA`): una fila por emisión, ANTES de
 *   emitir, con `usuario_id` nulo y la audiencia en `detalle.destinatarios` (ids de usuario). El
 *   texto llega a todos los que ven la conversación, hayan abierto el hilo o no.
 * - **Cuándo:** `ocurrido_en` (lo pone la base).
 * - **A qué:** la entidad, su id (o nulo en un listado) y, en `detalle`, los NOMBRES de las
 *   columnas y los ids de las filas. **Nunca el valor** (R10: `detalle` no lleva PII).
 *
 * No se audita lo que no llega a una persona: el envío a Meta del trabajador.
 */
import type { ClienteTenant } from '../prisma/prisma.service.js';
import { ContextoTenant } from '../tenant/contexto-tenant.js';
import type { ColumnaCifrada } from './puerto-de-cifrado.js';

export const ACCION_LECTURA_SENSIBLE = 'LECTURA_DATOS_SENSIBLES';

/** Tope de ids por fila de auditoría: un listado de bandeja trae como mucho 100. */
const MAXIMO_DE_IDS = 200;

export interface LecturaSensible {
  /** `Contacto`, `Conversacion`, `Mensaje`, `NotaInterna`, `Adjunto`. */
  entidad: string;
  /** La entidad principal leída; nulo en un listado. */
  entidadId: string | null;
  /** Las columnas con al menos un valor descifrado devuelto. Si está vacío, no se registra. */
  columnas: readonly ColumnaCifrada[];
  /** Las filas cuyo valor se devolvió (ids, no PII). */
  filas: readonly string[];
  /** Solo en una emisión por socket: los usuarios que la reciben. */
  destinatarios?: readonly string[];
}

export async function registrarLecturaSensible(
  tx: ClienteTenant,
  l: LecturaSensible,
): Promise<void> {
  const columnas = [...new Set(l.columnas)].sort();
  if (columnas.length === 0 || l.filas.length === 0) return;
  const { tenantId, usuarioId } = ContextoTenant.obtener();
  const filas = [...new Set(l.filas)];
  await tx.registroAuditoria.create({
    data: {
      tenantId,
      usuarioId,
      accion: ACCION_LECTURA_SENSIBLE,
      entidad: l.entidad,
      entidadId: l.entidadId,
      detalle: {
        camposSensibles: columnas,
        filas: filas.slice(0, MAXIMO_DE_IDS),
        ...(filas.length > MAXIMO_DE_IDS ? { filasTotales: filas.length } : {}),
        ...(l.destinatarios ? { destinatarios: [...new Set(l.destinatarios)].sort() } : {}),
      },
    },
  });
}

/**
 * Acumula lo descifrado durante una lectura y lo registra al final, una sola fila por respuesta.
 * Uso: `const r = new RegistroDeLectura(); r.anotar(col, id, valor); await r.registrar(tx, ...)`.
 */
export class RegistroDeLectura {
  private readonly columnas = new Set<ColumnaCifrada>();
  private readonly filas = new Set<string>();

  /** Anota solo si el valor descifrado existe: un nulo no es una lectura de PII. */
  anotar<T extends string | null>(columna: ColumnaCifrada, filaId: string, valor: T): T {
    if (valor !== null) {
      this.columnas.add(columna);
      this.filas.add(filaId);
    }
    return valor;
  }

  async registrar(tx: ClienteTenant, entidad: string, entidadId: string | null): Promise<void> {
    await registrarLecturaSensible(tx, {
      entidad,
      entidadId,
      columnas: [...this.columnas],
      filas: [...this.filas],
    });
  }
}
