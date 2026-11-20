/**
 * ¿Este error es la colisión de un apodo? (ADR-0031 §1)
 *
 * Postgres da `23505` (violación de unicidad) y el disparador `sincronizar_acceso_identidad()` lo
 * levanta al copiar el apodo a `accesos_identidad` (índice `accesos_identidad_apodo_key`, global en
 * la fase 1); `usuarios_tenant_id_apodo_key` es el de la misma agencia. Se identifica por la
 * RESTRICCIÓN, no por el texto del mensaje: el mensaje de Postgres lleva `Key (apodo)=(...)`, o sea
 * el apodo, que es dato personal y no debe llegar a ningún log. Quien llama traduce y descarta el
 * error original; esta función no lo imprime.
 *
 * Prisma entrega la restricción como el nombre del índice o, si parseó el `DETAIL` de Postgres, como
 * las columnas (`['apodo']` o `['tenant_id', 'apodo']`). Se aceptan las dos formas.
 */
import { Prisma } from '@prisma/client';

export const RESTRICCIONES_DE_APODO: readonly string[] = [
  'accesos_identidad_apodo_key',
  'usuarios_tenant_id_apodo_key',
];

function textos(valor: unknown): string[] {
  if (typeof valor === 'string') return [valor];
  if (Array.isArray(valor)) return valor.filter((v): v is string => typeof v === 'string');
  return [];
}

/**
 * Respaldo: un error que Prisma NO clasificó como `P2002`/`P2010` (p. ej. el que levanta el
 * disparador y llega como error desconocido de la consulta) pero cuyo mensaje nombra la restricción
 * de apodo Y dice que es una violación de unicidad. El mensaje solo se mira, nunca se registra.
 */
function esUnicidadDeApodoPorMensaje(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const m = error.message;
  const esUnicidad = m.includes('23505') || /duplicate key|unique constraint/i.test(m);
  return esUnicidad && RESTRICCIONES_DE_APODO.some((r) => m.includes(r));
}

export function esColisionDeApodo(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return esUnicidadDeApodoPorMensaje(error);
  }
  const meta: Record<string, unknown> = error.meta ?? {};

  if (error.code === 'P2002') {
    const objetivos = [...textos(meta['target']), ...textos(meta['constraint'])];
    // Cuando el `23505` lo levanta un disparador sobre OTRA tabla (aquí `accesos_identidad`), Prisma
    // no sabe de qué restricción se trata ("Unique constraint failed on the (not available)") y no
    // trae ni `target` ni `constraint`. El único llamador envuelve solo el UPDATE de
    // `usuarios.apodo`, cuyo disparador solo puede chocar con las dos unicidades del apodo.
    if (objetivos.length === 0) return true;
    return objetivos.some((o) => RESTRICCIONES_DE_APODO.includes(o) || o === 'apodo');
  }

  // Error crudo de una función o disparador: P2010 con el SQLSTATE 23505 en `meta.code`. Aquí solo
  // se busca el NOMBRE de la restricción dentro del mensaje; el mensaje no se registra.
  if (error.code === 'P2010' && meta['code'] === '23505') {
    return RESTRICCIONES_DE_APODO.some((r) => error.message.includes(r));
  }
  return false;
}
