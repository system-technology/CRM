# 2026-11-21 · Manual de usuario con capturas (T-562)

## Qué se hizo
- Se escribió el [manual](../06-manual/README.md): recorrido del asesor, recorrido del dueño, [lo que no cubre](../06-manual/03-lo-que-no-cubre.md) y [cómo regenerar las capturas](../06-manual/regenerar-capturas.md).
- Alcance sacado de la sección «Es real (en `main`)» de `ESTADO.md`. Lo que es maqueta (SLA, plantillas, campos personalizados, respuestas rápidas, asistente de inicio) quedó fuera y lo dice la página de límites.
- 15 capturas a `deviceScaleFactor: 2`, generadas por `docs/06-manual/capturas.mjs` contra la web compilada. Todas en modo demostración; ninguna contra la API real.

## Qué apareció al recorrerlo
1. **T-563 (P1):** la web no tiene forma de marcar una cotización como aceptada; solo la API (las e2e usan `page.request.post`). Sin eso no se abre el archivo de viaje desde la pantalla.
2. **T-564 (P2):** el dueño tiene `cobro.corregir` pero ninguna pantalla para devolver, ajustar o reversar un pago.
3. `docs/01-producto/04-flujos-criticos.md` paso 7 decía «Existe»; se corrigió.
4. El formulario de ingreso muestra «Conectado a la API y PostgreSQL en vivo» por una bandera de configuración, sin comprobar la conexión. Sin tarea: el manual lo avisa.
5. En demostración las cifras de «Reportes» no son coherentes entre filtros (ventas de 5 cotizaciones con el filtro «Míos» de 2): **T-567**.
6. El cartel verde del ingreso afirma una conexión que no comprueba y nombra PostgreSQL: **T-565**.
7. La demostración solo enseña la vista del dueño: **T-566**. Los campos personalizados no tendrán cifrado cuando se implementen si nadie lo decide: **T-568**.

## Pendiente
- ~~Volver a tomar las capturas cuando entre T-561 (contrastes)~~ — hecho tras integrarse T-561 y T-560 (conmutador de tema): las 15 se regeneraron con `node docs/06-manual/capturas.mjs` (el ingreso con `--ingreso` y la compilación de autenticación).
- Comprobado: el conmutador de tema (claro, oscuro, sistema) aparece en el pie de `/ingresar`; dentro de la aplicación está en el icono junto a la campana. El manual lo documenta en el paso 1.
- T-563 y T-564: al cerrarlas, quitar las advertencias del manual.
- Probar el manual contra una agencia con API real cuando exista despliegue.
