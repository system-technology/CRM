# 2026-10-19 — Los cuatro huecos del disparador de estado y el tope del barrido

Agente: `datos`. Rama: `fix/db-huecos-disparador-y-intentos`, desde `origin/main` (343f313,
v0.30.1 + cierre de estado). Modo desatendido. Toca la frontera del webhook (ADR-0008, ADR-0010):
es aislamiento.

Sin migraciones ni mutaciones en Neon: todo validado en el CI.

## Qué se cerró

Migración `20261019230000_huecos_del_disparador_y_tope_del_barrido`. La regla de 4f no cambia:
**monótona, solo restringe, nunca relaja, con asiento en el historial**. Estado efectivo =
`REVOCADO` si hay `eliminado_en`, si no el `estado`.

| Hueco | Cierre | Aserción |
|---|---|---|
| (a) baja de cuenta | `propagar_estado_cuenta()`, disparador `cuentas_whatsapp_propagar_estado`: restringe las filas WABA (`cuenta_id`, mismo tenant) | 54 |
| (b) borrado lógico | Los dos disparadores escuchan `eliminado_en` y lo tratan como `REVOCADO` | 55 |
| (c) re-alta | `registrar_enrutamiento` rechaza (55000) un `p_estado` más laxo que el efectivo del canal (fila de número) o de la cuenta (fila WABA) | 56 |
| (d) `INSERT` | Los dos disparadores son `AFTER INSERT OR UPDATE OF estado, eliminado_en` | 57 |

Para (c) el dueño del directorio necesita leer el estado. Recibe `SELECT (id, tenant_id, estado,
eliminado_en)` sobre `canales` y `cuentas_whatsapp`, y nada más. No es una lectura entre tenants:
`registrar_enrutamiento` exige que el tenant de la sesión sea el de la fila y la RLS forzada se le
aplica. Sin contexto lee cero filas. La 56 lo comprueba por comportamiento y por catálogo. La
carrera entre un alta y una baja concurrente se cierra con `pg_advisory_xact_lock(7410100|7410101,
hashtext(id))`, que toman el disparador y la función antes de leer.

Barrido: `recepciones_webhook_changes.intentos_barrido` (smallint, default 0, CHECK >= 0),
`contar_reencolado_barrido(bytea, smallint)` (suma uno a un change PENDIENTE y devuelve el total;
0 si ya no está pendiente) y `listar_changes_pendientes(antigüedad, límite, p_max_intentos DEFAULT
10)`, que excluye `intentos_barrido > tope` y ordena por `intentos_barrido` antes que por
antigüedad. La llamada de dos argumentos del trabajador sigue resolviendo. Aserción 58.

De nueve funciones `SECURITY DEFINER` pasamos a once. Están en `MATRIZ_FUNCIONES` y
`PROPIETARIO_ESPERADO` (aserciones 12, 13, 20, 22 y 23) y en el inventario vivo de
`docs/02-arquitectura/03-modelo-de-datos.md`. ADR-0010 §1.2 no se edita, porque es inmutable.

## Verificación

- Rojo: run 39344429296, con solo las aserciones. Fallan 11: 12, 13, 20, 22, 23, 53, 54, 55, 56,
  57 y 58.
- Verde: run 39344759662, con la migración. Pasan 63/63 en aislamiento y todo el CI, incluida la
  cadena completa desde cero (aserción 23).

## Cola (no bloquea)

- **`backend`**: el contador del barrido sigue en Redis (`barrido.bullmq.ts`,
  `contarReencolado`), así que `intentos_barrido` se queda en 0 y el filtro todavía no actúa.
  Los cambios: `PuertoPendientes.listar` recibe `maxReencolados` y `pendientes.prisma.ts` lo pasa
  como tercer argumento. `contarReencolado` sale del puerto de coordinación y pasa a
  `PendientesPrisma`, con `SELECT public.contar_reencolado_barrido($1, $2::smallint)` (devuelve
  el total, la misma semántica que hoy). Hay que borrar el contador de Redis y ajustar los
  dobles en `barrer-pendientes.spec.ts`, `planificador-de-barrido.spec.ts` y el e2e.
- **`backend`**: dar de baja una cuenta tiene que dar de baja también sus canales. Las filas de
  número siguen la verdad de `canales`.
- **`arquitecto`**: el inventario de ADR-0010 §1.2 se quedó en ocho funciones. Hace falta una
  nota que lo supersede o que apunte al inventario vivo.
