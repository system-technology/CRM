# Sistema de diseño de ViajaPro (web)

> Documento vivo del rediseño ([hoja de ruta](../08-roadmap/10-roadmap-diseno-ui-ux.md), tarea T-448). Se actualiza **en el mismo PR** que cambia un token, un componente o un punto de quiebre (R14). Lo que no está aquí no es parte del sistema. Los tokens de §1 y las utilidades de §2 llegan con el PR #391 (T-443 y T-441). Fuente de los tokens: `apps/web/src/app/globals.css`; la skill `diseno-web` manda sobre el estilo.

## 1. Tokens de estado, plazo y canal (T-443)

Cada estado son dos tokens, `fondo` y `texto`, con contraste ≥ 4,5:1 (AA) en claro y en oscuro; lo vigila la prueba `tokens-de-estado` (llega con el PR #391). Se usan **siempre con texto e icono**, nunca solo color.

| Token (`--color-…`) | Cuándo | Texto de ejemplo |
|---|---|---|
| `plazo-vencido-*` | Lo que ya pasó (rojo) | «Vencido hace 2 d» |
| `plazo-hoy-*` | Vence hoy (rojo, fondo más marcado) | «Vence hoy» |
| `plazo-proximo-*` | Vence en los próximos días (ámbar) | «Vence mañana», «En 3 d» |
| `plazo-ok-*` | En plazo (verde, con texto; nunca para «cerrado» ni «perdido») | «En plazo» |
| `canal-whatsapp-*` | **Solo** WhatsApp: enviar, ventana abierta. Nunca «pagado», «ok» ni «ventana cerrada» | «Enviar por WhatsApp» |
| `demo-*` | El único distintivo de datos de demostración | «Demo» |

Reglas: rojo es solo para lo vencido o lo que vence hoy; ámbar para lo próximo; un solo color de acción (`acento-600`); verde solo para WhatsApp y para «en plazo/confirmado» con texto. Estos tokens **sustituyen** el uso directo de `emerald`, `amber`, `rose` y `red` de Tailwind (migración por pantalla en las olas 2 a 4; una prueba de T-445 impedirá usos nuevos).

## 2. Utilidades

| Utilidad | Qué hace | Cuándo |
|---|---|---|
| `objetivo` | Con dedo (`pointer: coarse`) el control mide ≥ 44 px; con ratón conserva su densidad | En cada control interactivo; se aplica al control, no al contenedor (T-441) |
| `texto-micro` | 11 px, interlineado 1,25 | **Solo** el contador de una insignia; el texto informativo parte de 12 px (`text-sm`) |
| `cifra` | Cifras tabulares (`tabular-nums`) | Importes, totales, contadores y plazos |
| Foco | Un solo anillo (`*:focus-visible`, `acento-600`, 2 px) | Todo; ningún control lo quita sin ponerse uno propio |

## 3. Escala tipográfica y puntos de quiebre

- Familia: **Inter** (`--font-sans`). Escala: `text-xs` 11 · `text-sm` 12 · `text-base` 13 · `text-lg` 15 · `text-xl` 18 · `text-2xl` 22 · `text-3xl` 28 px. **Piso de 12 px** para texto informativo: `text-xs` y `text-[9|10|11px]` se reemplazan por `text-sm` pantalla a pantalla (la auditoría contó 442 usos de 9 a 11 px y 1.018 de `text-xs`); no se cambió el valor de `text-xs` de golpe para no mover todas las pantallas a la vez.
- Puntos de quiebre: los de Tailwind v4 (640 · 768 · 1024 · 1280 · 1536). Tres modos (T-440, ADR-0032):

| Modo | Ancho | Navegación | Detalle |
|---|---|---|---|
| Celular | < 768 px | Cabecera de 44 px con la lupa + barra inferior de 56 px + hoja «Más» | La barra y el `main` reservan `env(safe-area-inset-bottom)`; `viewport-fit=cover` |
| Tablet | 768 – 1279 px | **Riel de 96 px con icono y etiqueta** (la etiqueta corta de `lib/navegacion.ts`) | Táctil por defecto; el riel desplaza si falta altura (celular horizontal) |
| Escritorio | ≥ 1280 px | **Menú lateral expandido de 240 px** por defecto | Con ratón (`pointer: fine`) y la preferencia «contraer» queda solo el icono (56 px) con tooltip. La preferencia guardada en `viajapro_sidebar_expandida` manda sobre el ancho |

  Reglas ortogonales: `objetivo` y `pointer-coarse` para el tamaño táctil; alto de ventana con `dvh`; `interactive-widget=resizes-content` para que el teclado en pantalla reduzca la ventana. Quedan para después: regla de altura ≤ 480 px en la bandeja y columna de mensajes ≤ 720 px (T-442).

## 4. Pendiente de documentar

Componentes de `apps/web/src/components/comun/` (`LineaDeViaje` e `InsigniaDePlazo` nacen en T-444), formateadores de fecha y dinero (T-445), bandeja adaptable (T-442).
