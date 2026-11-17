# 2026-11-17 — Vigilancia de los dos plazos del mayorista (T-244)

**Participantes:** agente `backend`.
**Alcance:** ADR-0024 §3.6 (F5): avisar, una vez por reserva y plazo, antes de que venza el *time
limit* del abono y la fecha de pago total, y cuando vencen.

## Qué se hizo

- **Dominio** (`booking/domain/plazos.ts`): `avisosDePlazo(reserva, ahora)` decide qué debe avisar una
  reserva: `CONFIRMADA` vigila `time_limit`, `ABONADA_AL_PROVEEDOR` vigila `pago_total_vence_en`
  (ADR §3.6.3). Umbral 24 h, constante (ADR §3.6.6). Un plazo ya vencido avisa solo «vencido». Todo en
  UTC; el reloj llega por parámetro.
- **Alerta = evento por outbox**, los cuatro tipos del ADR: `booking.time_limit_proximo`,
  `booking.time_limit_vencido`, `booking.pago_total_proximo`, `booking.pago_total_vencido`. Un solo
  esquema, `AvisoDePlazoV1` en `packages/contracts/src/eventos.ts`: `{ v, reservaId, archivoId,
  plazo, venceEn }`. Solo ids y el instante del plazo.
- **Caso de uso** `VigilarPlazosUseCase` + puertos; adaptadores Prisma en
  `infrastructure/vigilancia-de-plazos.prisma.ts`; `PlanificadorDePlazos` (interface) en
  `BookingModule`, que solo carga `AppModule` (modo único y escalado).
- **Idempotencia:** por agencia, una transacción: candidatas con `FOR UPDATE SKIP LOCKED`, el dominio
  decide, y cada marca se gana con `UPDATE … WHERE aviso_… IS NULL RETURNING id`; solo quien la gana
  escribe el evento (misma transacción). El aviso «vencido» cierra también la marca «próximo».
- **Nunca cambia `estado`.** Tampoco `actualizado_en`: es una marca del sistema.

## Decisiones que conviene revisar

- **Sin función `SECURITY DEFINER`.** El ADR §5.3 prevé `reservas_con_plazo_por_avisar()`; esta
  tarea no crea migraciones ni roles. En su lugar la lista de agencias sale de `tenants` (global, de
  solo lectura para `viajapro_app`; mismo patrón que `versiones-de-clave.prisma.ts`) y cada agencia se
  abre con `ejecutarCon` + `conTenant`. Coste O(agencias) transacciones por pasada, 1 por hora:
  irrelevante hoy. La función queda en la cola como **T-253** (`datos`); solo cambia el adaptador.
- **Planificador propio**, no un consumidor del despachador: no hay evento entrante que despachar, es
  una vigilancia por tiempo. Cada 60 min (`PLAZOS_INTERVALO_MS`, ≥ 1000) y una pasada al arrancar,
  igual que el despachador, para no impedir que Neon se suspenda. `PLAZOS_VIGILANCIA=inerte` la apaga;
  `apps/api/vitest.config.ts` la apaga en las e2e para que no marque reservas de fixtures ajenos.
- **Zona horaria (R9):** los plazos se comparan en UTC y el payload lleva el instante UTC; no hay
  presentación en esta tarea, así que la zona de la agencia no interviene.
- **Los eventos no tienen consumidor todavía.** Quedan en el outbox (el relay los marca publicados
  como a cualquier fila). El consumidor es **T-254** (`notifications`). Hasta entonces la vigilancia
  visible es el semáforo de la pantalla «Reservas».

## Verificación

- `pnpm typecheck`, `pnpm lint` y las pruebas unitarias de `apps/api` (141 archivos) en verde.
- **No corrida:** `booking-plazos.e2e-spec.ts` (necesita PostgreSQL con los roles; no había base en la
  sesión). Lo valida el CI. Cubre: plazo dentro del umbral → una alerta; segunda pasada → ninguna;
  cambiar el plazo → vuelve a avisar; fuera de umbral no avisa; vencido avisa una vez sin cambiar el
  estado; pago total; dos pasadas concurrentes → un solo aviso; aislamiento (la pasada de A no marca ni
  alerta a B) con control positivo (la de B sí).
- Pendiente de proceso: revisión de `auditor-seguridad` (la pide el ADR) e integración.
