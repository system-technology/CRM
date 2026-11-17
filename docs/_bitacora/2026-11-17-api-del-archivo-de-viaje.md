# 2026-11-17 — API del archivo de viaje (T-242 y T-248)

**Participantes:** agente `backend`.
**Alcance:** ADR-0024 §3.3–§3.5 y §3.7 (Fase 3): dominio de la reserva, avance del archivo, pasajeros,
cancelación y las cinco rutas. T-241 se marca `done` (integrado en #290 y #291, e2e en verde en CI).

## Qué se hizo

- **Dominio** (`booking/domain/`). `reserva.ts`: la máquina de estados de `Booking` con el mapa exacto del
  ADR, las exigencias que la tabla también comprueba por CHECK (time limit al confirmar, fecha de pago
  total al abonar, motivo al caer), coherencia de plazos (`time_limit ≤ pago_total`, ninguno después de la
  salida en la zona de la agencia) y borrado del par de avisos al cambiar un plazo. `archivo.ts`: avance
  derivado (`POR_CONFIRMAR`, `CONFIRMADO`, `PAGADO_A_PROVEEDORES`, `SIN_RESERVAS_VIVAS`), semáforo
  (vencido / menos de 24 h / en plazo), orden por plazo, validación de pasajeros y cancelación.
  Errores tipados en `errors-de-operacion.ts`.
- **API** (`ArchivosController`): `GET /archivos`, `GET /archivos/:id`, `PUT /archivos/:id/reservas/:reservaId`,
  `PUT /archivos/:id/pasajeros`, `POST /archivos/:id/cancelacion`. Cada mutación bloquea primero la fila
  del archivo (`FOR UPDATE`) y trabaja en una transacción; la reserva se filtra por `id AND travel_file_id`
  además de RLS. Contratos en `packages/contracts/src/archivos.ts` (R3).
- **T-248.** `netoUnidades` se omite —la clave entera— sin `cotizacion.ver_neto_y_margen`, en la lista,
  el detalle y la respuesta de cada mutación. El mapeador exige `verNeto` como parámetro sin valor por
  defecto. El permiso sale de `ContextoTenant`, no del cliente.
- **Pruebas.** Unitarias de dominio (`reserva.spec.ts`, `archivo.spec.ts`), del caso de uso con repositorio
  en memoria (neto con y sin permiso, 404 por agencia y por archivo, idempotencia) y
  `booking-archivos.e2e-spec.ts` (HTTP real, dos agencias, los archivos nacen por aceptar cotizaciones):
  404 cruzado en lectura y en cada mutación, la fila ajena intacta leída con el rol de la API, y el
  recorrido completo.

## Decisiones que conviene revisar

- **Permisos.** `archivo.ver` y `archivo.operar` (ADR-0024 §3.7) **no existen** en el catálogo, y la
  migración F1 no los añadió. Crearlos exige migración (ruta protegida, dueño `datos`), que esta tarea no
  escribe. Mientras tanto las mutaciones exigen `cotizacion.escribir` (DUENO y ASESOR) y la lectura queda
  abierta a todo miembro, en una sola constante. Cola: T-249. Efecto visible: `OPERACIONES` no podrá
  operar archivos hasta T-249, contra lo que dice el ADR.
- **Cancelar el archivo** cancela con él sus reservas vivas y se rechaza (409) si alguna está
  `PAGADA_AL_PROVEEDOR`: el ADR dice que tras el pago total cancelar es penalidad y está fuera.
- **`PUT` de reserva:** ausente = conservar, `null` = borrar; las fechas de cada paso se escriben al
  entrar al estado, así que repetir el cuerpo no cambia nada. El `timeLimit` solo se fija al confirmar y
  el pago total al confirmar o abonar; una reserva terminada solo admite corregir localizador y nota.
- La lista no tiene cursor (hasta 500, ordenada en memoria por plazo): suficiente para una agencia
  pequeña; con volumen es otra decisión.

## Pendiente (no bloquea)

- T-249 (permisos del catálogo).
- Sin eventos al cambiar de estado: los avisos de plazo son F5.
- El e2e no se pudo correr contra Postgres local en esta sesión; lo valida el CI.
- El e2e usa el atajo `x-dev-tenant-id`, que concede todos los permisos: el caso «sin permiso» lo cubre
  el caso de uso, no HTTP con una sesión real.
