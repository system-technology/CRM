# 2026-11-21 — Diseño, Ola 1: tokens de estado y utilidades de puntero (T-443 y parte de T-441)

**Qué se hizo.** En `apps/web/src/app/globals.css`: tokens `plazo-vencido`, `plazo-hoy`, `plazo-proximo`, `plazo-ok`, `canal-whatsapp` y `demo` (fondo y texto, en claro y en oscuro); el token `--text-micro` y las utilidades `objetivo` (44 px con dedo) y `texto-micro`. Una prueba nueva, `tokens-de-estado.spec.ts`, vigila el contraste AA de cada par y la existencia de las utilidades. Nace `docs/01-producto/13-sistema-de-diseno.md` (T-448).

**Decisión que se aparta de lo escrito antes.** El informe de la auditoría proponía `plazo-hoy` en ámbar. Se alineó con la regla de la skill `diseno-web` (que manda): **rojo para lo vencido y lo que vence hoy, ámbar para lo próximo**. El informe del PR #389 queda con la redacción anterior hasta que se corrija en T-448.

**Qué no se hizo, a propósito.** No se cambió el valor de `text-xs` (11 px, 1.018 usos): subirlo de golpe movería todas las pantallas a la vez. El piso de 12 px se aplica pantalla a pantalla en las olas 2 a 4 y lo comprobará una prueba (T-445). Tampoco se aplicó `objetivo` a ningún control todavía: la aplicación por pantalla es el resto de T-441. Las dos utilidades y los tokens aún no tienen consumidor, así que **este PR no cambia ninguna pantalla**.

**Verificado en este turno.** `vitest` (tokens y paleta de etiquetas: 33 pruebas), `pnpm typecheck`, `pnpm lint` y `next build` en verde; el CSS compilado contiene `.objetivo` dentro de `@media (pointer:coarse)` y `.texto-micro`. **Sin verificar:** el job `navegador` del CI (aún no hay PR de código abierto).

## Adenda: T-440, marco responsivo de tres modos (rama `b/T-440-marco-responsivo`, sin PR todavía)

**Qué se hizo.** El marco distingue celular (< 768 px, barra inferior), tablet (768–1279 px, riel de 96 px con icono y etiqueta corta) y escritorio (≥ 1280 px, menú lateral expandido de 240 px por defecto cuando no hay preferencia guardada). El riel desplaza cuando falta altura. Zonas seguras: `viewport-fit=cover` y `env(safe-area-inset-*)` en la barra inferior y en el relleno del `main`; `interactive-widget=resizes-content`; `min-h-dvh` en el layout raíz. Los enlaces del menú expandido llevan la utilidad `objetivo`. Tres pruebas nuevas en `barra-modulos.spec.tsx`.

**Qué no se hizo, a propósito.** La regla de altura ≤ 480 px para la bandeja y la columna de mensajes de 720 px son de T-442. El `dvh` de las páginas públicas del ingreso espera a que entre #362 (T-467). El anillo dorado del ítem activo del riel sigue (T-455).

**Verificado.** 574 pruebas de componentes, `pnpm typecheck` y `pnpm lint` en verde en local; sin desbordes horizontales en 10 tamaños de ventana sobre Chromium. **Sin verificar:** el job `navegador` del CI y Safari iOS, Firefox y Edge.
