# 2026-10-20 — Adaptador CorreoPostmark (ADR-0012)

- `CorreoPostmark`: `fetch` sin SDK, `POST /email`, sin seguimiento, stream `outbound`, timeout 10 s.
  No reintenta: clasifica en `ErrorDeCorreoTransitorio` (red, timeout, 429, 5xx) o
  `ErrorDeCorreoDefinitivo` (4xx, incluido 422). **La politica de reintento es una inferencia**, no
  la oficial de Postmark (que no la publica). El consumidor convierte los definitivos en
  `UnrecoverableError` y BullMQ reintenta el resto.
- Seleccion: `MAIL_PROVIDER=postmark|mailpit|memoria` (se conserva el nombre del ADR). Con postmark
  sin `POSTMARK_SERVER_TOKEN`, el trabajador (`crearCorreo`) y la API (`validarConfiguracionDeCorreo`)
  abortan al arrancar. Sin respaldo a Mailpit.
- Registros (R10): solo id del trabajo y `ErrorCode`; prueba que lo demuestra.
- Invitacion: 7 dias -> 72 horas.
- Pruebas: `fetch` simulado; ninguna llamada real a Postmark.
- Pendiente del propietario (ADR-0012): contratar el Retention Add-on a 7 dias, dominio, DNS, token.
- Verificado en local: typecheck, lint y unitarias de notifications/identity. Push y CI pendientes
  por falta de red a GitHub.
