/**
 * Quién responde por un archivo de viaje, y qué pasa cuando no responde nadie (T-529, ADR-0035
 * §2, H7). Dominio puro: sin framework, sin base de datos.
 *
 * **La regla no es nueva ni es de esta pantalla.** Es la misma con la que `notifications` decide a
 * quién avisar de un plazo (`destinatariosDelAviso`, T-254): responde por el archivo el asesor de
 * su oportunidad, siempre que siga activo y pueda operar archivos. Si no hay tal asesor, el
 * archivo no es de nadie: el aviso va a todos los que pueden operar, y aquí aparece en la lista.
 *
 * **Por qué existe la lista.** Un archivo sin responsable no falla: desaparece en silencio. No
 * entra en el reporte propio de ningún asesor (ADR-0035 §2 atribuye por
 * `travel_files.oportunidad_id` → `oportunidades.asesor_id`), así que su dueño natural lee «0 por
 * cobrar» y «0 abiertas» sin que nada se queje. Es la misma trampa que `creado_por` en T-342. Un
 * silencio así es peor que un error, y por eso se pinta aparte en «Hoy».
 */
import type { MotivoSinResponsable } from '@viajapro/contracts';

/** El permiso que hace a alguien responsable posible: poder actuar sobre el archivo. */
export const PERMISO_DE_RESPONSABLE = 'archivo.operar' as const;

/** Lo mínimo que hace falta saber de un archivo para decidir si tiene responsable. */
export interface ArchivoConAsesor {
  /** De qué oportunidad vino el archivo; `null` si no vino de ninguna. */
  oportunidadId: string | null;
  /** El asesor de esa oportunidad; `null` si no la hay, no existe o no tiene asesor. */
  asesorId: string | null;
}

/**
 * El motivo por el que el archivo no tiene responsable, o `null` si sí lo tiene.
 *
 * `elegibles` son los usuarios ACTIVOS con `archivo.operar` de la agencia: que el asesor no esté
 * ahí significa que está dado de baja o que su rol perdió el permiso. No se distinguen los dos
 * casos a propósito —para quien mira la pantalla significan lo mismo— y distinguirlos obligaría a
 * exponer el estado de la cuenta de un compañero en una lista de archivos.
 */
export function motivoSinResponsable(
  archivo: ArchivoConAsesor,
  elegibles: ReadonlySet<string>,
): MotivoSinResponsable | null {
  if (archivo.oportunidadId === null) return 'SIN_OPORTUNIDAD';
  if (archivo.asesorId === null) return 'SIN_ASESOR';
  return elegibles.has(archivo.asesorId) ? null : 'ASESOR_NO_ELEGIBLE';
}
