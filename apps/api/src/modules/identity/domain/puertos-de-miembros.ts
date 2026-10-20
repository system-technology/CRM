/**
 * Puertos de las invitaciones y de la alta de miembros. Sin framework ni Prisma.
 */
import type { DatosDeInvitacion } from './invitacion.js';

export abstract class PuertoInvitaciones {
  /** Guarda la invitación bajo el HASH de su token. Nunca recibe el token. */
  abstract guardar(hashDelToken: string, datos: DatosDeInvitacion, expiraEn: Date): Promise<void>;
  /**
   * Consume la invitación: la devuelve y la borra en un solo paso, de modo que de dos llamadas
   * simultáneas con el mismo token solo una la recibe. `null` si no existe, ya se usó o caducó.
   */
  abstract consumir(hashDelToken: string): Promise<DatosDeInvitacion | null>;
}

export interface DescripcionDeInvitacion {
  agencia: string;
  rol: string;
  /** Los permisos que da ese rol, leídos bajo RLS. */
  permisos: readonly string[];
}

export type ResultadoDeAlta = 'creado' | 'reactivado' | 'ya_era_miembro';

export abstract class PuertoMiembros {
  /**
   * Con el tenant de la PETICIÓN y bajo RLS: el rol existe en esta agencia. `null` si no.
   * Devuelve de paso los nombres que lleva el correo.
   */
  abstract describirInvitacion(rolId: string): Promise<DescripcionDeInvitacion | null>;
  /**
   * Crea la pertenencia de la identidad a la agencia, bajo RLS con ESE tenant, o la reactiva si
   * estaba de baja. **Nunca cambia el rol de un miembro vigente**: devuelve `ya_era_miembro`.
   * `rol_inexistente` si el rol ya no existe en la agencia (se borró desde la invitación).
   */
  abstract agregar(entrada: {
    tenantId: string;
    identidadId: string;
    rolId: string;
    correo: string;
    nombre: string;
  }): Promise<ResultadoDeAlta | 'rol_inexistente'>;
}

export abstract class PuertoIdentidades {
  abstract buscarPorCorreo(correo: string): Promise<{ id: string; eliminada: boolean } | null>;
  /** Crea la identidad con su contraseña y el correo YA verificado (lo probó el token). */
  abstract crearVerificada(entrada: {
    correo: string;
    nombre: string;
    contrasena: string;
  }): Promise<{ id: string }>;
}
