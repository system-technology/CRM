/**
 * Guardia de identidad del rol de conexión.
 *
 * **Por qué existe.** Desde el ADR-0008 hay tres roles de login —`viajapro_app`,
 * `viajapro_altas`, `viajapro_webhook`— con **privilegios idénticos sobre las tablas de
 * negocio**. Se diferencian únicamente en qué funciones `SECURITY DEFINER` pueden ejecutar, y
 * una de ellas, `registrar_enrutamiento`, puede repuntar el número de cualquier agencia hacia
 * otro tenant.
 *
 * Eso significa que **apuntar `DATABASE_APP_URL` al rol de altas devuelve a toda la superficie
 * HTTP de la API la capacidad de secuestrar el canal de una agencia**. Es un copiar y pegar
 * entre dos bloques contiguos del mismo `.env`.
 *
 * Y ninguna de las aserciones de aislamiento puede detectarlo: todas comprueban privilegios
 * **por rol**, y los privilegios estarían bien. Lo que estaría mal es *qué rol se conectó*. Por
 * eso el ADR-0008 §5 lo declara como una de las tres verificaciones que no son de base de
 * datos, y el auditor la subió a primera tarea de 4b.
 *
 * **Por qué no basta con mirar `BYPASSRLS`.** La comprobación anterior solo preguntaba eso, y
 * un superusuario responde `false` —no necesita el atributo, se salta RLS igual—. En Neon el
 * propietario sí lo tiene, así que el agujero no se veía; en local y en CI, donde el rol de
 * migraciones es superusuario, estaba abierto.
 *
 * La lógica vive aquí separada del servicio para poder probarla sin una base de datos.
 */

/**
 * Los roles de login. Los tres primeros son del ADR-0008; `viajapro_identidad` es del ADR-0011:
 * el pool de Better Auth, el único que toca las tablas globales de identidad y el único que NO
 * toca ninguna de negocio. Cada pool declara cuál debe ser.
 */
export const ROLES_DE_CONEXION = [
  'viajapro_app',
  'viajapro_altas',
  'viajapro_webhook',
  'viajapro_identidad',
] as const;
export type RolDeConexion = (typeof ROLES_DE_CONEXION)[number];

/** Lo que el motor responde sobre la conexión actual. */
export interface IdentidadObservada {
  usuario: string;
  esSuperusuario: boolean;
  saltaRls: boolean;
}

/**
 * Comprueba la identidad observada contra la esperada.
 *
 * Devuelve `null` si todo está bien, o el mensaje de por qué no se debe arrancar. No lanza: el
 * llamador decide, y así la lógica se prueba sin montar un módulo de Nest.
 */
export function verificarIdentidad(
  observada: IdentidadObservada,
  esperado: RolDeConexion,
): string | null {
  if (observada.usuario !== esperado) {
    return (
      `Este proceso debe conectarse como '${esperado}' y se conectó como '${observada.usuario}'. ` +
      'Los tres roles tienen los mismos privilegios sobre las tablas y se distinguen solo en qué ' +
      'funciones ejecutan, así que ninguna prueba de aislamiento detecta esta confusión: la ' +
      'detecta este guardia o no la detecta nadie. Revisa la variable de entorno del proceso.'
    );
  }

  if (observada.esSuperusuario) {
    return (
      `'${observada.usuario}' es superusuario. Un superusuario se salta RLS sin necesitar el ` +
      'atributo BYPASSRLS, de modo que el aislamiento entre agencias sería ficticio y nada lo ' +
      'delataría. Ver R2 y ADR-0003.'
    );
  }

  if (observada.saltaRls) {
    return (
      `'${observada.usuario}' tiene BYPASSRLS. El aislamiento entre agencias sería ficticio. ` +
      'Ejecuta `pnpm --filter @viajapro/database run rol:crear`. Ver ADR-0007.'
    );
  }

  return null;
}

/**
 * Resuelve la cadena de conexión de un proceso **sin respaldo**.
 *
 * El `?? DATABASE_URL` que había antes es la forma exacta del agujero que esta tanda de
 * correcciones persigue: un respaldo puesto para que «funcione igual» que, cuando se activa,
 * conecta la aplicación con el rol propietario. Hoy preferimos no arrancar.
 */
export function resolverCadena(
  entorno: Record<string, string | undefined>,
  variable: string,
): string {
  const valor = entorno[variable];
  if (!valor) {
    throw new Error(
      `Falta ${variable}. No hay respaldo a propósito: caer a otra cadena conectaría este ` +
        'proceso con un rol que no es el suyo, y eso no produce ningún error visible.',
    );
  }
  return valor;
}

/**
 * Tablas de negocio que `viajapro_identidad` NO debe poder leer (ADR-0011, superficie exacta).
 *
 * `verificarIdentidad` comprueba *qué rol* se conectó; esto comprueba *qué puede hacer*. El rol
 * de identidad no entra en el literal `roles_de_aplicacion`, así que no debería tener ningún
 * privilegio sobre ellas. Si un `GRANT` suelto o un cambio en `aplicar_privilegios_declarados`
 * se lo diera, el pool que guarda los hashes de contraseña y las sesiones de todas las agencias
 * podría además leer sus clientes: es la combinación que el cuarto rol existe para impedir.
 */
export const TABLAS_DE_NEGOCIO_VEDADAS_A_IDENTIDAD = [
  'usuarios',
  'roles',
  'contactos',
  'mensajes',
  'cotizaciones',
] as const;

/** Devuelve el motivo para no arrancar si el rol de identidad lee alguna tabla de negocio. */
export function verificarSinPrivilegiosDeNegocio(tablasLegibles: readonly string[]): string | null {
  if (tablasLegibles.length === 0) return null;
  return (
    `'viajapro_identidad' puede leer tablas de negocio (${tablasLegibles.join(', ')}). El pool ` +
    'de identidad guarda hashes y sesiones de todas las agencias y no debe ver sus datos. ' +
    'Revisa excepciones_rls y aplicar_privilegios_declarados (ADR-0011).'
  );
}
