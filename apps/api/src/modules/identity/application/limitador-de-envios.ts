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
}

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
export function claveDeLimite(secreto: string, tipo: 'correo' | 'ip', valor: string): string {
  const normalizado = tipo === 'correo' ? valor.trim().toLowerCase() : valor.trim();
  const huella = createHmac('sha256', secreto).update(`${tipo}:${normalizado}`).digest('hex');
  return `viajapro:otp-envio:${tipo}:${huella}`;
}
