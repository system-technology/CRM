/**
 * Política del límite de tasa general de la API (T-002). Todo sale del entorno; nada es una
 * constante escondida. Un valor inválido hace fallar el arranque con un mensaje que dice cuál.
 *
 * - `LIMITE_TASA_ACTIVO`: `true` (omisión) | `false`. Apagarlo es una decisión explícita y se avisa en el log.
 * - `LIMITE_TASA_POR_TENANT`: peticiones por ventana y agencia (omisión 600).
 * - `LIMITE_TASA_POR_IP`: peticiones por ventana y dirección IP (omisión 300).
 * - `LIMITE_TASA_VENTANA_SEGUNDOS`: tamaño de la ventana (omisión 60).
 * - `LIMITE_TASA_ALMACEN`: `memoria` | `redis` | vacío (Redis si hay `REDIS_URL`, si no memoria).
 */
export interface PoliticaDeLimiteDeTasa {
  readonly activo: boolean;
  readonly porTenant: number;
  readonly porIp: number;
  readonly ventanaSegundos: number;
  readonly almacen: 'memoria' | 'redis';
}

export class ConfiguracionDeLimiteDeTasaInvalidaError extends Error {
  readonly code = 'CONFIGURACION_LIMITE_TASA_INVALIDA';
  constructor(mensaje: string) {
    super(`Configuración del límite de tasa inválida: ${mensaje}`);
  }
}

type Entorno = Record<string, string | undefined>;

function entero(entorno: Entorno, nombre: string, omision: number): number {
  const crudo = entorno[nombre]?.trim();
  if (!crudo) return omision;
  if (!/^\d+$/.test(crudo) || Number(crudo) < 1 || !Number.isSafeInteger(Number(crudo))) {
    throw new ConfiguracionDeLimiteDeTasaInvalidaError(
      `${nombre}="${crudo}" debe ser un entero mayor o igual a 1.`,
    );
  }
  return Number(crudo);
}

export function leerPoliticaDeLimiteDeTasa(entorno: Entorno): PoliticaDeLimiteDeTasa {
  const activoCrudo = entorno['LIMITE_TASA_ACTIVO']?.trim().toLowerCase();
  if (activoCrudo && activoCrudo !== 'true' && activoCrudo !== 'false') {
    throw new ConfiguracionDeLimiteDeTasaInvalidaError(
      `LIMITE_TASA_ACTIVO="${activoCrudo}" debe ser "true" o "false".`,
    );
  }
  const almacenCrudo = entorno['LIMITE_TASA_ALMACEN']?.trim().toLowerCase();
  if (almacenCrudo && almacenCrudo !== 'memoria' && almacenCrudo !== 'redis') {
    throw new ConfiguracionDeLimiteDeTasaInvalidaError(
      `LIMITE_TASA_ALMACEN="${almacenCrudo}" debe ser "memoria" o "redis".`,
    );
  }
  const hayRedis = Boolean(entorno['REDIS_URL']?.trim());
  if (almacenCrudo === 'redis' && !hayRedis) {
    throw new ConfiguracionDeLimiteDeTasaInvalidaError(
      'LIMITE_TASA_ALMACEN=redis exige REDIS_URL.',
    );
  }
  return {
    activo: activoCrudo !== 'false',
    porTenant: entero(entorno, 'LIMITE_TASA_POR_TENANT', 600),
    porIp: entero(entorno, 'LIMITE_TASA_POR_IP', 300),
    ventanaSegundos: entero(entorno, 'LIMITE_TASA_VENTANA_SEGUNDOS', 60),
    almacen: almacenCrudo === 'memoria' ? 'memoria' : hayRedis ? 'redis' : 'memoria',
  };
}
