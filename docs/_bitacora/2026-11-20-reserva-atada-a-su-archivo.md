# 2026-11-20 - La reserva atada a su archivo, ocurrido_en de la base y orden de la lista (T-256, T-257)

**Participantes:** agente `datos`. **Origen:** auditorías de seguridad de T-254 y de T-250/T-251
(hallazgos BAJO, cola R13). **Rama:** `fix/booking-endurecer-historial-y-lista`.

## Qué se hizo

- **Migración `20261120090000_reserva_atada_a_su_archivo_y_ocurrido_en_de_la_base`:**
  - `UNIQUE bookings_id_travel_file_id_tenant_id_key (id, travel_file_id, tenant_id)`.
  - En `notificaciones` y `reserva_cambios_estado`, una sola foránea
    `(reserva_id, archivo_id, tenant_id) → bookings (id, travel_file_id, tenant_id)`, NO ACTION /
    ON UPDATE RESTRICT, NOT VALID + VALIDATE, en lugar de las dos separadas. La foránea directa al
    archivo se retira: la cubre la de la reserva más `bookings_travel_file_id_tenant_id_fkey`.
  - Comprobación previa agencia por agencia (con `app.current_tenant`, por la RLS forzada): aborta
    con agencia, tabla, número y ejemplo si alguna fila nombra una reserva de otro archivo.
  - `reserva_cambios_estado.ocurrido_en` lo fija un disparador BEFORE INSERT
    (`fijar_ocurrido_en_de_la_base()`, sin SECURITY DEFINER, `search_path` vacío, sin EXECUTE para
    PUBLIC). Privilegios sin cambios: `viajapro_app` SELECT e INSERT.
  - Cinturón al final, con el patrón de las dos migraciones anteriores.
- `schema.prisma`: el único de tres columnas y las dos relaciones nuevas; `TravelFile` pierde las
  relaciones inversas `notificaciones` y `cambiosDeReserva` (ningún código las usaba).
- `aislamiento.spec.ts`: N-2/H-2 (inventario de foráneas y destino del único), N-5/H-6 (reserva de
  otro archivo de la misma agencia → 23503 con la foránea nueva; y el UPDATE de `archivo_id` en una
  notificación), H-8 (el `ocurrido_en` del INSERT se ignora). El literal `PRIVILEGIOS_DECLARADOS` no
  cambia.
- Backend (commit aparte): la lista de `/api/v1/archivos` ordena los archivos sin plazo por número
  DESCENDENTE, en el SQL y en `compararPorPlazo`, con pruebas unitarias y un e2e;
  `booking-apertura.e2e-spec.ts` con fechas relativas a hoy.

## Decisiones

- **Disparador y no INSERT por columnas** para `ocurrido_en`: `privilegios_declarados` declara
  privilegios de tabla y `aplicar_privilegios_declarados()` hace REVOKE ALL + GRANT en cada
  migración; un GRANT por columnas se perdería sin aviso. Darle columnas a la declaración cambiaría
  su forma (ADR-0024 §5.2) y no hacía falta.
- Los otros dos historiales (`oportunidad_cambios_etapa`, `cotizacion_cambios_estado`) tampoco
  protegen su `ocurrido_en` (solo tienen el disparador de solo añadir). La función nueva es genérica
  para aplicárselo si se decide. No se tocó aquí ni se creó tarea: candidato a la cola.

## Sin verificar aquí

No hay Postgres en este entorno: la migración desde cero, el cinturón, `aislamiento.spec.ts` y los
e2e de booking los valida el CI. Sí pasaron `prisma generate`, `pnpm typecheck`, `pnpm lint` y las
unitarias de la API.
