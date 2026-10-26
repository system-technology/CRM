# Despliegue de demo gratuito — pasos del propietario

Sirve para **enseñar el CRM por una URL** sin pagar nada. No sustituye al staging de
[`despliegue-staging.md`](despliegue-staging.md) (ADR-0013), que es de pago y con dominio propio.

## Qué se ve en cada vía

| Pantalla | A. Solo web (hoy, gratis) | B. Web + API (gratis, con credenciales) |
|---|---|---|
| Pipeline, contactos, viajes, reportes, configuración | Sí, con datos de demostración | Sí |
| Cotizador y catálogo | **No** (el selector de paquetes viene de la API: se ve vacío) | Sí, contra Neon |
| Bandeja de WhatsApp | Maqueta sin conversaciones | Sin canal de Meta aún: vacía |
| Inicio de sesión | No hay guardia de login | Real (Better Auth) |

Lo medido, no supuesto: se abrió la web local sin API y el cotizador mostraba el selector vacío.

## A. Solo web — 10 minutos, sin coste

1. Crear cuenta en Render con GitHub (plan gratuito).
2. **New > Blueprint**, repositorio `system-technology/CRM`, rama `main`, archivo **`render.demo.yaml`**.
3. Render construye `apps/web/Dockerfile` (3–6 min). No pide ningún secreto.
4. Abrir la URL `https://viajapro-web-demo.onrender.com`.

*Comprobación:* `/salud` responde 200 y `/pipeline` muestra el kanban con la etiqueta «datos de demostración».

*Límites:* el servicio se duerme tras ~15 minutos sin visitas; la primera visita tarda ~1 minuto en
despertar. Ábrelo antes de una reunión.

## B. Web + API — lo que necesita el propietario (gratis)

Todo son credenciales y cuentas: ninguna pasa por el chat ni entra al repositorio (R6).

1. **Roles de la base.** Tu `.env` local es anterior al rol `viajapro_identidad`. En tu terminal:
   `pwsh scripts/generar-secretos-locales.ps1` (o `rol:crear` contra la rama de Neon que uses).
   Esto levanta también la API en local y es el primer paso para cualquier despliegue.
2. **Neon gratuito.** Una rama con el esquema y los datos sintéticos (`pnpm db:migrate:deploy`, `pnpm db:seed`).
3. **Correo.** El inicio de sesión envía un código por correo. Opciones gratuitas: cuenta de Postmark de
   desarrollo (100 correos al mes) o, solo para una demo controlada, leer el código en el registro del servicio.
4. **Secretos propios:** `BETTER_AUTH_SECRET`, `CORREO_PAYLOAD_KEY`, `WEBHOOK_PAYLOAD_KEY`, `META_APP_SECRET`
   (`openssl rand -base64 32`), distintos de cualquier otro entorno.
5. **API sin Redis ni trabajador**, para caber en el plan gratuito: `COLA_CHANGES=inerte`, `COLA_CORREO=memoria`,
   `BUS_DE_EVENTOS=memoria`, `LIMITADOR_OTP=memoria`. Con esto no se procesan webhooks de WhatsApp (aún no hay canal).
6. **Cookie de sesión.** Con la web y la API en subdominios distintos de `onrender.com` la cookie no llega en Safari
   (ADR-0013 §1). Funciona en Chrome; para todos los navegadores hace falta un dominio propio.

Cuando tengas 1–4 te preparo el blueprint de la API gratuita y lo probamos.

## Qué no hace ninguna de las dos vías
- No despliega automáticamente al integrar en `main`.
- No incluye producción ni datos reales de agencias: solo datos sintéticos.
