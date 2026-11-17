# 2026-11-17 — Avisos de plazo como notificación en la aplicación (T-254, parte «en la aplicación»)

**Participantes:** agente `backend`.
**Alcance:** ADR-0024 §1 (despachador) y §3.6 (avisos): que el asesor VEA en la aplicación los cuatro
avisos que la vigilancia de T-244 deja en el outbox. El aviso por WhatsApp o correo (plantilla *utility*,
opt-in, por cola) sigue en T-254 con `whatsapp`; la campana y la lista en la web, en T-255.

## Qué se hizo

- **Consumidores.** `notifications` registra cuatro consumidores en el despachador, uno por tipo
  (`notifications.aviso_time_limit_proximo|vencido`, `notifications.aviso_pago_total_proximo|vencido`),
  desde un solo `ConsumidoresDeAvisosDePlazo` (`NotificationsAvisosModule`, solo en `AppModule`). Validan
  con `AvisoDePlazoV1` de contracts (R3), comprueban que `reservaId` sea el agregado del outbox, y usan el
  tenant de la FILA, nunca del payload. Un evento mal formado lanza `EVENTO_DE_AVISO_INVALIDO`.
- **R4: tres puertos nuevos** en `shared/puertos/puertos-para-avisos.ts`, sin importar ningún contexto:
  `PuertoArchivoDeUnAviso` (lo implementa `booking`: número de file y oportunidad, filtrando la reserva por
  `id AND travel_file_id`), `PuertoAsesorDeOportunidad` (`crm`) y `PuertoUsuariosConPermiso` (`identity`:
  usuarios activos con un permiso). Todos corren en la `tx` del despachador. Prueba de fronteras:
  `fronteras-de-avisos.spec.ts`.
- **Tabla `notificaciones`** (migración `20261118110000`, ruta protegida): `tenant_id`, RLS forzada
  (`aplicar_aislamiento_tenant`), FK compuestas a `usuarios`, `travel_files`, `bookings` y `outbox`,
  `UNIQUE (tenant_id, outbox_id, usuario_id)`, privilegios declarados solo para `viajapro_app`
  (SELECT, INSERT, UPDATE; sin DELETE) y cinturón al final. **Cero columnas de texto**: ids, número de
  file (entero), tipo (enum), plazo y `leida_en`; por eso la aserción 83 no cambia y no hay excepción R1.
  `outbox_id` es anulable con `SET NULL ("outbox_id")` para que la notificación sobreviva a una purga del
  outbox. El número de file se copia (R4: `notifications` no lee `travel_files`).
- **API.** `GET /api/v1/notificaciones?limite=` (no leídas primero, luego la más reciente; con
  `noLeidas` total) y `POST /api/v1/notificaciones/:id/lectura` (idempotente: conserva la primera hora).
  Solo las del usuario de la sesión: el usuario sale de `ContextoTenant`; la de otro usuario, de la misma
  agencia o de otra, da 404 `NOTIFICACION_NO_ENCONTRADA`. Sin permiso específico. Contratos en
  `packages/contracts/src/notificaciones.ts` (**el frontend depende de esto**, T-255).
- **Despertar al despachador.** `VigilarPlazosUseCase` llama ahora a `PuertoAvisoDeEventosDeDominio.avisar`
  tras cada agencia que escribió avisos, para que la notificación llegue en segundos y no en el siguiente
  barrido (60 min). Es solo una pista; el barrido la respalda.

## Decisión: a quién se avisa (el ADR no lo dice)

1. El **asesor** de la oportunidad de la que viene el archivo, si sigue activo y su rol tiene
   `archivo.operar` (avisar a quien no puede actuar es ruido).
2. Si no hay asesor elegible (archivo sin oportunidad, oportunidad sin asesor, asesor dado de baja o sin
   el permiso): **todos** los usuarios activos con `archivo.operar`.
3. Si tampoco hay nadie: no se escribe nada y se registra un aviso en el log (sin datos); el semáforo de
   Reservas sigue siendo la vigilancia visible. No es un error: reintentar no lo arreglaría.

El destinatario se fija al crear el aviso, no al leerlo: si el asesor cambia después, el aviso ya emitido
sigue siendo de quien lo recibió.

## Verificación

- `pnpm typecheck`, `pnpm lint` en verde. `pnpm --filter @viajapro/contracts build` y `prisma generate` sin
  errores. Unitarias: `apps/api` 145 archivos / 1327 pruebas y `packages/contracts` 11 archivos / 124 en verde.
- **No corrida (sin PostgreSQL en la sesión; lo valida el CI):** `notificaciones-avisos.e2e-spec.ts`
  (evento → una notificación al asesor; sin oportunidad → a los operadores y no al que no puede; dos pasadas
  y reentrega sin duplicar; aislamiento con otra agencia y con otro usuario de la misma agencia, 404 y fila
  intacta; control positivo; evento inválido), `booking-plazos.e2e-spec.ts` (cambió solo el constructor) y la
  sección «T-254» de `packages/database/tests/aislamiento.spec.ts` (N-1 a N-7). **La migración tampoco se
  aplicó contra una base:** su cinturón y el CI son la primera ejecución real.
- El e2e despacha **a mano** por agencia con el despachador del consumidor: no depende del barrido de
  arranque (inerte en las e2e desde PR #297).

## Pendiente (no bloquea)

- Aviso por WhatsApp o correo (T-254, con `whatsapp`) y la campana en la web (T-255).
- Revisión de `auditor-seguridad` de la migración y aprobación del propietario (ruta protegida).
