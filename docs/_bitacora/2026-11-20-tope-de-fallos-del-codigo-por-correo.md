# 2026-11-20 — Tope diario de fallos del código por correo (T-300)

Hallazgo ALTO previo al despliegue. Rama `fix/identity-tope-de-fallos-otp`.

- Antes: 3 intentos por código y 3 códigos por correo cada 15 min; rotando IP, ~864 intentos por día y
  cuenta sobre 10^6 combinaciones.
- Ahora: 10 fallos de verificación por correo en 24 h (`TopeDeFallosDeCodigo`, prefijo
  `viajapro:otp-fallos:`, contador aparte del de envíos). Agotado, `/otp/iniciar-sesion` rechaza también
  el código correcto con `CODIGO_INVALIDO`, sin llegar a Better Auth. Un acierto no cuenta.
- El puerto `LimitadorDeEnvios` gana `quedaCupo` (consulta sin consumir) en Redis y en memoria;
  `claveDeLimite` acepta un prefijo opcional (por defecto el de envíos).
- Modo único: el limitador es en memoria; un reinicio pone a cero la ventana (documentado en el código).
- Límite conocido: consulta y registro no son atómicos; peticiones simultáneas pueden pasar el tope por
  unas pocas, acotadas por los 3 intentos por código y el límite de Better Auth por IP. No bloquea.
- Pruebas: unitarias (`limitador-de-envios.spec.ts`) y e2e en `invitaciones.e2e-spec.ts`. El e2e no se
  pudo correr aquí: no hay Postgres en el entorno.
