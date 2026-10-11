/**
 * La regla de pérdida, aislada y sin dependencias.
 *
 * Está sola en su archivo por una razón concreta: es la única regla de negocio de este módulo
 * que **no se puede comprobar ni en el esquema Zod ni en un `CHECK` de PostgreSQL**, porque
 * necesita mirar otra tabla. Lo que no puede vivir en una frontera declarativa tiene que vivir
 * en una función pura y probada, o acaba repartido en tres sitios y cumplido en ninguno.
 *
 * No lanza: devuelve el motivo o `null`. Quien llama decide qué error construir, y así esto se
 * prueba sin montar Nest ni base de datos.
 */

export type ViolacionDePerdida = 'FALTA_MOTIVO' | 'MOTIVO_SOBRANTE';

/**
 * @param etapaDestinoEsPerdida lo dice la fila de `etapas_pipeline`, no la clave: una agencia
 *   puede llamar «Se fue con otra» a su etapa de pérdida y seguir siéndolo.
 */
export function comprobarMotivoDePerdida(
  etapaDestinoEsPerdida: boolean,
  motivoPerdida: string | null,
): ViolacionDePerdida | null {
  if (etapaDestinoEsPerdida && motivoPerdida === null) return 'FALTA_MOTIVO';
  if (!etapaDestinoEsPerdida && motivoPerdida !== null) return 'MOTIVO_SOBRANTE';
  return null;
}
