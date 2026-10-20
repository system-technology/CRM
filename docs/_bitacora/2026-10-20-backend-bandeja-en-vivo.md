# 2026-10-20 — La bandeja en vivo con Socket.IO

Agente: `backend`. Rama `feat/inbox-tiempo-real`, desde `origin/main` (v0.35.0).

## Qué quedó

- **Gateway Socket.IO** en `inbox` (`interface/bandeja-en-vivo.gateway.ts`), ruta `/api/v1/tiempo-real`.
  - **Handshake:** pasos 3 y 4 de ADR-0011 con el puerto `ResolutorDeAcceso` (la cookie del handshake).
    Si falla, `connect_error` con `NO_AUTORIZADO:<motivo>`. **Nunca se lee un tenant del cliente**
    (`auth`, query, cabeceras, mensajes): ni la cabecera de desarrollo existe aquí. `Origin` ajeno se rechaza.
  - **Salas:** `tenant:<id>` y `usuario:<id>`, asignadas por el servidor. El evento `unirse` no da ninguna
    capacidad: pedir otra sala devuelve `SALA_NO_PERMITIDA` y no une nada.
  - **Revalidación cada 60 s** (pasos 3 y 4, con la cookie guardada del handshake). Cierra si la sesión se
    revocó, dieron de baja la membresía, la agencia se suspendió o cambió la agencia activa (las salas ya no
    serían suyas). Un fallo de infraestructura no concede ni niega: se reintenta.
  - **Cierre por evento:** `identity.acceso_revocado` cierra los sockets del usuario sin esperar al intervalo.
- **Eventos por outbox (R4, R5).** `BandejaPrisma` ya escribía `inbox.mensaje_recibido` en la MISMA transacción
  que el mensaje. Faltaba el relay: `RelevarOutbox` lee el outbox de cada agencia bajo RLS (rol del
  trabajador, `FOR UPDATE SKIP LOCKED`), publica y marca `publicado_en` en la misma transacción
  (al menos una vez; el cliente deduplica por `id`). `PlanificadorDeRelay` (proceso trabajador): cada 0,5 s las
  agencias AVISADAS por `ProcesarChange`, y cada 15 s un barrido de respaldo. El trabajador no llama al gateway.
- **Decisión de transporte: Redis pub/sub, no el adaptador de Redis de Socket.IO.** El relay vive en el
  trabajador, que no es un servidor de Socket.IO. Con el adaptador, el trabajador tendría que emitir en el
  protocolo de Socket.IO (`redis-emitter`: nombres de sala y de evento dentro del trabajador), que es llamar
  al gateway por la puerta de atrás. Con pub/sub el trabajador publica un EVENTO DE DOMINIO sin saber que
  existen sockets; cada réplica de la API se suscribe y emite a SUS sockets. No hace falta el adaptador. El
  cierre por baja también viaja como evento de dominio. Bus elegido por `BUS_DE_EVENTOS` (`memoria` en pruebas).
  Decisión con la que ADR-0001 («adaptador de Redis a escala») NO se contradice: el fan-out entre réplicas
  queda resuelto por pub/sub; si algún día se necesita `fetchSockets` entre réplicas, se añade el adaptador.
- **La carga** es el contrato `EventoBandeja` (`MENSAJE_NUEVO` con `Mensaje`), validado antes de salir y
  armado con lo que la API LEE de la base bajo RLS con el tenant del evento. **El texto del viajero y su teléfono
  nunca pasan por Redis** (el evento lleva identificadores; una prueba escucha el canal en crudo). Sin neto
  ni margen: no existen en `Mensaje`. Adjuntos: `[]` hasta que exista la descarga a S3 (el contrato exige URL
  propia y firmada).
- **Contratos** (`packages/contracts/src/inbox.ts`): `RUTA_SOCKET_BANDEJA`, `EVENTO_SOCKET_BANDEJA`,
  `EVENTO_SOCKET_CIERRE`, `EVENTO_SOCKET_UNIRSE`, `PeticionDeUnirse`, `RespuestaDeUnirse`. **El frontend
  depende de esto.** La autenticación es la cookie (mismo origen); no hay token ni `auth` en el handshake.
- **Las 4 `it.todo` de ADR-0011**, convertidas en pruebas reales en `inbox-tiempo-real.e2e-spec.ts`
  (cookie de A no recibe B; sesión revocada y membresía de baja cierran en la revalidación; pedir la sala
  de otra agencia es rechazado), más suspensión, cambio de agencia, handshake sin sesión, evento de otro tenant y
  cierre por evento. `RevalidarConexion` (identity) se eliminó: el gateway usa el puerto directamente.
- **e2e con Redis (solo CI):** `inbox-tiempo-real-redis.e2e-spec.ts`: POST firmado -> trabajador -> relay ->
  Redis -> API -> socket; el cliente correcto lo recibe y el otro no; idempotencia del relay; un mensaje
  malformado en Redis se descarta.
- Se movió `origen.ts` a `shared/red/` (lo usan identity y el gateway).

## Dependencias nuevas

`socket.io` (apps/api): el servidor de WebSocket con reconexión y respaldo por sondeo que fija ADR-0001. Sin
`@socket.io/redis-adapter` (ver la decisión). `socket.io-client` (devDependency): el cliente de las pruebas.

## Variables nuevas

`BUS_DE_EVENTOS` (vacío = Redis; `memoria` = un proceso). Las pruebas fijan `memoria` en `vitest.config.ts`.

## Cola (no bloquea)

| Pendiente | Dueño |
|---|---|
| Los eventos que el outbox ya tenga SIN publicar de antes (el relay no existía) saldrán todos en el primer barrido tras desplegar; los sockets los emitirán como mensajes «nuevos». Decidir si se caducan los de más de N horas | `datos`, `backend` |
| Quien da de baja a un usuario o revoca su sesión debe publicar `identity.acceso_revocado` (hoy no hay caso de uso de baja; el respaldo de 60 s cubre) | `backend` |
| Las salas son por agencia: todo asesor recibe todos los mensajes entrantes. Filtrar por `conversaciones.ver_todas` y asignación cuando haya asignación en vivo (`MENSAJE_ACTUALIZADO`, `CONVERSACION_ACTUALIZADA`, mensajes salientes) | `backend`, `dueno-de-producto` |
| Solo se emite `MENSAJE_NUEVO` de entrantes; faltan los demás tipos de `EventoBandeja` | `backend` |
| Websocket detrás de la reescritura `/api/v1/*` de Next: comprobar el `upgrade` en un navegador real (el sondeo largo funciona si no) | `frontend`, `devops` |
| `intentos` del outbox no se incrementa al fallar la publicación | `backend` |
