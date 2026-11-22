# 2026-11-22 · Diagnóstico de pantallas, con la navegabilidad como eje (T-618)

Carril `i` (solo `docs/`). Rama `i/T-618-diagnostico-de-pantallas`. **No se tocó `apps/` ni
`packages/`**: el encargo era diagnosticar, no rediseñar.

## Por qué

El propietario, mirando el producto: «¿qué ha cambiado en el diseño? Veo todo igual». Y tenía razón:
lo del día anterior fue deuda interna y accesibilidad. Pidió un diagnóstico antes de tocar nada.
A mitad del trabajo cambió la prioridad: **«importante mejorar mucho la navegabilidad»**, y el
informe se reorganizó alrededor de eso.

## Qué se hizo

- Se levantó la web **compilada** (`next build` + `next start`, nunca `next dev`) en un árbol de
  trabajo propio, en modo demostración, y una segunda vez con `NEXT_PUBLIC_USE_REAL_AUTH=true` para
  la pantalla de ingreso.
- **52 capturas** de 13 rutas a 1440×900 y 390×844, en tema claro y oscuro, más la hoja «Más», la
  paleta de comandos, la ficha de contacto y el archivo de viaje. 30 quedan versionadas en
  `docs/01-producto/capturas-diagnostico/`.
- **Recorridos reales** con Playwright: clics, botón atrás, recarga de una conversación, apertura de
  la paleta con siete términos, e inventario del DOM (enlaces, botones, `aria-current`, migas,
  títulos) en cada pantalla.
- Informe: [`docs/01-producto/07-diagnostico-de-pantallas.md`](../01-producto/07-diagnostico-de-pantallas.md).

## Lo que se encontró (lo verificable, no la opinión)

1. **Dos enlaces rotos que parecen funcionar.** Las 9 tarjetas del pipeline dicen «Abrir conversación
   de WhatsApp con *fulano*» y apuntan a `/bandeja`, no a `/bandeja/<id>`. El icono de chat de cada
   fila de Contactos, igual.
2. **La cadena está enlazada en un solo sentido.** Archivo de viaje y Cotización enlazan hacia atrás
   (conversación, contacto, cotización) y lo hacen muy bien. La conversación, la cotización y la
   ficha **no enlazan hacia delante** al archivo ni al cobro.
3. **Configuración no se alcanza desde la interfaz** en modo demostración: no está en el menú, ni en
   la hoja «Más», y la paleta devuelve 0 resultados para «config» y «equipo».
4. **Contactos no se puede usar en el teléfono.** Tabla de 877 px dentro de un contenedor de 340 px
   con `overflow: hidden`: los 8 enlaces de ficha quedan en `x ≈ 850–886`, fuera de la pantalla y sin
   posibilidad de desplazar. Medido: 0 de 8 alcanzables.
5. **Fallo de tema oscuro en «Hoy»**: `dark:bg-neutral-850` no emite CSS porque `neutral-850` no
   existe en `@theme`; la tarjeta de seguimientos se queda blanca con texto casi blanco (contraste
   medido ≈ 1,1 : 1, sobre una línea que lleva un importe). Hay 3 usos de esa clase inexistente.
6. **El color miente donde cuesta dinero**: «Ventana cerrada» en verde de éxito (`ok-700` sobre
   `ok-50`, medido), el contador de la ventana de 24 h sin umbral (34 min y 11 h 59 min del mismo
   verde), y la barra «Perdida» del informe también verde.
7. **En móvil el aviso de cookies tapa el pie del botón de ingreso** (botón `y 470–514`, aviso desde
   `y 501`) y deja **inalcanzable** el enlace «Ingresar con código de 6 dígitos por correo» — el
   camino de quien no puede entrar.
8. **Tres incumplimientos de ADR-0032** que el propio ADR se escribió para evitar: las migas del
   detalle de bandeja dicen «Bandeja» en vez de `moduloActivo().etiqueta` («Conversaciones»);
   `/seguimientos` tiene unas migas escritas a mano con un nivel «CRM» que no es ninguna pantalla; y
   **ningún detalle sobrescribe su `document.title`** (tres pestañas que dicen «Conversaciones»).
9. **Los seis grupos de la tabla de navegación no se pintan en ninguna parte** salvo como subtítulo
   en la paleta, donde producen «Hoy — Hoy».
10. **Divergencia entre el ADR y el código** que hay que resolver por escrito: ADR-0032 §4 dice que
    la barra móvil lleva «Buscar»; el código lleva la acción «Cotizar» y deja «Buscar» en la lupa de
    la cabecera.

## Lo bueno que conviene no romper

La conversación abierta, el archivo de viaje, Cobros y la paleta de comandos están bien. El patrón
de «fila de enlaces de la cadena» ya está construido y probado: la recomendación principal es
**copiarlo**, no inventar nada.

## Sobre `modern-web-guidance` (R15)

Doce consultas. Sirven de verdad: `responsive-table`, `tabs`, `single-line-overflow`,
`form-factor-adaptation`, `stack-drill-down`, `icons`, `accessibility`, `dark-mode`, `color`,
`calculate-event-differentials`. **No aportan nada a nuestro caso** (y se dice para no arrastrarlas):
`scrollspy`, `spatial-navigation`, `app-menus`, `carousel-snap-highlights`. `breadcrumbs` solo
confirma que `MigasDePan` ya estaba bien. Las tres de transiciones de vista quedan aparcadas: mejoran
la sensación, no el funcionamiento.

## Pendiente

- Abrir las tareas de la tabla priorizada del informe en `roadmap/tasks.yaml` (lo hace el
  coordinador: esta rama no toca la cola).
- Nada de esto se arregló aquí. **Ni una línea de `apps/web`.**
