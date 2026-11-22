# Plan de navegabilidad y experiencia — 2026-11-22

> Lo pidió el propietario: **«Importante mejorar mucho la navegabilidad»**, y después **«crea un plan
> de trabajo para que revises todo lo que encontró el informe de navegabilidad»**.
>
> Origen: el diagnóstico **T-618**, en
> [`docs/01-producto/07-diagnostico-de-pantallas.md`](../01-producto/07-diagnostico-de-pantallas.md).
> No es una opinión: son **52 capturas de 13 rutas**, a 1440 y 390 px, en claro y oscuro, con clics
> reales sobre la aplicación compilada.

## Por qué existe este plan

El propietario dijo, mirando el producto: **«¿Qué ha cambiado en el diseño? Veo todo igual.»** Tenía
razón — lo anterior había sido deuda interna y accesibilidad, no rediseño. Pidió un diagnóstico antes
de tocar nada, y esto convierte ese diagnóstico en trabajo con dueño y orden.

**Regla de este plan:** ninguna fila se da por hecha sin medirla como se midió el problema. El
diagnóstico cuantificó toques, contrastes y píxeles; las correcciones se verifican igual.

## El orden, y por qué

| # | Tarea | Qué arregla | Esf. | Estado |
|---|---|---|---|---|
| 1·2·4 | **T-623** | Enlaces rotos, cadena hacia delante, Configuración, colores que mienten | S | **en revisión** |
| 3 | **T-626** | Contactos en el teléfono: hoy **0 de 8 enlaces alcanzables** | M | lista |
| 5 | **T-627** | Modo oscuro de «Hoy»: **contraste 1,1:1 sobre un importe** | S | lista |
| 6 | **T-628** | El aviso de cookies **tapa el ingreso** en móvil | S | lista |
| 7 | **T-629** | Pasada de lenguaje: que las once pantallas hablen igual | M | lista |
| 8 | T-630 | Murallas de cabecera en móvil | M | cola |
| 9 | T-631 | Pestañas que no caben | M | cola |
| 10 | T-632 | Botones de solo icono sin nombre | S | cola |
| 11 | T-633 | Títulos de documento y migas (ADR-0032) | S | cola |
| — | T-634 | La paleta no encuentra la mitad de lo que hay | S | cola |
| — | T-638 | El ADR-0032 y el código **se contradicen** en la barra móvil | S | lista |
| 12 | T-635 | Reportes con menos texto; acciones en Cobros | M | cola · **producto** |
| 13 | **T-636** | **Cotizador: neto, markup, margen, ítems y enviar** | L | cola · **producto** |
| 14 | T-637 | Datos de demostración que no mienten | S | cola · producto |

## Las tres decisiones que lleva dentro

**1. Las filas 1, 2 y 4 van juntas, en un solo lote.** Lo recomienda el diagnóstico y la razón es
buena: casi no hay que diseñar nada. El patrón de la fila de enlaces **ya está construido y probado**
en Archivo de viaje y en Cotización; se lleva a tres pantallas más y se corrigen dos `href`. Es la
respuesta literal a «mejorar mucho la navegabilidad».

**2. La pasada de lenguaje (fila 7) va antes que lo demás de diseño.** Hoy la misma pantalla se llama
«Conversaciones» en el menú y «Bandeja» en las migas; la misma lista es «Contactos», «Directorio
comercial» y «Directorio de Contactos». El diagnóstico lo dice sin rodeos: **es lo que alguien percibe
como «cambió el diseño»**, y cuesta poco.

**3. El Cotizador NO se toca todavía.** Es la fila de mayor impacto del informe y aun así se aparca,
porque **lo que le falta no es diseño: es producto** —neto, markup, margen, ítems y envío—. Decidir
su alcance es del `dueno-de-producto`. Rediseñar la pantalla antes de esa decisión sería dibujar dos
veces.

## Lo que se aparca a propósito

Transiciones de vista, carrusel del Kanban, navegación espacial y barra de menús. **Mejoran la
sensación, no el funcionamiento.** Vuelven cuando lo anterior esté cerrado.

## Lo que este plan NO cubre, y hay que recordar

El diagnóstico se midió **en local**, con la demostración. Queda sin verificar: el comportamiento con
**datos reales** (500 conversaciones, nombres largos), la bandeja **contra la API y WhatsApp vivos**
—los estados de envío no son observables porque la demo no tiene ni un mensaje saliente—, los
**lectores de pantalla** (se comprobó la semántica del DOM, no el resultado audible), el arrastre del
Kanban, las pantallas de impresión y **cualquier cosa desplegada en staging**.
