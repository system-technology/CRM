/**
 * Límite de envíos de código por correo (cola de seguridad, v0.35.0). Puerto: la aplicación no sabe
 * si el contador vive en Redis o en memoria.
 *
 * Ventana fija: el primer envío abre la ventana y el contador se borra solo al vencer (TTL).
 */
import { createHmac } from 'node:crypto';

export abstract class LimitadorDeEnvios {
  /** Cuenta un envío bajo `clave`. `true` si cabe en el límite; `false` si ya se superó. */
  abstract consumir(clave: string, maximo: number, ventanaSegundos: number): Promise<boolean>;
  /**
   * Mira sin consumir. `true` si bajo `clave` todavía caben más de `maximo` cuentas, es decir, si
   * la cuenta actual es menor que `maximo`. Una clave sin cuenta (o con la ventana vencida) cabe.
   */
  abstract quedaCupo(clave: string, maximo: number): Promise<boolean>;
}

/** Prefijo de los contadores de envíos de código. */
export const PREFIJO_DE_ENVIOS = 'viajapro:otp-envio:';
/** Prefijo de los fallos de verificación: contador distinto del de envíos, nunca se mezclan. */
export const PREFIJO_DE_FALLOS = 'viajapro:otp-fallos:';

export interface PoliticaDeEnvioDeCodigos {
  porCorreo: { maximo: number; ventanaSegundos: number };
  porIp: { maximo: number; ventanaSegundos: number };
}

const entero = (valor: string | undefined, defecto: number): number => {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 ? n : defecto;
};

/**
 * Por defecto: 3 códigos por correo y 10 por IP, cada 15 minutos. Configurables por
 * `OTP_ENVIOS_POR_CORREO`, `OTP_ENVIOS_POR_IP` y `OTP_VENTANA_SEGUNDOS`.
 */
export function politicaDeEnvioDeCodigos(
  entorno: Record<string, string | undefined>,
): PoliticaDeEnvioDeCodigos {
  const ventanaSegundos = entero(entorno['OTP_VENTANA_SEGUNDOS'], 15 * 60);
  return {
    porCorreo: { maximo: entero(entorno['OTP_ENVIOS_POR_CORREO'], 3), ventanaSegundos },
    porIp: { maximo: entero(entorno['OTP_ENVIOS_POR_IP'], 10), ventanaSegundos },
  };
}

/**
 * La clave del contador: HMAC-SHA256 con el secreto de la aplicación. Ni el correo ni la IP se
 * guardan en claro, y sin el secreto no se puede probar si un correo está en Redis por fuerza
 * bruta sobre un hash simple. El correo se normaliza: mayúsculas y espacios no cambian el buzón.
 */
export function claveDeLimite(
  secreto: string,
  tipo: 'correo' | 'ip',
  valor: string,
  prefijo: string = PREFIJO_DE_ENVIOS,
): string {
  const normalizado = tipo === 'correo' ? valor.trim().toLowerCase() : valor.trim();
  const huella = createHmac('sha256', secreto).update(`${tipo}:${normalizado}`).digest('hex');
  return `${prefijo}${tipo}:${huella}`;
}

/**
 * Tope de fallos de verificación del código por correo: 10 en 24 h por correo, sin importar la IP
 * (rotar direcciones no lo esquiva). Sin él, 3 intentos por código x 3 códigos cada 15 min dan
 * ~864 intentos por día y cuenta sobre un espacio de 10^6.
 */
export const TOPE_DE_FALLOS_DE_CODIGO = { maximo: 10, ventanaSegundos: 24 * 60 * 60 } as const;

/**
 * Lo que `TopeDeFallosDeCodigo` necesita de un contador: el mismo par de operaciones que
 * `LimitadorDeEnvios`, que por tanto también lo cumple (se usa en las pruebas). En producción el
 * contador de fallos vive en Postgres (`ContadorDeFallosPostgres`), no en Redis ni en memoria.
 */
export abstract class ContadorDeFallosDeCodigo {
  /** Cuenta un fallo bajo `clave`. `true` si todavía cabe en `maximo`. */
  abstract consumir(clave: string, maximo: number, ventanaSegundos: number): Promise<boolean>;
  /** `true` si la cuenta vigente de `clave` es menor que `maximo`. No consume. */
  abstract quedaCupo(clave: string, maximo: number): Promise<boolean>;
}

/**
 * Cuenta los fallos de verificación por correo y, agotado el tope, hace que la ruta rechace
 * también el código correcto hasta que venza la ventana (24 h desde cada fallo).
 *
 * **Sobrevive a reinicios.** En producción el contador es `ContadorDeFallosPostgres` (tabla
 * `verificaciones`), también en modo único: el plan gratuito duerme el proceso a los 15 minutos y
 * un contador en memoria se pondría a cero justo cuando el atacante lo provoca. Si la base falla,
 * falla cerrado (la petición da error; nunca se concede). Lo que NO sobrevive a un reinicio en
 * modo único es el límite de envíos de código y el límite por IP de Better Auth (T-301).
 *
 * El contador sube exista o no la cuenta, para que el bloqueo no revele si el correo existe.
 */
export class TopeDeFallosDeCodigo {
  constructor(
    private readonly contador: ContadorDeFallosDeCodigo,
    private readonly secreto: string,
  ) {}

  private clave(correo: string): string {
    return claveDeLimite(this.secreto, 'correo', correo, PREFIJO_DE_FALLOS);
  }

  /** `true` si el correo agotó su tope: no se debe ni consultar a Better Auth. */
  async estaBloqueado(correo: string): Promise<boolean> {
    return !(await this.contador.quedaCupo(this.clave(correo), TOPE_DE_FALLOS_DE_CODIGO.maximo));
  }

  /** Cuenta un fallo de verificación (código erróneo, caducado o sin identidad). */
  async registrarFallo(correo: string): Promise<void> {
    await this.contador.consumir(
      this.clave(correo),
      TOPE_DE_FALLOS_DE_CODIGO.maximo,
      TOPE_DE_FALLOS_DE_CODIGO.ventanaSegundos,
    );
  }
}
