# 2026-11-21 — T-511: ingreso por usuario a 390 px contra la API real

## Hecho

- Prueba nueva `apps/web/e2e/08-ingreso-por-usuario.e2e-spec.ts`, registrada en el proyecto `flujo` de
  `apps/web/playwright.config.ts`. Todo a 390×844, contra la API real del job `navegador`:
  1. En Configuración › Equipo se fija el usuario del miembro de la sesión; la pantalla lo muestra y sigue ahí tras recargar.
  2. Sin sesión, se entra con ese usuario; y se entra con el correo.
  3. Se quita el usuario desde la pantalla: queda «Sin usuario» y entrar con él muestra «Error de autenticación».
- Sin desplazamiento lateral en lista, diálogo, ingreso; el botón «Usuario» mide ≥ 44 px.
- Sin cifras ni ids fijos: el miembro sale de `GET /api/v1/identidad/miembros`; el usuario es único por corrida
  (el apodo es global hasta T-361) y un `afterAll` lo quita aunque la prueba falle.
- Cada fallo lee el texto de error de la pantalla (diálogo o alerta de ingreso) y lo mete en el mensaje.

## Lo que enseñó el CI

- Corridas 1-3: 3 de las 4 pruebas nuevas verdes contra la API real (fijar usuario, ingresar con usuario, ingresar con correo, todo a 390 px).
- La 4ª falló dos veces por causas de la **prueba**, no del producto: (1) `getByRole('alert')` resolvía a 2 elementos, porque Next añade el anunciador de rutas; (2) la lista de miembros daba **429** «Demasiadas peticiones»: el job sube el tope por IP (5000) pero no el **por agencia (600/min)**, que agotan las pruebas anteriores. La hipótesis de «sesión guardada muerta por otros ingresos» se descartó con el diagnóstico (la URL seguía en `/configuracion`).
- La prueba ahora pulsa «Reintentar» hasta 75 s, como una asesora. El tope del CI queda en cola: T-526 (ruta protegida).

## Sin verificar

No hay Postgres local: la prueba **no se ejecutó aquí**, ni siquiera se compiló (sin dependencias instaladas).
Su verificación es la del job `navegador` del CI. Supuestos por confirmar en esa corrida: que la persona dueña
puede fijarse su propio usuario (el 403 es solo por tener *más* permisos) y que ingresar en otro contexto no
invalida la sesión guardada.
