# Roadmap de diseño: interfaz y experiencia de usuario en celular, tablet y escritorio

| | |
|---|---|
| Fecha | 2026-11-21 |
| Origen | Encargo del propietario a la sesión de diseño: analizar, mejorar y rediseñar toda la interfaz, con **celular, tablet y navegador de escritorio** como dispositivos de uso real |
| Qué es | La hoja de ruta de **diseño**: olas, orden, criterio de salida por ola y una tarea por PR en `roadmap/tasks.yaml` (T-440 a T-471) |
| Fuente del análisis | [`../_auditorias/2026-11-21-auditoria-visual-y-ux.md`](../_auditorias/2026-11-21-auditoria-visual-y-ux.md) (hallazgos B1–B4, A1–A10, M1–M8, D1–D11) |
| Qué manda | `roadmap/tasks.yaml` y `ESTADO.md` mandan sobre este documento. Este fija el **orden** y los **criterios** |
| Se apoya en | [`08-roadmap-jd-tours-reservas-cobros-y-navegacion.md`](08-roadmap-jd-tours-reservas-cobros-y-navegacion.md) (Eje N) y [`09-roadmap-maestro-y-operacion-desatendida.md`](09-roadmap-maestro-y-operacion-desatendida.md) (Ola 0, «Navegación y móvil») |
| Decisiones | Aprobado por el orquestador el 2026-11-21: plan por olas con el layout responsivo y los puntos de quiebre **primero**; **`packages/ui` no ahora** (componentes en `apps/web/src/components/comun`, sin ADR; si algún día hay un segundo consumidor, ADR antes); ola 5 espera marca y logo |

## 1. Las tres familias de dispositivo

El diseño es **uno solo y adaptable**, con tres modos. No es «móvil que se estira» ni «escritorio que se encoge».

| Modo | Ancho | Navegación | Bandeja | Puntero |
|---|---|---|---|---|
| **Celular** (vertical y horizontal; referencia 390) | < 768 px | Cabecera + barra inferior de 5 + hoja «Más» | Una columna (lista → hilo con flecha de volver) | Táctil, objetivos ≥ 44 px |
| **Tablet** (768, 820 vertical; 1024, 1180 horizontal) | 768 – 1279 px | Riel de ≈ 72 px con icono y etiqueta | Lista 300–320 px + hilo; ficha en cajón; una columna si el hilo queda < 440 px | **Táctil por defecto**; compacta solo con `pointer-fine` |
| **Escritorio** (1280, 1440, 1920) | ≥ 1280 px | Menú lateral expandido con etiqueta y contador | Lista 340 + hilo (mensajes ≤ 720 px) + ficha fija | Compacto con ratón; foco de teclado siempre visible |

Reglas ortogonales: **altura ≤ 480 px** (celular horizontal); `pointer-coarse` / `pointer-fine` de Tailwind v4 para el tamaño de objetivo;
zonas seguras (`viewport-fit=cover`, `env(safe-area-inset-*)`); `dvh` en todas las alturas de ventana; puntos de quiebre **los de Tailwind**
(640 · 768 · 1024 · 1280 · 1536), declarados una vez y usados también por el layout `(app)`. El **zoom del 200 %** del navegador de escritorio
debe seguir siendo operable (hoy lo es: reflota a celular).

## 2. Las olas, en orden

El orden manda: el sistema y el layout responsivo primero; después, lo que JD Tours hace con el celular y la tablet; después, escritorio; después, el resto.
Cada tarea es **un PR** (o una pantalla, o un componente), carril `b/`, **sin auto-merge**, con el job `navegador` verde, `pnpm typecheck` y `pnpm lint`,
capturas antes y después en las tres familias, y su entrada en la bitácora o el `DIARIO` (R14).

### Ola 1 — Sistema y layout responsivo (primero)

**Salida:** los tres modos existen y se comportan igual en las 80 combinaciones de tamaño y ruta de la auditoría; los plazos, estados y canal tienen tokens
y componentes únicos; con dedo ningún control < 44 px; ningún texto informativo < 12 px; una prueba impide colores crudos y fechas ISO nuevos; la
documentación del sistema de diseño existe.

| Tarea | Paso |
|---|---|
| T-440 | 1.0a Marco responsivo de tres modos (espera al PR #385) |
| T-441 | 1.0b Utilidades de puntero (44 px con dedo) |
| T-442 | 1.0c Bandeja adaptable |
| T-443 | 1.1 Tokens, escala tipográfica, cifras tabulares, foco |
| T-444 | 1.2 `LineaDeViaje` e `InsigniaDePlazo` |
| T-445 | 1.3 Formateador de fecha y dinero, y prueba de colores crudos |
| T-446 | 1.4 Aviso de cookies compacto y distintivo «Demo» único |
| T-447 | 1.5 Modo para forzar cargando, error y vacío en demostración |
| T-448 | 1.6 Documentación del sistema de diseño |

### Ola 2 — Celular y tablet: núcleo de JD Tours

**Salida:** con el celular o la tablet, una asesora responde, cotiza, envía por WhatsApp y vuelve al chat, mira qué le toca hoy y abre un archivo de viaje,
con la acción principal visible sin desplazarse y la primera pantalla mostrando trabajo (≥ 60 % de la altura) y no controles.

| Tarea | Pantalla |
|---|---|
| T-449 | Conversación |
| T-450 | Bandeja |
| T-451 | Detalle de cotización |
| T-452 | Cotizador (la lógica es de T-321) |
| T-453 | Archivo de viaje |
| T-454 | Hoy |

### Ola 3 — Escritorio

**Salida:** a 1280, 1440 y 1920 el espacio se aprovecha sin tarjetas vacías ni líneas de 1.100 px; el menú lateral tiene etiquetas; una sola «Cotizar» por estado.

T-455 (menú lateral) · T-456 (Hoy) · T-457 (conversación) · T-458 (archivos de viaje, con T-334) · T-459 (cotizador y cotización).

### Ola 4 — El resto

**Salida:** ninguna pantalla conserva tarjetas de una cifra, tablas con desplazamiento interno en celular, miga «CRM», fechas ISO ni mayúsculas de título.

T-460 (Oportunidades) · T-461 (Contactos) · T-462 (ficha) · T-463 (Catálogo) · T-464 (Seguimientos) · T-465 (Reportes) · T-466 (Configuración) · T-467 (ingreso, 404, error y legales, tras #362 y #385) · T-468 (pasada de texto).

### Ola 5 — Propuesta al viajero (aparte)

T-469. Bloqueada hasta que el propietario fije **nombre comercial, marca y logo**. Es donde cabe la libertad estética (imagen, tipografía con carácter).

### Cola de verificación (no bloquea)

T-470 (foco de teclado recorrido a mano) · T-471 (iPhone, iPad, Firefox y Edge a mano: lo que hoy está «sin verificar»).

## 3. Criterio de salida de JD Tours, ampliado (propuesta para `08-roadmap-jd-tours…` §1 y §3)

La redacción completa está en §4.4 de la auditoría. En esencia: el principio 7 pasa de «el asesor trabaja desde el celular» a **celular, tablet o navegador**, con dedo y con
ratón y teclado; el punto 1 dice «dos toques en celular y tablet»; y el punto 9 exige la jornada completa (cotizar, etiquetar, registrar un pago, ver el saldo)
**en cada una de las tres familias**, sin desplazamiento lateral, con zoom del 200 % operable y con lo no probado en dispositivos reales anotado como «sin verificar».

## 4. Coordinación

- **Con la sesión del roadmap** (`apps/web` funcional): ella hace la lógica y los datos; la sesión de diseño, la presentación, en PR separados. T-321 y T-334 son suyos; T-452 y T-458 dependen de ellos. Sus cambios de estructura visual pasan por la sesión de diseño.
- **Anticolisión:** antes de editar un archivo, `git fetch` y `gh api repos/system-technology/CRM/pulls?state=open`. Hoy #385 toca `barra-modulos.tsx` (T-440 espera) y #362 el ingreso (T-467 espera).
- **Integración:** un PR de código a la vez, sin auto-merge; la sesión de diseño pide la ventana de integración al orquestador con el SHA y 14/14.

## 5. Lo que no se hace

No cambia comportamiento, contratos, API, migraciones ni lógica de negocio; no se añaden dependencias; no se crea `packages/ui`; no cambian las URL; no se versionan capturas; sin fotos ni degradados en la herramienta de trabajo.
