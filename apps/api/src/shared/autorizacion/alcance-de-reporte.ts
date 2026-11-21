/**
 * De quién son las filas que un REPORTE agrega, dentro de una agencia (ADR-0035 §1, decisión D3
 * del propietario: «el asesor ve lo suyo, el administrador todo»).
 *
 * Una sola función decide el alcance, y **todos** los puertos de `puertos-de-reportes.ts` reciben
 * su resultado en vez de un `asesorId` suelto: así un puerto nuevo no puede olvidarse del alcance
 * —no compila sin él— y ningún adaptador lee el parámetro del cliente por su cuenta (§9.1).
 *
 *   · Con `reportes.ver_agencia`: alcance AGENCIA. `asesorId` es un FILTRO opcional de quien ya
 *     puede verlo todo: el asesor pedido, el propio con `yo`, o `null` (toda la agencia).
 *   · Sin él: alcance PROPIO, y el asesor es SIEMPRE el usuario de la sesión. El parámetro del
 *     cliente no lo amplía nunca; pedirse a uno mismo (por id o con `yo`) está permitido.
 *   · Sin él y con otro asesor: **403 PERMISO_DENEGADO**, no un recorte en silencio. Una pantalla
 *     titulada «Beto» con los datos de Valentina miente, y un cliente de la API que ve el
 *     parámetro ignorado aprende que pedirlo es inocuo (ADR-0035 §4).
 *
 * El 403 **no es un oráculo de existencia**: es idéntico con un asesor de la agencia, con uno
 * inexistente y con uno de otra agencia, porque se decide sin mirar la base.
 *
 * Esto NO es aislamiento entre agencias —eso es RLS y el tenant de la sesión, y no cambia (R1)—:
 * es política de negocio dentro de una, y el permiso es tabla por tenant (R12).
 */
import type { ContextoPeticion } from '../tenant/contexto-tenant.js';
import { permisoDenegado } from './permiso.guard.js';

export const PERMISO_VER_AGENCIA = 'reportes.ver_agencia' as const;

/** El atajo con el que la web pide «lo mío» sin conocer su propio id. */
export const YO = 'yo' as const;

export type AlcanceDeReporte =
  /** Todas las filas del tenant; `asesorId` es el filtro pedido, o `null` si no hay. */
  | { readonly nivel: 'AGENCIA'; readonly asesorId: string | null }
  /** Solo las del usuario de la sesión. `asesorId` nunca sale de un parámetro del cliente. */
  | { readonly nivel: 'PROPIO'; readonly asesorId: string };

/** Alcance de agencia, con o sin filtro de asesor. */
export type AlcanceDeAgenciaConFiltro = Extract<AlcanceDeReporte, { readonly nivel: 'AGENCIA' }>;

/**
 * Toda la agencia, sin filtro de asesor. Es el único alcance con el que se piden los agregados
 * POR ASESOR (T-531): un puerto que reparte por asesor y recibe este tipo no compila con un
 * alcance propio ni con un asesor ya filtrado.
 */
export type AlcanceDeAgenciaEntera = { readonly nivel: 'AGENCIA'; readonly asesorId: null };

export function esAgenciaEntera(alcance: AlcanceDeReporte): alcance is AlcanceDeAgenciaEntera {
  return alcance.nivel === 'AGENCIA' && alcance.asesorId === null;
}

export function esAgencia(alcance: AlcanceDeReporte): alcance is AlcanceDeAgenciaConFiltro {
  return alcance.nivel === 'AGENCIA';
}

export function alcanceDeReporte(
  contexto: Pick<ContextoPeticion, 'usuarioId' | 'permisos'>,
  asesorSolicitado: string | undefined,
): AlcanceDeReporte {
  const propio = contexto.usuarioId;

  if (contexto.permisos.has(PERMISO_VER_AGENCIA)) {
    if (asesorSolicitado === undefined) return { nivel: 'AGENCIA', asesorId: null };
    if (asesorSolicitado === YO) {
      // Sin usuario no hay «yo»: filtrar por nadie sería devolver toda la agencia. Ante la duda, 403.
      if (propio === null) throw permisoDenegado(PERMISO_VER_AGENCIA);
      return { nivel: 'AGENCIA', asesorId: propio };
    }
    return { nivel: 'AGENCIA', asesorId: asesorSolicitado };
  }

  // Sin usuario no hay «lo suyo»: devolverlo todo sería la fuga que esta función existe para evitar.
  if (propio === null) throw permisoDenegado(PERMISO_VER_AGENCIA);
  if (asesorSolicitado !== undefined && asesorSolicitado !== YO && asesorSolicitado !== propio) {
    throw permisoDenegado(PERMISO_VER_AGENCIA);
  }
  return { nivel: 'PROPIO', asesorId: propio };
}
