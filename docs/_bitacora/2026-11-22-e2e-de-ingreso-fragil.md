# 2026-11-22 — La e2e de ingreso que tumbaba la compuerta (T-592)

## Síntoma

El job `navegador` cayó cuatro veces en una noche, en PR sin relación entre sí, y pasó al relanzar sin
cambiar nada. Siempre: `09-reportes-por-alcance` › `beforeAll` › «No se pudo ingresar con
ana@agenciademo.test. La pantalla dijo: Error de autenticación».

## Causa raíz (demostrada con el log del CI, no supuesta)

El limitador de `/sign-in/email` de Better Auth admite **5 intentos por minuto por IP**
(`INTENTOS_DE_INICIO_POR_MINUTO`, `crear-auth.ts`), **no por identidad**. Todo el job sale de la misma
IP. Los ingresos por pantalla de la suite son: `01` 2 (clave equivocada y buena), `08` 3, `09` 2 = 7,
repartidos en ~90 s. Que quepan depende de cuánto tarda el tramo 02-07 entre `01` y `08`: si pasan
más de 60 s, el cupo se libera y `08`+`09` suman justo 5 (cero margen); si pasan menos, `ana@` es el
sexto intento y recibe 429.

Pruebas, en el log del job fallido (`navegador`, 19:59 UTC del 2026-11-21): el texto completo de la
alerta era «Error de autenticación» **más** «Demasiados intentos fallidos…» (el mensaje de 429; la
prueba solo mostraba la primera línea en el resumen), y `api.log` registra
`DEMASIADOS_INTENTOS: Demasiados intentos` a las 19:59:13, con el «Invalid password» de `01` a las
19:58:08 y el «User not found» de `08` a las 19:59:12. El fallo de `ana@` llega con `08` y `09` a menos
de ~65 s de `01`.

No es el tope diario de 10 fallos por identidad (ese cuenta fallos de `ana@`, que no falló nunca antes),
ni contaminación de cookies (cada ingreso usa un contexto limpio), ni una carrera de siembra.

## Arreglo

`ingresarPorPantalla` en `apps/web/e2e/auxiliares.ts`: ingresa y, **solo si la pantalla dice «Demasiados
intentos»**, reintenta con pausas crecientes hasta que el cupo se libera (tope de espera de 80 s); en
cada intento recarga `/ingresar`, para no leer un aviso viejo como respuesta del intento nuevo. Cualquier
otro rechazo falla de inmediato diciendo lo que la pantalla dijo: no se esconde un defecto real del
ingreso. `09` lo usa y su `beforeAll` sube su tope a 180 s para poder esperar el cupo. Sin `skip`, sin
`sleep`, sin tiempo fijo.

## Verificación

- Local: **no se pudo** correr la suite (no hay Postgres). Sí se corrió el ayudante contra un servidor
  falso con limitador de 2 intentos por 12 s y Chrome real: 3 casos × 3 repeticiones, 9 de 9 en verde
  (espera ~17 s y entra; rechazo ordinario falla en <1 s con el texto; límite que no se libera falla
  diciendo que es el límite). La primera versión **falló** esa simulación (leía el aviso viejo): por eso
  se recarga la pantalla en cada intento.
- CI: la suite real contra la API real queda al CI. Cuatro corridas verdes seguidas sin relanzar serían la
  señal de cierre.

## Cola (no bloquea, R13)

- La causa de fondo es que el cupo de ingresos del job es de 5/min y la suite pide 7. El arreglo limpio
  del servidor del CI (subir el tope solo en ese job, como ya se hace con `LIMITE_TASA_POR_IP`) está en
  `.github/` y `apps/api`, fuera de este carril: lo decide el propietario.
- `08`: la prueba «al quitar el usuario…» espera `toContainText('Error de autenticación')`, que es también
  el título de la alerta de un 429: pasaría en vacío si el limitador cortara. Debería exigir el texto de
  credenciales («Los datos no coinciden»).
- `08` conserva su propio `ingresar`: hoy ocupa 3 de los 5 cupos y no desborda, pero debería usar
  `ingresarPorPantalla`.
