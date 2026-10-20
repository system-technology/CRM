/**
 * Quién ve qué conversación DENTRO de una agencia. Este archivo es **el único sitio** donde vive la
 * regla (`docs/01-producto/12-visibilidad-de-conversaciones.md`).
 *
 *   · Con `conversaciones.ver_todas`: todas las de la agencia.
 *   · Sin él: las asignadas a uno + las sin asignar (la cola común).
 *
 * No es aislamiento entre agencias —eso es RLS y el tenant de la sesión, y no cambia—: es política
 * de negocio (R12), y el permiso es tabla por tenant.
 *
 * Tres formas de la misma regla, que deben coincidir y por eso están juntas:
 *   · `puedeVer`: la pregunta sobre una conversación concreta (el socket, los eventos);
 *   · `filtroDeVisibilidad`: la misma regla como predicado de consulta, para que el repositorio la
 *     aplique a TODO lo que cuelga de una conversación sin repetirla en cada ruta;
 *   · `quienesVen`: la audiencia de una conversación, para decidir a quién se le emite.
 *
 * Vive en `shared/` y no en `inbox` porque `crm` también la necesita (las notas de la ficha del
 * contacto que se escribieron en un hilo) y los módulos no se importan entre sí (R4).
 */
import type { Prisma } from '@prisma/client';
import type { ContextoPeticion } from '../tenant/contexto-tenant.js';

export const PERMISO_VER_TODAS = 'conversaciones.ver_todas' as const;

export type Visibilidad =
  | { readonly alcance: 'TODAS' }
  | { readonly alcance: 'ASIGNADAS_Y_COLA'; readonly usuarioId: string | null };

/**
 * Para lecturas del SISTEMA que arman un evento para varios destinatarios y filtran después con
 * `quienesVen`. Nunca se usa con lo que se le devuelve a una persona.
 */
export const VISIBILIDAD_DE_SISTEMA: Visibilidad = { alcance: 'TODAS' };

/** La visibilidad de quien hace la petición, según los permisos que su rol tiene en ESTA agencia. */
export function visibilidadDe(
  contexto: Pick<ContextoPeticion, 'usuarioId' | 'permisos'>,
): Visibilidad {
  return visibilidadDeMiembro({
    usuarioId: contexto.usuarioId,
    verTodas: contexto.permisos.has(PERMISO_VER_TODAS),
  });
}

export function visibilidadDeMiembro(m: {
  usuarioId: string | null;
  verTodas: boolean;
}): Visibilidad {
  return m.verTodas
    ? { alcance: 'TODAS' }
    : { alcance: 'ASIGNADAS_Y_COLA', usuarioId: m.usuarioId };
}

/** ¿Ve una conversación asignada a `asignadoAId` (nulo = sin asignar)? */
export function puedeVer(v: Visibilidad, asignadoAId: string | null): boolean {
  if (v.alcance === 'TODAS') return true;
  return asignadoAId === null || asignadoAId === v.usuarioId;
}

/**
 * La regla como predicado de Prisma. Se combina con `AND` en toda consulta de conversaciones, o de
 * algo que cuelgue de ellas (`mensaje: { conversacion: filtroDeVisibilidad(v) }`).
 */
export function filtroDeVisibilidad(v: Visibilidad): Prisma.ConversacionWhereInput {
  if (v.alcance === 'TODAS') return {};
  return {
    OR: [{ asignadoAId: null }, ...(v.usuarioId ? [{ asignadoAId: v.usuarioId }] : [])],
  };
}

export interface MiembroParaAudiencia {
  readonly usuarioId: string;
  readonly verTodas: boolean;
}

/** Los miembros activos que ven una conversación asignada a `asignadoAId`. */
export function quienesVen(
  miembros: readonly MiembroParaAudiencia[],
  asignadoAId: string | null,
): ReadonlySet<string> {
  return new Set(
    miembros.filter((m) => puedeVer(visibilidadDeMiembro(m), asignadoAId)).map((m) => m.usuarioId),
  );
}
