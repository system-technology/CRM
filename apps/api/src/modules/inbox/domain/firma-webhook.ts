/**
 * Verificación de la firma de los webhooks de Meta.
 *
 * Lógica pura, sin NestJS ni Express, para poder probarla de verdad: es la frontera entre «esto
 * viene de Meta» y «esto lo manda cualquiera», y no admite verificarse a ojo.
 *
 * Contrato verificado en `docs/04-integraciones/01-whatsapp-cloud-api.md` §4:
 *
 *   · Cabecera `X-Hub-Signature-256`, valor `sha256=<64 hexadecimales en minúsculas>`.
 *   · HMAC-SHA256 del **cuerpo crudo, byte a byte, antes de cualquier parseo**.
 *   · Clave: el App Secret de **nuestra** app de Meta. Uno solo para toda la plataforma.
 *   · Comparación en tiempo constante.
 *
 * **Lo que esta firma prueba y lo que no.** Prueba que la petición viene de Meta. **No prueba
 * nada sobre el tenant**: el secreto es global, así que una firma válida no dice de qué agencia
 * es el mensaje. Eso lo resuelve el directorio de enrutamiento del ADR-0008, después.
 *
 * **Por qué el cuerpo crudo.** Meta serializa los caracteres no ASCII con escapes Unicode
 * (`\uXXXX`). Si se parsea y se vuelve a serializar, los bytes cambian y la firma no coincide
 * jamás. Es el error número uno de esta integración y tiene un modo de fallo cruel: **aparece
 * solo cuando alguien escribe con tilde o emoji** — es decir, en producción, nunca en las
 * pruebas que uno escribe en inglés.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Por qué se rechazó. El código es estable; el mensaje puede cambiar. */
export type MotivoRechazo =
  'FALTA_CABECERA' | 'FORMATO_INVALIDO' | 'NO_COINCIDE' | 'CUERPO_VACIO' | 'SECRETO_AUSENTE';

export type ResultadoFirma = { valida: true } | { valida: false; motivo: MotivoRechazo };

const PREFIJO = 'sha256=';
const LARGO_HEX = 64;

/**
 * Comprueba la firma de una petición entrante.
 *
 * `cuerpo` tiene que ser el Buffer original. Si alguien pasa aquí el resultado de
 * `JSON.stringify(req.body)`, funcionará en las pruebas y fallará con el primer cliente que
 * escriba «¿Cuánto cuesta?».
 */
export function verificarFirma(
  cuerpo: Buffer,
  cabecera: string | undefined,
  appSecret: string | undefined,
): ResultadoFirma {
  // Sin secreto no se puede verificar nada. Rechazar es la única respuesta honesta: aceptar
  // «porque no hay con qué comprobar» convierte una variable de entorno olvidada en un
  // endpoint abierto.
  if (!appSecret) return { valida: false, motivo: 'SECRETO_AUSENTE' };

  if (!cabecera) return { valida: false, motivo: 'FALTA_CABECERA' };
  if (cuerpo.length === 0) return { valida: false, motivo: 'CUERPO_VACIO' };

  if (!cabecera.startsWith(PREFIJO)) return { valida: false, motivo: 'FORMATO_INVALIDO' };

  const recibida = cabecera.slice(PREFIJO.length);
  // Se valida la FORMA antes de comparar. `Buffer.from(x, 'hex')` ignora en silencio lo que no
  // sea hexadecimal, así que sin esto una cabecera basura produciría un buffer corto y la
  // comparación fallaría por longitud en vez de por contenido — mismo resultado hoy, pero el
  // motivo registrado sería engañoso.
  if (recibida.length !== LARGO_HEX || !/^[0-9a-f]+$/.test(recibida)) {
    return { valida: false, motivo: 'FORMATO_INVALIDO' };
  }

  const esperada = createHmac('sha256', appSecret).update(cuerpo).digest();
  const recibidaBytes = Buffer.from(recibida, 'hex');

  // Tiempo constante. Comparar con `===` filtra, byte a byte, cuánto se acertó: con suficientes
  // intentos se reconstruye una firma válida sin conocer el secreto.
  if (recibidaBytes.length !== esperada.length) return { valida: false, motivo: 'NO_COINCIDE' };
  if (!timingSafeEqual(recibidaBytes, esperada)) return { valida: false, motivo: 'NO_COINCIDE' };

  return { valida: true };
}

/**
 * Firma un cuerpo. **Solo para pruebas y para el entorno de desarrollo**: en producción quien
 * firma es Meta.
 *
 * Vive aquí, junto a la verificación, a propósito: si la forma de la cabecera cambiara, las dos
 * mitades cambian juntas y las pruebas lo detectan. En archivos separados se desincronizan.
 */
export function firmar(cuerpo: Buffer, appSecret: string): string {
  return PREFIJO + createHmac('sha256', appSecret).update(cuerpo).digest('hex');
}
