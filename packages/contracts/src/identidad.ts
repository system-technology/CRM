/**
 * Identidad y permisos — ADR-0011.
 *
 * **El catálogo de permisos es código, no tabla.** Lo que el sistema sabe hacer es un
 * invariante del dominio; cómo lo agrupa cada agencia en roles es política (tabla `roles`,
 * R12). Este enum es la fuente de verdad, y la base lo refleja en el `CHECK
 * roles_permisos_del_catalogo` (migración `20261019230000`). Añadir un permiso es editar
 * los dos: un permiso que la base no admite no se puede asignar, y uno que el código no
 * conoce no autoriza nada.
 */

import { z } from 'zod';

export const PERMISOS = [
  /** Ver la tarifa neta del mayorista y el margen de una cotización. */
  'cotizacion.ver_neto_y_margen',
  /** Invitar, desactivar y cambiar de rol a los usuarios de la agencia. */
  'usuarios.administrar',
  /** Crear, renombrar y editar los permisos de los roles de la agencia. */
  'roles.administrar',
  /** Ver las conversaciones de toda la agencia, no solo las asignadas. */
  'conversaciones.ver_todas',
] as const;

export const Permiso = z.enum(PERMISOS);
export type Permiso = z.infer<typeof Permiso>;

/** Los tres roles que recibe toda agencia al darse de alta. La agencia puede renombrarlos. */
export const ClaveRolSembrado = z.enum(['DUENO', 'ASESOR', 'OPERACIONES']);
export type ClaveRolSembrado = z.infer<typeof ClaveRolSembrado>;
