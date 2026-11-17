/**
 * El aviso en memoria que `quoting` (o cualquier productor) da al despachador de su MISMO proceso
 * cuando acaba de confirmar un evento en el outbox (ADR-0024 §1).
 *
 * Es una **pista**, no una garantía: si se pierde (otra réplica, un reinicio), el barrido con
 * `tenants_con_eventos_por_entregar` lo recoge. Solo se llama DESPUÉS de confirmar la transacción:
 * avisar antes haría que el despachador no viera nada. Nunca lanza ni espera.
 */
export abstract class PuertoAvisoDeEventosDeDominio {
  abstract avisar(tenantId: string): void;
}
