# 2026-11-20 — Tope diario de fallos del código por correo (T-300)

Hallazgo ALTO previo al despliegue. Rama `fix/identity-tope-de-fallos-otp`.

- Antes: 3 intentos por código y 3 códigos por correo cada 15 min; rotando IP, ~864 intentos por día y
  cuenta sobre 10^6 combinaciones.
- Ahora: el 10.º fallo de verificación por correo en 24 h bloquea el correo (`TopeDeFallosDeCodigo`,
  identificador `viajapro:otp-fallos:` + HMAC del correo). Agotado, `/otp/iniciar-sesion` rechaza también el
  código correcto con `CODIGO_INVALIDO`, sin llegar a Better Auth. Un acierto no cuenta; un correo
  inexistente cuenta igual.
- **El contador vive en Postgres** (`ContadorDeFallosPostgres`): una fila de `verificaciones` por fallo
  (tabla global del rol de identidad, sin migración), con barrido oportunista de vencidas (LIMIT 100) al
  insertar. La primera versión usaba memoria y la auditoría lo bloqueó: en el plan gratuito el proceso
  duerme a los 15 min y el atacante provoca los reinicios. Consultar el cupo (`quedaCupo`) falla cerrado si la base falla; registrar un fallo se hace antes de la limpieza de vencidas y esta no lo impide.
- Lo que NO sobrevive a un reinicio en modo único: el límite de envíos de código (memoria) y el límite
  por IP de Better Auth (memoria). Va a la cola como T-301; el tope de fallos ya no depende de ellos.
- El limitador en memoria ahora está acotado (barre vencidas al insertar, máximo 10 000 claves).
- El puerto `LimitadorDeEnvios` gana `quedaCupo`; `claveDeLimite` acepta prefijo opcional.
- Límite conocido: consultar y registrar no son atómicos; peticiones simultáneas pueden pasar por unas
  pocas, acotadas por los 3 intentos por código. No bloquea.
- Pruebas: unitarias (`limitador-de-envios.spec.ts`) y e2e en `invitaciones.e2e-spec.ts` (incluye que el
  10.º fallo llega a Better Auth, el 11.º no, y que una instancia nueva ve el bloqueo). El e2e no se pudo
  correr aquí: no hay Postgres en el entorno.
