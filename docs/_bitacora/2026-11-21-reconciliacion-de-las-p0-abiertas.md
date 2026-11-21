# 2026-11-21 — Reconciliación de las 14 P0 abiertas contra el código (T-574)

Carril `i`. Sin código de producto: solo `roadmap/tasks.yaml` y este rastro.

## Método

Para cada P0 se buscó el símbolo, la tabla, la ruta o la prueba en todo el proyecto (`git grep`) antes de decidir.
Las P0 nunca se habían contrastado (la reconciliación de las P1, PR #463, no las tocó).

## Resultado: 14 → 5 hechas, 5 bajadas, 4 siguen P0

| Tarea | Decisión | Evidencia |
|---|---|---|
| T-131 | **done** (hipótesis confirmada) | Migración `20261104150000_historial_de_etapas_de_oportunidad`; `moverOportunidad` y `crearOportunidad` escriben historial y `cerrada_en` en la misma transacción; `historial-de-etapas.e2e-spec.ts` |
| T-132 | **done** (hipótesis confirmada) | Migración `20261104160000_historial_de_estados_de_cotizacion`; `cotizaciones.use-case.ts:104`; `historial-de-estados.e2e-spec.ts`; ya la consume `cotizaciones-para-reportes.prisma.ts` |
| T-120 | **done** | `crm.controller.ts` (GET/POST/PATCH `etapas`, `etapas/reordenar`), `etapas.e2e-spec.ts`; la web guarda en `crm-api.ts` |
| T-121 | **done** | `miembros.controller.ts` GET `/identidad/miembros`; `equipo-api.spec.ts` (modo real) |
| T-123 | **done** | `.env.example` líneas 34, 38, 42 en `true`; el README ya documenta el arranque real |
| T-133 | P0 → P2 | No existe `origenes_lead` ni `origen_id`; sin agencia real no es lo más urgente |
| T-134 | P0 → P2 | No existe el parseo de `referral`; depende de T-133 |
| T-135 | P0 → P2 | No existe `politica_de_atencion`; el SLA funciona con el valor por defecto de 15 min |
| T-136 | P0 → P2, **reescrita** | El título decía «nadie escribe `sla_vence_en`»: es falso (`bandeja.prisma.ts:181-190`, e2e en `inbox-visibilidad.e2e-spec.ts`). Falta solo el segundo episodio |
| T-081 | P0 → P1 | Ensayo que depende de T-079 (nada desplegado) |
| T-079 | sigue P0 | No hay servicio desplegado (ADR-0028, guía de paneles pendiente del propietario) |
| T-080 | sigue P0 | Bloqueada por el propietario; tarda semanas, por eso no baja |
| T-093 | sigue P0 | `/privacidad` y `/terminos` existen como borrador; falta abogado y aprobación |
| T-126 | sigue P0 | Su bitácora declara «recorrido NO ejecutado»; falta el recorrido manual H1–H6 |

## Lo que enseñó

- El aviso de la sesión anterior (T-131 y T-132 ya hechas) era correcto, pero parcial: **otras tres** (T-120, T-121, T-123)
  también lo estaban, y el título de T-136 describía un estado que ya no era cierto.
- Las tareas «de captura» (T-133 a T-136) eran P0 por el roadmap de reportes, no por urgencia del piloto.

## Pendiente

Nada nuevo. T-136 queda atada a T-135 (P2).
