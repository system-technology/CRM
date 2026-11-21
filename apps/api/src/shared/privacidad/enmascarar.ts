/**
 * Mínima exposición de PII en logs, auditoría y errores (T-099, R10).
 *
 * Un solo punto de formateo: lo que sale a un log pasa por `redactarPII`. No toca las respuestas
 * HTTP ni los datos que el cliente legítimo necesita; solo lo que se escribe en trazas.
 */

/** `+57 300 123 4567` -> `+•••••••4567`: queda el final, que basta para reconocer a quien llama. */
export function enmascararTelefono(telefono: string): string {
  const digitos = telefono.replace(/\D/g, '');
  if (digitos.length <= 4) return '•'.repeat(digitos.length);
  const mas = telefono.trim().startsWith('+') ? '+' : '';
  return `${mas}${'•'.repeat(digitos.length - 4)}${digitos.slice(-4)}`;
}

// 8 a 15 dígitos, con separadores habituales y `+` opcional (E.164 tiene un máximo de 15).
// Ni pegado a letras o guiones (UUID, códigos) ni con forma de fecha ISO.
const TELEFONO = /(?<![\w-])(?!\d{4}-\d{2}-\d{2}(?!\d))\+?\d[\d\s().-]{6,18}\d(?![\w-])/g;
// «pasaporte: AB123456», «passport=...».
const DOCUMENTO = /(pasaporte|passport)(\s*(?:n[úu]mero|no\.?|:|=)?\s*)[A-Z0-9-]{5,}/gi;
// «fecha de nacimiento: 1990-05-01», «birthdate=01/05/1990».
const NACIMIENTO =
  /(nacimiento|birth(?:date)?)(\s*(?:de|:|=)?\s*)(?:\d{4}-\d{2}-\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/gi;

// El DETAIL de una violación de unicidad de Postgres: `Key (apodo)=(isabel) already exists`, o
// `Key (tenant_id, apodo)=(<uuid>, isabel)`. El apodo es dato personal (ADR-0031 §4).
const DETALLE_DE_APODO = /(Key \([^)]*\bapodo\b[^)]*\)=\()([^)]*)(\))/gi;

/**
 * Sustituye teléfonos, pasaportes, fechas de nacimiento y apodos (el valor del `Key (apodo)=(...)`
 * de Postgres) que aparezcan dentro de un texto libre.
 */
export function redactarPII(texto: string): string {
  return texto
    .replace(
      DETALLE_DE_APODO,
      (_m, antes: string, _valor: string, cierre: string) => `${antes}[REDACTADO]${cierre}`,
    )
    .replace(DOCUMENTO, (_m, clave: string, sep: string) => `${clave}${sep}[REDACTADO]`)
    .replace(NACIMIENTO, (_m, clave: string, sep: string) => `${clave}${sep}[REDACTADO]`)
    .replace(TELEFONO, (m) => (m.replace(/\D/g, '').length >= 8 ? enmascararTelefono(m) : m));
}
