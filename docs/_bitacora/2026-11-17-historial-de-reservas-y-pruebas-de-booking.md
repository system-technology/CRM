# 2026-11-17 — Historial de estados de la reserva y pruebas de booking (T-250, T-251)

**Participantes:** agente `backend`.
**Rama:** `feat/booking-historial-y-pruebas` (un commit por tarea). Sin integrar. La migración es ruta
protegida: espera auditoría y aprobación del propietario.

## T-250 — `reserva_cambios_estado`

- **Tabla** (migración `20261118120000`): `id`, `tenant_id`, `reserva_id`, `archivo_id`,
  `estado_anterior`, `estado_nuevo` (enum `estado_reserva`), `usuario_id` (nulo sin usuario),
  `ocurrido_en` (UTC). Foráneas compuestas con el tenant a `bookings`, `travel_files` y `usuarios`
  (`NO ACTION`, como `notificaciones`, para que la cascada de la agencia no choque). CHECK
  `estado_anterior <> estado_nuevo`. RLS forzada con `aplicar_aislamiento_tenant`. Cinturón al final
  con las mismas comprobaciones que `20261117120000` y `20261118110000`.
- **Privilegios:** `viajapro_app` SELECT e INSERT; ningún otro rol. Sin UPDATE ni DELETE ni TRUNCATE:
  inmutable para la aplicación. Literal `PRIVILEGIOS_DECLARADOS` actualizado.
- **Cero columnas de texto** (ids, dos enums, un instante): la aserción 83 no cambia y no hay
  excepción R1. Sin neto ni PII.
- **Decisión: escritura desde el adaptador, no disparador.** El CRM (T-131) y las cotizaciones (T-132)
  escriben su historial desde el adaptador del caso de uso, en la misma transacción que el UPDATE; se
  sigue eso. Con un disparador en `bookings` habría una segunda fuente de verdad para el «quién»
  (`actualizado_por`) y la tabla pasaría a depender de un SECURITY DEFINER o de privilegios del
  disparador. Con el adaptador hay un solo punto de escritura por camino
  (`guardarReserva` y `guardarCancelacion`), ambos con el archivo ya bloqueado `FOR UPDATE`, así que
  el «estado anterior» leído no se puede haber movido. Coste: un camino nuevo que cambie
  `bookings.estado` tiene que llamar a `registrarCambiosDeEstado`; lo cubre el e2e.
  A diferencia de las otras dos tablas de historial **no** lleva el disparador de solo añadir: el
  privilegio ya lo impide y no existe un rol de aplicación con UPDATE.
- **Cuándo se registra:** solo si el estado cambia (corregir nota, localizador o plazo no deja fila;
  repetir el PUT tampoco). El alta (PENDIENTE) no es un cambio y no se registra. Cancelar el archivo
  deja una fila por cada reserva viva (`CANCELADA`, con su estado de origen y quien canceló).
  Sin relleno de las reservas existentes.
- **Contrato (el frontend depende de esto):** `DetalleDeArchivo.historial` (requerido) con
  `CambioDeEstadoDeReserva { id, reservaId, estadoAnterior, estadoNuevo, usuarioId, ocurridoEn }`.
  Solo en el detalle (`GET /archivos/:id` y las mutaciones que lo devuelven), del más antiguo al más
  reciente; sin neto. Se ajustaron `apps/web/src/lib/mock-archivos.ts` (`historial: []`) y
  `archivos-api.ts` (el resumen lo descarta).

## T-251 — pruebas y orden

- **Neto sin permiso, por HTTP con sesiones reales:** nuevo miembro `conNeto` (control) y el rol
  OPERACIONES ya existente, que no tiene `cotizacion.ver_neto_y_margen`. Lista, detalle, PUT de
  reserva, PUT de pasajeros y cancelación no traen la cadena «neto». Control: con el permiso la clave
  viaja y coincide con la de la base.
- **Fechas relativas a hoy** en `booking-archivos.e2e-spec.ts` y `booking-plazos.e2e-spec.ts`: la
  salida es hoy + 120 días; la vigencia, ±14 días; los plazos, relativos a la salida. En plazos el reloj
  inyectado `AHORA` es la salida − 5 días. `booking-apertura.e2e-spec.ts` conserva fechas de 2027-03
  (fuera del alcance pedido; queda anotado).
- **Orden en la base antes del LIMIT:** `listar` ordena en SQL por el plazo vigente más próximo
  (`CONFIRMADA` → `time_limit`, `ABONADA_AL_PROVEEDOR` → `pago_total_vence_en`; el mínimo entre las
  reservas; solo cuenta en un archivo ABIERTO), sin plazo al final por número ascendente, y recién
  después aplica `LIMIT`. Es el mismo orden que `compararPorPlazo`, que el caso de uso conserva.
  Consecuencia de producto: sin plazo, el límite recorta los archivos más NUEVOS en vez de los más
  antiguos. e2e: con límite 1 sale el antiguo con plazo vencido, no el último abierto.

## Verificación

Sin Postgres local: las pruebas e2e y `aislamiento.spec.ts` (secciones H-1 a H-7) las valida el CI.
Corrieron en local `contracts build`, `prisma generate`, typecheck, lint y las unitarias.

## Pendiente (cola)

- `booking-apertura.e2e-spec.ts` con fechas relativas a hoy.
- Mostrar el historial en la pantalla de Reservas (frontend).
