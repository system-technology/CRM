/**
 * Redacción de logs (T-203, R6 y R10). Nada de lo que sale a un log debe poder contener texto de
 * un viajero, teléfonos, correos, documentos ni credenciales.
 *
 * Dos redes, porque una sola no basta:
 *   1. por NOMBRE de campo: `texto`, `telefono`, `correo`, `token`... se sustituyen enteros, sea
 *      cual sea su valor;
 *   2. por FORMA del valor: dentro de cualquier cadena (mensajes de error, pilas) se enmascaran
 *      correos, teléfonos, pasaportes, fechas de nacimiento, JWT, tokens de Meta (`EAA...`),
 *      `Bearer ...` y credenciales en URLs.
 * Lo que no se reconoce por ninguna de las dos pasa: la defensa real es no registrar contenido.
 */
import { redactarPII } from '../privacidad/enmascarar.js';

export const REDACTADO = '[REDACTADO]';
const PROFUNDIDAD_MAXIMA = 6;

// Claves que se sustituyen enteras. Se comparan normalizadas (minúsculas, sin `_`/`-`/tildes).
const CLAVE_SENSIBLE =
  /(telefono|celular|movil|phone|waid|correo|email|token|authorization|password|contrasena|clave|secret|secreto|cookie|apikey|pasaporte|passport|documento|nacimiento|birth|payloadcifrado|payload|firma|signature)/;
const CLAVE_SENSIBLE_EXACTA =
  /^(texto|text|body|contenido|content|caption|mensajetexto|from|to|nombre)$/;

function normalizar(clave: string): string {
  return clave
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function esClaveSensible(clave: string): boolean {
  const n = normalizar(clave);
  return CLAVE_SENSIBLE_EXACTA.test(n) || CLAVE_SENSIBLE.test(n);
}

const CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const TOKEN_META = /\bEAA[A-Za-z0-9]{20,}/g;
const CREDENCIAL_EN_URL = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;
const ASIGNACION_SECRETA =
  /\b(token|access_token|secret|password|clave|apikey|api_key)(\s*[:=]\s*)["']?[^\s"',;]{6,}/gi;

/** Enmascara lo que tiene forma de dato sensible dentro de un texto libre. */
export function redactarTexto(texto: string): string {
  return redactarPII(
    texto
      .replace(CREDENCIAL_EN_URL, `$1${REDACTADO}@`)
      .replace(BEARER, (_m, esquema: string) => `${esquema} ${REDACTADO}`)
      .replace(JWT, REDACTADO)
      .replace(TOKEN_META, REDACTADO)
      .replace(ASIGNACION_SECRETA, (_m, k: string, sep: string) => `${k}${sep}${REDACTADO}`)
      .replace(CORREO, REDACTADO),
  );
}

/** Copia segura de cualquier valor: sin ciclos, acotada en profundidad y con los Error aplanados. */
export function redactarValor(
  valor: unknown,
  profundidad = 0,
  vistos = new WeakSet<object>(),
): unknown {
  if (valor === null || valor === undefined) return valor;
  if (typeof valor === 'string') return redactarTexto(valor);
  if (typeof valor === 'number' || typeof valor === 'boolean') return valor;
  if (typeof valor === 'bigint') return valor.toString();
  if (typeof valor !== 'object') return `[${typeof valor}]`;
  if (vistos.has(valor)) return '[circular]';
  if (profundidad >= PROFUNDIDAD_MAXIMA) return '[profundo]';
  vistos.add(valor);

  if (valor instanceof Error) {
    const salida: Record<string, unknown> = {
      name: valor.name,
      message: redactarTexto(valor.message),
    };
    const codigo = (valor as { code?: unknown }).code;
    if (typeof codigo === 'string' || typeof codigo === 'number') salida['code'] = codigo;
    if (valor.stack) salida['stack'] = redactarTexto(valor.stack);
    return salida;
  }
  if (Buffer.isBuffer(valor)) return '[binario]';
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map((v) => redactarValor(v, profundidad + 1, vistos));

  const salida: Record<string, unknown> = {};
  for (const [clave, v] of Object.entries(valor)) {
    salida[clave] = esClaveSensible(clave) ? REDACTADO : redactarValor(v, profundidad + 1, vistos);
  }
  return salida;
}
