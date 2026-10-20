# 2026-10-20 — identity: el límite de OTP contra Redis real

Rama `test/identity-limite-otp-redis-real`, sobre v0.37.1.

- Nueva `apps/api/src/modules/identity/limite-otp-redis.e2e-spec.ts`: aplicación ensamblada con
  `LIMITADOR_OTP` desactivado (Redis real). Corre con `CI=true` o `PRUEBA_BULLMQ=1` + `REDIS_URL`;
  en local se salta avisando por consola. Afirma 429 por IP (contador MAX+1 en Redis), corte
  silencioso por correo (3 envíos, el cuarto da 200 y no sale correo), clave = HMAC sin correo ni IP
  (SCAN) y TTL acotado por la ventana.
- `.env.example`: `SOCKET_REVALIDACION_MAX_FALLOS=3` como línea real.
- Sin migraciones ni cambios de producción. Escribe y borra una identidad `fixture-otp-redis-*` en la
  base de CI.
