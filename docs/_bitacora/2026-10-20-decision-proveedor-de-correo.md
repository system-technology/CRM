# 2026-10-20 — Decisión del propietario: proveedor de correo (ADR-0012)

El propietario respondió en su propia sesión a dos preguntas cerradas. Sus respuestas, literales:

| Pregunta | Respuesta |
|---|---|
| ¿Aceptas el ADR-0012, Postmark como proveedor de correo transaccional? | «Acepto Postmark» |
| ¿Desde qué dominio se envían los correos? | «Un dominio técnico neutro» |

## Qué queda decidido

- El proveedor de correo de producción es **Postmark**, llamado por HTTP desde el adaptador
  `CorreoPostmark` de `PuertoCorreo`, sin SDK.
- Se envía desde un **dominio técnico neutro**, sin el nombre comercial, que todavía no está
  decidido. Así, cambiar el nombre comercial no obliga a migrar la reputación del dominio de envío.

## Qué tiene que hacer el propietario

Los pasos completos están en el ADR-0012. En resumen:

1. Comprar el dominio neutro.
2. Crear la cuenta Basic de Postmark con MFA y el mínimo de usuarios.
3. Publicar en el DNS los registros DKIM, Return-Path y DMARC.
4. Pasar el token a `devops` por el gestor de secretos, nunca por el chat.
5. Pedir al abogado que confirme la lista de la SIC y el aviso de privacidad.

## Qué sigue

`backend` construye el adaptador `CorreoPostmark` detrás del puerto, con las condiciones del
auditor: registrar solo el `ErrorCode` y nunca el contenido ni el destinatario completo.
