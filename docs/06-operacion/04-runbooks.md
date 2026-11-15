# Runbooks

Una entrada por alerta; **sin runbook no hay alerta** y una alerta que se ignora dos veces se borra
o se arregla. Dueño: `devops`. Alertas que existen hoy (T-203):

| Alerta | Quién la dispara | Entrada |
|---|---|---|
| API caída | Monitor externo sobre `GET /salud/listo` (HTTP != 200) | API caída |
| Cola atascada | Monitor externo, palabra clave `"atascada"` en `/salud/listo` | Cola atascada |
| Trabajador sin latido | Monitor externo, palabra clave `"trabajador":{"estado":"ok"` ausente | El trabajador no late |

## Monitor externo recomendado (sin dar de alta todavía)

Un monitor **externo** es obligatorio: si Render o la API caen, nada interno puede avisar de sí
mismo. Recomendación: **UptimeRobot** o **Better Stack**, ambos con plan gratuito (comprobar límites
e intervalo vigentes al darlos de alta; no se han verificado aquí). Tres monitores
sobre `https://<api>/salud/listo`:

1. *HTTP(s)* — alerta si el código no es 200. (API caída; también cubre «sin base de datos» o rol con RLS saltable: responde 503.)
2. *Palabra clave, «no debe existir»* `atascada` — cola atascada.
3. *Palabra clave, «debe existir»* `"trabajador":{"estado":"ok"` — trabajador vivo.

Aviso solo al correo/teléfono de quien está de guardia.
**En modo `unico` (sin Redis) no hay `trabajador` ni `cola` en la respuesta:** usar solo el monitor 1.
**Ninguno está creado:** darlos de alta requiere una cuenta del propietario (pendiente, T-203).

Convención de logs al investigar: cada línea de la API y del trabajador es JSON con `tenant_id`,
`trace_id` (= cabecera `x-request-id`) y `user_id`. Para seguir una petición: filtrar los registros
de Render por su `trace_id`. Nunca hay texto de mensajes, teléfonos, correos ni tokens (redacción en
`apps/api/src/shared/observabilidad/`); si hace falta ver el contenido, se mira en la base, bajo RLS.

---

## Entradas escritas

### La API no responde (`/salud/listo` no da 200)

**Sintoma.** El monitor externo marca caída: timeout, 502/504 (Render no encuentra el proceso) o
503 con `"estado":"degradado"`.

**Que significa, segun el cuerpo.**
- Sin respuesta / 502 / 504: el proceso murio o esta arrancando. Un arranque que aborta es
  intencional si el rol de base de datos no es el esperado o falta un secreto (R2): muere ruidoso.
- 503 `"baseDeDatos":"caida"`: la API vive pero no llega a PostgreSQL.
- 503 `"aislamiento":"EL ROL PUEDE SALTARSE RLS"`: **`DATABASE_APP_URL` apunta a un rol equivocado.
  Es un incidente de seguridad, no de disponibilidad: no reiniciar para «ver si se arregla»**.

**Que hacer.**
1. Render, servicio de la API: ultimo despliegue y registros. Si el fallo empezo con un despliegue,
   **revertir al anterior** (Render: Rollback) antes de investigar.
2. 503 con base caida: estado de la base (Neon/Render) y `DATABASE_APP_URL`. Si es la base, el
   trabajador tambien dejara de latir; esperar a que vuelva y reiniciar si no se recupera solo.
3. 503 por RLS: corregir `DATABASE_APP_URL` a `viajapro_app` y avisar al propietario; revisar
   si hubo trafico en la ventana (`auditor-seguridad`).
4. Verificar: `/salud/listo` 200 y `"estado":"ok"`.

**Despues.** Si fue un despliegue, anotarlo en `docs/_bitacora/` y abrir tarea para el hueco de prueba.

### Cola atascada (`/salud/listo` informa `cola.estado = "atascada"`)

**Sintoma.** El cuerpo trae `"cola":{"estado":"atascada","masViejaS":N,"pendientes":M,"umbralMin":5}`.
La API sigue en 200 y `estado` no cambia (a proposito: no debe impedir desplegar el arreglo).

**Que significa.** Hay webhooks de Meta guardados (recepciones) que llevan mas de `COLA_ALERTA_MIN`
minutos (5 por omision) sin procesarse. El trabajador mide cada 30 s la antiguedad del mas viejo y
la publica en Redis (`viajapro:cola:antiguedad`, caduca a 120 s). Los mensajes **entran y se
guardan, pero la bandeja no los ve**. `pendientes` llega como maximo a 1000 (es «al menos»).
`"cola":{"estado":"sin_verificar"}` no es atasco: nadie midio en 2 min (mira primero el latido).

**Que hacer.**
1. ¿Late el trabajador? Si `trabajador` no es `ok`, seguir su runbook primero: casi siempre es la causa.
2. Si late: registros del trabajador filtrando `level":"error"`. Causas habituales: un change que
   falla siempre (veneno), WhatsApp/Meta caido, o la base lenta.
3. Un solo `trace_id` que se repite = veneno: el barrido lo reintenta hasta su tope y lo abandona
   (`intentos_barrido`); no hace falta tocar nada a mano, pero hay que **arreglar la causa** (cola de tareas).
4. Reiniciar el trabajador solo si esta vivo pero sin avanzar. El barrido recupera lo guardado: no hay
   que reenviar nada.
5. Verificar: `masViejaS` baja por debajo del umbral en menos de 2 min.

**Limite conocido.** Solo mide la cola de ENTRADA. Los envios salientes (`mensajes` PENDIENTE) no
tienen aun medicion entre agencias (requiere una funcion `SECURITY DEFINER`, o sea una migracion).
Un envio atascado hoy se ve como mensajes que no salen y quejas de la agencia.

### El trabajador no late (`/salud/listo` informa `trabajador` distinto de `ok`)

**Sintoma.** `GET /salud/listo` responde 200 con `"estado":"degradado"` y `trabajador` en `viejo`,
`sin_latido` o `sin_verificar`. La sonda de staging (`deploy-staging.yml`) falla por eso.

**Que significa.** El trabajador escribe `viajapro:trabajador:latido` en Redis cada 15 s (caduca a
los 60 s; se considera viejo pasados 45 s). Sin latido, los mensajes de WhatsApp entran y se guardan
pero **nadie los procesa**: la bandeja no se actualiza y los envios no salen.
- `viejo` / `sin_latido`: el proceso murio, esta reiniciando, o no alcanza Redis.
- `sin_verificar`: es la API la que no alcanza Redis (o el valor es ilegible). Mirar Redis primero.

**Que hacer.**
1. Render, servicio `viajapro-worker-staging`: estado y registros. Si no arranca, el mensaje de
   salida dice por que (rol de base de datos equivocado, secreto ausente: muere ruidoso a proposito).
2. Si esta vivo pero no late: comprobar `REDIS_URL` del trabajador y que el Redis (`viajapro-redis-staging`) responde.
3. Reiniciar el trabajador (deploy hook o boton de Render). Al volver, el barrido (30 s) recupera lo
   que quedo guardado sin encolar: no hay que reenviar nada a mano.
4. Verificar: `/salud/listo` vuelve a `"estado":"ok"` en menos de 20 s.

**Por que no tumba la API.** La ruta es la sonda de la API en Render; un trabajador caido no debe
impedir un despliegue ni sacar la API de rotacion. Se informa, no se bloquea.
**En local:** `pnpm dev:nube` arranca el trabajador; con `pnpm dev` solo, y con `REDIS_URL` puesta, el
estado sale `degradado` hasta arrancar `pnpm --filter @viajapro/api worker`.
