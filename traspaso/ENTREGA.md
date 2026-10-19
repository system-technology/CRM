# Entrega — Inventario de Pantallas y Puesta al Día con Main (0c.18) — 2026-10-19

## Qué construí

1. **Puesta al día con `origin/main` (0 commits por detrás):** Fusión limpia de `origin/main` (v0.23.0 y CI en verde) en `feat/bandeja-web`, resolviendo el lockfile y generando el cliente de Prisma actualizado.
2. **Corrección de script de pruebas en `apps/web`:** Se normalizó `"test": "vitest run"` en `apps/web/package.json` eliminando la ruta virtual frágil de pnpm.
3. **Optimización móvil de `/catalogo` a 375 px (0c.18 §4):** Se retiró el recuadro informativo redundante en `tarjeta-salida-publicada.tsx`, manteniendo la insignia «Promo grupal» y el subtítulo destacado «por persona · en promo grupal» para evitar saturar la tarjeta en pantallas estrechas.
4. **Inventario exhaustivo por pantallas:** Desglose completo de las 8 rutas de `apps/web/src/app/` para permitir al `integrador` incorporar el trabajo en ramas o partes manejables.

---

## Qué verifiqué EJECUTANDO

### 1. Compuertas del monorepo (`pnpm compuertas`)
Ejecutadas las 5 compuertas completas sobre el árbol fusionado en `D:\Projects\CRM-bandeja`:
- `build`: **5/5 paquetes en verde** (21.4s)
- `lint`: **7/7 paquetes en verde** (6.7s)
- `typecheck`: **9/9 paquetes en verde** (2.4s)
- `test`: **23/23 archivos de prueba, 279 pruebas en verde en la API; 16/16 archivos y 125/125 pruebas en verde en la Web; 4/4 y 70 pruebas en Domain; 4/4 y 60 pruebas en Contracts** (178.2s)
- `format:check`: **limpio** (3.7s)

`HEAD..origin/main` verificado con `git log`: **vacío** (0 commits por detrás).

---

## Qué NO verifiqué

- No se levantó navegador Playwright automatizado para interactuar con la tarjeta de Consotá a 375 px en vivo (se comprobó inspeccionando el markup y CSS responsivo Tailwind).
- No se probaron mutaciones en vivo de cotizaciones contra la API real levantada (la tarea 0c.22 cubrirá el consumo de `POST /api/v1/cotizaciones`).

---

## Decisiones que el encargo no especificaba

- **Retiro del recuadro comercial de tarifa grupal:** En `tarjeta-salida-publicada.tsx`, tener insignia en cabecera, subtítulo en el precio y un tercer recuadro inferior ocupaba demasiado espacio vertical en 375 px y contenía además un glifo mal codificado. Se conservaron la insignia y el subtítulo exacto según el criterio 4 de la tarea 0c.18.
- **Normalización de `package.json` de la web:** El comando de test de `apps/web` apuntaba a una ruta rígida dentro de `.pnpm` que fallaba tras el merge. Se sustituyó por `vitest run` estándar idéntico al resto de paquetes del monorepo.

---

## Inventario por Pantallas para Integración por Partes

A continuación se detalla cada una de las 8 rutas de `apps/web/src/app/` con sus dependencias, archivos, pruebas asociadas y viabilidad de integración independiente:

### 1. `/bandeja` — Bandeja de Conversaciones (Inbox WhatsApp)
- **Tarea origen:** Tarea 5 (`feat/bandeja-web`), 0b (Diseño de 3 columnas), 0c.2 (Cotizaciones en el hilo), 0d (Ficha del viajero vinculada).
- **Archivos de página y layout:**
  - `apps/web/src/app/bandeja/layout.tsx`: Armazón de tres columnas, barra de módulos, lista fija y panel central.
  - `apps/web/src/app/bandeja/page.tsx`: Estado vacío de la bandeja («Selecciona una conversación»).
  - `apps/web/src/app/bandeja/[id]/page.tsx`: Hilo de chat, cabecera de conversación con SLA/ventana 24h, mensajes entrantes/salientes, renderizado de cotizaciones en el hilo y panel lateral.
- **Componentes:**
  - `apps/web/src/components/bandeja/lista-conversaciones.tsx`
  - `apps/web/src/components/bandeja/ficha-cliente.tsx`
  - `apps/web/src/components/bandeja/modal-plantillas.tsx`
  - `apps/web/src/components/bandeja/tarjeta-cotizacion.tsx`
  - `apps/web/src/components/bandeja/panel-copilot-ia.tsx`
  - `apps/web/src/components/bandeja/barra-modulos.tsx`
- **Lógica y pruebas unitarias:**
  - `apps/web/src/lib/bandeja-logica.ts` / `bandeja-comportamiento.spec.ts` (7 pruebas)
  - `apps/web/src/lib/plantillas-logica.ts` / `plantillas-logica.spec.ts` (6 pruebas)
  - `apps/web/src/lib/realtime-mock.ts` / `realtime-mock.spec.ts` (2 pruebas)
  - `apps/web/src/lib/asistente-ia-logica.ts` / `asistente-ia-logica.spec.ts` (6 pruebas)
- **¿Se puede integrar sola?:** Sí. Es el núcleo original de la bandeja; depende solo de los contratos Zod de `inbox.ts` y componentes base.

### 2. `/catalogo` — Catálogo de Salidas Publicadas y Paquetes
- **Tarea origen:** 0c.16 (Catálogo real de salidas, ADR-0009), 0c.17 (Condición comercial de tarifa grupal).
- **Archivos de página:**
  - `apps/web/src/app/catalogo/page.tsx`: Listado de salidas, filtros por destino y texto, conexión con `catalogo-api.ts`.
- **Componentes:**
  - `apps/web/src/components/catalogo/tarjeta-salida-publicada.tsx`: Tarjeta optimizada para móvil (375 px) con badge, subtítulo y enlace a cotizador.
  - `apps/web/src/components/catalogo/ficha-detalle-paquete.tsx`: Ficha expandible de paquete.
- **Lógica y pruebas unitarias:**
  - `apps/web/src/lib/catalogo-logica.ts` / `catalogo-logica.spec.ts` (14 pruebas)
  - `apps/web/src/lib/catalogo-api.ts`
- **¿Se puede integrar sola?:** Sí. Consume `GET /api/v1/catalogo/salidas` o mock según `NEXT_PUBLIC_USE_REAL_CRM`.

### 3. `/cotizador` — Cotizador de Salidas Armadas
- **Tarea origen:** 0c.16 (Cotizador con desglose por pasajero, R8, y propuestas WhatsApp).
- **Archivos de página:**
  - `apps/web/src/app/cotizador/page.tsx`: Selector de salida/paquete, adultos, niños, infantes, total protagonista y botón de copiar propuesta.
- **Componentes:**
  - `apps/web/src/components/cotizador/desglose-cotizacion-salida.tsx`: Desglose línea por línea, tarifas alternativas y no aplicables con motivo.
- **Lógica y pruebas unitarias:**
  - `apps/web/src/lib/cotizador-logica.ts` / `cotizador-logica.spec.ts` (10 pruebas)
- **¿Se puede integrar sola?:** Sí, junto con `/catalogo` o de forma independiente con contratos de `catalogo.ts`.

### 4. `/pipeline` — Tablero Kanban de Oportunidades CRM
- **Tarea origen:** 0c.3 (Tablero Kanban de 5 etapas, contratos CRM y accesibilidad).
- **Archivos de página:**
  - `apps/web/src/app/pipeline/page.tsx`: Vista Kanban y vista tabla compacta, filtros por asesor y búsqueda.
- **Componentes:**
  - `apps/web/src/components/pipeline/columna-kanban.tsx`: Columna con total servidor en `.cifra`.
  - `apps/web/src/components/pipeline/tarjeta-oportunidad.tsx`: Tarjeta con accesibilidad por teclado («Mover a...»).
  - `apps/web/src/components/pipeline/modal-motivo-perdida.tsx`: Modal obligatorio al mover a `PERDIDA` con validación Zod de motivo y nota.
- **Lógica y pruebas unitarias:**
  - `apps/web/src/lib/pipeline-logica.ts` / `pipeline-logica.spec.ts` (15 pruebas)
- **¿Se puede integrar sola?:** Sí. Depende de contratos de `crm.ts` (`TableroPipeline`, `Oportunidad`).

### 5. `/contactos` — Directorio de Contactos y Ficha CRM
- **Tarea origen:** 0c.1 (Directorio y ficha unificada de contactos, Epic VC-3).
- **Archivos de página:**
  - `apps/web/src/app/contactos/page.tsx`: Tabla y rejilla de contactos con búsqueda reactiva.
- **Componentes:**
  - `apps/web/src/components/contactos/ficha-detalle-contacto.tsx`: Panel lateral deslizable con datos, historial y oportunidades.
- **Lógica y pruebas unitarias:**
  - `apps/web/src/lib/contactos-logica.ts` / `contactos-logica.spec.ts` (6 pruebas)
  - `apps/web/src/lib/crm-api.ts` / `crm-api.spec.ts` (7 pruebas)
- **¿Se puede integrar sola?:** Sí. Consume `GET /api/v1/crm/contactos` y `GET /api/v1/crm/contactos/:id/ficha`.

### 6. `/configuracion` — Configuración de Agencia y Política de Precios
- **Tarea origen:** 0c.8 (Configuración de canales, política de precio paramétrica ADR-0006/0009).
- **Archivos de página:**
  - `apps/web/src/app/configuracion/page.tsx`: Pestañas de Canales WhatsApp, Política de Precios y Equipo.
- **Componentes:**
  - `apps/web/src/components/configuracion/bloque-politica-precio.tsx`: Formulario de margen (porcentaje, base sobre neto/venta, redondeo).
- **Lógica y pruebas unitarias:**
  - `apps/web/src/lib/configuracion-logica.ts` / `configuracion-logica.spec.ts` (13 pruebas)
  - `apps/web/src/lib/politica-precio-logica.ts` / `politica-precio-logica.spec.ts` (5 pruebas)
- **¿Se puede integrar sola?:** Sí.

### 7. `/viajes` — Expedientes de Viaje en Operación (TravelFiles)
- **Tarea origen:** 0c.7 (Seguimiento operativo de salidas confirmadas).
- **Archivos de página:**
  - `apps/web/src/app/viajes/page.tsx`: Tarjetas de expedientes, estados de reserva y control de pasajeros.
- **Lógica y pruebas unitarias:**
  - `apps/web/src/lib/viajes-logica.ts` / `viajes-logica.spec.ts` (13 pruebas)
- **¿Se puede integrar sola?:** Sí.

### 8. `/reportes` — Métricas y Conversión
- **Tarea origen:** 0c.6 (Panel analítico de métricas operativas y comerciales).
- **Archivos de página:**
  - `apps/web/src/app/reportes/page.tsx`: Métricas de conversión, volumen de ventas y SLA.
- **Lógica y pruebas unitarias:**
  - `apps/web/src/lib/reportes-logica.ts` / `reportes-logica.spec.ts` (5 pruebas)
- **¿Se puede integrar sola?:** Sí.

---

### Módulos Transversales y Accesibilidad
- `apps/web/src/components/busqueda/modal-busqueda-global.tsx` (`buscador-global-logica.spec.ts`: 8 pruebas).
- `apps/web/src/components/notificaciones/panel-notificaciones.tsx` (`notificaciones-logica.spec.ts`: 4 pruebas).
- `apps/web/src/lib/accesibilidad-logica.ts` (`accesibilidad-logica.spec.ts`: 4 pruebas).
- `apps/web/src/components/crm/aviso-configuracion-tenant.tsx`: Aviso claro cuando falta `NEXT_PUBLIC_DEV_TENANT_ID`.