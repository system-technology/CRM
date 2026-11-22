# 2026-11-21 · Blindaje de las URL públicas (T-597, carril a)

## Qué pasó

Un cliente en staging veía la web pero no podía entrar. La API estaba sana. La causa probable es
que `WEB_PUBLIC_URL` (y quizá `API_PUBLIC_URL`) no están puestas en el panel de Render (`sync:
false`) y el código cae a `localhost` sin decir nada.

## Qué se hizo

- `apps/api/src/shared/red/urls-publicas.ts`: aviso de arranque (nivel `error`) si fuera de
  desarrollo (`APP_ENV != local`) una de las dos variables falta, está vacía, no es URL o apunta a
  `localhost`/`127.0.0.1`/`::1`. Nombra variable, valor en uso y consecuencia. **No aborta.**
- `configurar-api.ts` lo llama (lo comparten `main.ts` y `main-unico.ts`).
- `origin-check.middleware.ts`: el 403 ahora registra el `Origin` recibido y la lista de confianza.
- `auth.provider.ts` usa `urlPublicaDeLaApi` (mismo valor por omisión, una sola definición).

## Cómo reconocer el fallo (para el propietario)

- Respuesta del navegador: `POST /api/v1/auth/sign-in/email` (o `otp/...`) con **403** y cuerpo
  `{"error":{"code":"ORIGEN_NO_CONFIABLE","message":"Origen no permitido."}}`.
- Registro de la API: `Origin no permitido: "https://..." ... Orígenes de confianza: ["http://localhost:3000"]`
  y, al arrancar, `WEB_PUBLIC_URL no está definida: se usa http://localhost:3000...`.
- Esa respuesta la da **nuestro** `OriginCheckMiddleware`, antes de llegar a Better Auth.
- Si algún día el rechazo viniera de Better Auth (cookie presente, `Origin` fuera de
  `trustedOrigins`): 403 con `{"code":"INVALID_ORIGIN","message":"Invalid origin"}` (o
  `MISSING_OR_NULL_ORIGIN` / «Missing or null Origin»), y su propio log con la lista.

## Hipótesis del encargo

1. **Falsa en lo esencial.** El middleware global salta GET/HEAD/OPTIONS, no POST: el login es un
   POST y lo corta nuestro middleware (registrado primero, `forRoutes('*')`), y además el
   controlador repite la comprobación. Better Auth (1.7.22) solo valida `Origin` si la petición
   trae cookie (`validateOrigin`: `if (!(forceValidate || useCookies)) return`).
2. **Matizada.** `API_PUBLIC_URL` no bloquea el ingreso: el controlador llama a Better Auth con
   `http://interno/...` y el origen del navegador lo valida `trustedOrigins`. Pero `baseURL` decide
   `Secure` y el prefijo `__Secure-` de la cookie de sesión: con `http://localhost` en un despliegue
   https la cookie sale sin `Secure`. El aviso cubre ambas, con consecuencia distinta.
3. **Cierta.** Sin ADR: solo visibilidad. No se propuso admitir varios orígenes.
4. **Cierta.** Ver «Para encolar».

## Para encolar (no se hizo)

- **Proponer, no hecho:** abortar el arranque en entorno real si estas variables faltan (patrón
  R2). Requiere decisión del propietario/arquitecto, y que staging ya esté bien configurado.
- `configurar-api.ts`: `enableCors` y `bandeja-en-vivo.gateway.ts` repiten el valor por omisión
  `http://localhost:3000`; `origenesDeConfianzaDeLaWeb` sigue cayendo en silencio (ahora avisa).
- `render.yaml`: `API_PUBLIC_URL`/`WEB_PUBLIC_URL` son `sync: false` y el comentario dice «origen
  exacto de CORS, Socket.IO y comprobación de Origin»; convendría añadir que sin ella nadie inicia
  sesión. Ruta protegida: no se tocó.
- Misma trampa (`sync: false` + valor de desarrollo): `API_TRUST_PROXY` (por omisión sin saltos de
  proxy: la IP del límite de tasa sería la del proxy), `MAIL_FROM`, `POSTMARK_MESSAGE_STREAM`.
  Por revisar: `API_INTERNAL_URL`/`NEXT_PUBLIC_API_URL` de la web (cae a `localhost:3333`).
- El CI `e2e` es el que corre las pruebas con Postgres; aquí no se pudieron ejecutar.
