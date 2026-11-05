# 2026-11-04 — Roadmap de reportes

**Participantes:** `analista-datos`, a pedido del propietario. Solo lectura sobre `origin/main`
(`c908656`) y sobre los PR #207 y #213.

## Qué se hizo

- `docs/08-roadmap/06-roadmap-de-reportes.md`: once reportes con pregunta, fórmula, dato
  existente (sí, parcial o no, con tabla y columna), permisos y política por agencia. Fases piloto,
  V1 y después, con sus criterios de salida. Arquitectura sin almacén ni Redis, siguiendo el patrón
  de puertos del PR #213. Riesgos del dato y tabla del estado de hoy.
- `roadmap/tasks.yaml`: T-131 a T-151 (campo `owner`). Las seis de captura (T-131 a T-136) van en
  P0.

## Hallazgos verificados en el código

- No existe historial de cambios de etapa, y `oportunidades.cerrada_en` nunca se escribe.
- La cotización no guarda el instante de aceptación (solo `estado`).
- `conversaciones.sla_vence_en` nunca se escribe, así que el filtro `SLA_VENCIDO` de la bandeja
  siempre sale vacío.
- `primera_respuesta_en` se fija una sola vez en toda la vida de la conversación.
- No hay origen del lead, y no se extrae el `referral` de Meta.
- El valor por columna del tablero suma monedas distintas.
- `/reportes` usa 20 tarjetas por columna y el selector de periodo no filtra.

## Pendiente

- [ ] Si otra rama toma ids entre T-131 y T-151 antes de integrar, renumerar aquí.
- [ ] Decisión del `dueno-de-producto`: si el asesor ve las cifras del equipo (T-141).
