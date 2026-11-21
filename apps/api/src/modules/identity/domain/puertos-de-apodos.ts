/**
 * Puertos del ingreso por apodo (ADR-0031). Sin framework ni Prisma.
 */

export abstract class PuertoApodos {
  /**
   * Apodo (YA normalizado y con formato válido) → identidad y correo, con UNA sola consulta:
   * `accesos_identidad` unida a `identidades` con `eliminado_en IS NULL`. `null` si no hay fila
   * (no existe, el usuario está desactivado o la identidad está dada de baja: todo igual).
   * El correo que devuelve NUNCA sale hacia el cliente.
   */
  abstract resolverCorreo(apodo: string): Promise<{ identidadId: string; correo: string } | null>;
}

/** Lo que el catálogo y `tenants` dicen sobre si la función de apodos es segura (ADR-0031 §4, B3). */
export abstract class PuertoCatalogoDeApodos {
  /**
   * `true` si el apodo es único en TODO el sistema (fase 1). Se mira en el catálogo de Postgres, por
   * columnas y no por nombre. **Falla cerrado:** si la consulta falla, devuelve `true`.
   */
  abstract indiceDeApodosEsGlobal(): Promise<boolean>;
  /** Filas de `tenants` (global, sin RLS: está en `excepciones_rls`). */
  abstract cuentaDeAgencias(): Promise<number>;
}

/** Lo que el catálogo dice de UN índice único y válido de `public.accesos_identidad`. */
export interface IndiceUnicoDeAccesos {
  /** `apodo` está entre las columnas CLAVE (no entre las de `INCLUDE`). */
  apodoEnClave: boolean;
  /** `tenant_acceso_id` está entre las columnas clave. */
  tenantEnClave: boolean;
  /** Índice parcial (`WHERE ...`). */
  parcial: boolean;
  /** Índice con alguna expresión. */
  deExpresion: boolean;
  /** `apodo` aparece dentro de la expresión o del predicado (dependencia en `pg_depend`). */
  apodoEnExpresionOPredicado: boolean;
}

/**
 * ¿Hay un índice único que haga el apodo único en todo el sistema? Es global si algún índice único
 * y válido sobre `accesos_identidad`:
 *   · lleva `apodo` en las columnas clave y NO lleva `tenant_acceso_id`; o
 *   · es parcial o de expresión y toca `apodo` (clave, expresión o predicado): no se puede probar
 *     que sea por agencia, así que se trata como global (falla cerrado).
 */
export function hayIndiceGlobalDeApodos(indices: readonly IndiceUnicoDeAccesos[]): boolean {
  return indices.some((i) => {
    const tocaApodo = i.apodoEnClave || i.apodoEnExpresionOPredicado;
    if (!tocaApodo) return false;
    if (i.parcial || i.deExpresion) return true;
    return i.apodoEnClave && !i.tenantEnClave;
  });
}
