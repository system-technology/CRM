# 2026-10-20 — identity: endurecimiento (dos pendientes del auditor-seguridad)

Rama `fix/identity-endurecimiento`, desde v0.37.0. R13: una sola vuelta.

## 1. Socket con revalidación que no puede comprobarse
`bandeja-en-vivo.gateway.ts`: «sesión inválida» (el resolutor responde que no) cierra al momento;
«no pude comprobar» (el resolutor lanza) cuenta como fallo y, tras N seguidos, cierra con motivo
`REVALIDACION_NO_DISPONIBLE`. Una respuesta válida reinicia la cuenta. N = `SOCKET_REVALIDACION_MAX_FALLOS`
(3 por defecto). Pruebas con resolutor caído en `bandeja-en-vivo.gateway.spec.ts`.

## 2. Límite de envíos de OTP
Puerto `LimitadorDeEnvios` (application), adaptador Redis (`INCR` + `EXPIRE NX`, requiere Redis 7) y
uno en memoria solo para pruebas (`LIMITADOR_OTP=memoria`). Clave = HMAC-SHA256(secreto, tipo:valor):
ni correo ni IP en claro en Redis. Por defecto 3/correo y 10/IP cada 15 min
(`OTP_ENVIOS_POR_CORREO`, `OTP_ENVIOS_POR_IP`, `OTP_VENTANA_SEGUNDOS`).

- **Por IP** (`req.ip`): 429 `DEMASIADOS_INTENTOS`. No revela nada: cuenta toda petición.
- **Por correo**: responde `{ ok: true }` 200 y no envía, idéntico a un correo inexistente. Trade-off:
  el titular legítimo no ve aviso; la pantalla debe decir que puede volver a pedir en 15 minutos.
  Un 429 por correo también sería independiente de la existencia (cuenta siempre), pero se pidió
  idéntico al caso inexistente.
- Si Redis falla, el error se propaga (500); no se concede ni se niega en silencio.

## Cola
- Prueba del adaptador Redis contra un Redis real (hoy solo con doble del cliente).
- El límite de Better Auth (en memoria, 3/min por IP) sigue en pie; con varias réplicas, ver cola previa.
- Web: la pantalla de «pedir código» debería mostrar el mensaje de arriba.
