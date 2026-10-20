/**
 * Puertos de `identity`. Los implementa `infrastructure/`; los casos de uso solo los conocen a
 * ellos. Sin dependencias de framework ni de Prisma.
 *
 * Son clases abstractas porque Nest necesita un símbolo en ejecución para inyectar.
 */
import type { AgenciaDeAcceso, IdentidadDeSesion, Permiso } from '@viajapro/contracts';

/** Una sesión que la biblioteca de autenticación ya validó (firma, expiración, existencia). */
export interface SesionVerificada {
  sesionId: string;
  identidad: IdentidadDeSesion;
  /** Lo que dice la sesión. NO autoriza nada: se revalida bajo RLS (paso 4). */
  tenantActivoId: string | null;
  /** `Set-Cookie` que la biblioteca quiere emitir (renovación). Hay que reenviarlos. */
  cookies: readonly string[];
}

export abstract class PuertoSesiones {
  /** Resuelve la cookie a una sesión viva, o `null` si falta, caducó o fue revocada. */
  abstract obtener(cookie: string | null): Promise<SesionVerificada | null>;
  /** Borra la sesión: la petición siguiente con esa cookie ya no entra. */
  abstract revocar(sesionId: string): Promise<void>;
  /** Escribe `tenant_activo_id`. El llamador YA comprobó la membresía. */
  abstract fijarTenantActivo(sesionId: string, tenantId: string): Promise<void>;
}

/** Lo que dice la lectura de `usuarios` bajo RLS (paso 4 de ADR-0011). */
export type MembresiaVerificada =
  | {
      tipo: 'vigente';
      usuarioId: string;
      rol: string;
      permisos: ReadonlySet<Permiso>;
    }
  /** Cero filas: no pertenece a esa agencia, la dieron de baja, o la agencia no existe. */
  | { tipo: 'sin_membresia' }
  | { tipo: 'agencia_suspendida' };

export abstract class PuertoMembresias {
  /**
   * Corre con el rol de la API y `app.current_tenant = tenantId`: **RLS garantiza que la fila,
   * si existe, es de esa agencia**. Es la única comprobación que cuenta.
   */
  abstract verificar(tenantId: string, identidadId: string): Promise<MembresiaVerificada>;
}

export abstract class PuertoAgencias {
  /**
   * Las agencias en las que está una identidad según el índice `accesos_identidad`, con su
   * nombre. Informativo, para el selector: puede ir un paso por detrás de la verdad, y por eso
   * nunca decide un acceso.
   */
  abstract listarDe(identidadId: string): Promise<AgenciaDeAcceso[]>;
}
