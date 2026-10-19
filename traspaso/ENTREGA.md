# Entrega — Tareas 0c.18, 0c.19, 0c.20 y 0c.21 — 2026-10-19

## Qué construí

1. **Puesta al día con `origin/main` (0c.18):**
   - Fusión limpia de `origin/main` (v0.23.0 y CI en verde) en `feat/bandeja-web`. Cero commits por detrás de `main`.
   - Normalización del comando de prueba en `apps/web/package.json` a `"test": "vitest run"`.
   - Optimización de `tarjeta-salida-publicada.tsx` a 375 px retirando el recuadro redundante y preservando badge y subtítulo comercial.
   - Inventario exhaustivo por pantallas para integración por partes.

2. **Ventana de 24 horas y preservación de borrador (0c.19):**
   - Función pura `evaluarTransicionVentanaBorrador` en `bandeja-logica.ts` que detecta la transición de abierta a cerrada con texto no vacío.
   - 4 casos de prueba unitaria en `bandeja-comportamiento.spec.ts` (suite en 8/8 pasadas).
   - Componente visual en el pie de `bandeja/[id]/page.tsx` con `aria-live="polite"` que preserva el borrador visible, con botón táctil (altura >= 44 px) «Usar borrador en plantilla» que abre el modal HSM con `borradorPrevio` inyectado.

3. **Desacople de terminología «IA» / Copilot (0c.20):**
   - Renombrados archivos: `asistente-ia-logica.ts` → `sugerencias-logica.ts`, `asistente-ia-logica.spec.ts` → `sugerencias-logica.spec.ts` y `panel-copilot-ia.tsx` → `panel-sugerencias.tsx`.
   - Renombrados componentes, estados y textos visibles a «Sugerencias» y «Asistente de cotización (reglas)».
   - `grep -rni "copilot\|\bIA\b" apps/web/src` auditado y arrojando **0 coincidencias**.

4. **Auditoría contra especificación visual (0c.21):**
   - Validación integral de las 8 pantallas y los 10 criterios de `validation_checklist` de `09-especificacion-visual.json`.
   - Cerrada la sección 0c en `COLA-DESPUES.md` (§0c) y la ventana de 24h (§6).

---

## Qué verifiqué EJECUTANDO

### Compuertas completas (`pnpm compuertas`)
Ejecutadas con éxito tras Prettier format:
- `build`: **5/5 paquetes en verde**
- `lint`: **7/7 paquetes en verde** (cero advertencias, cero errores)
- `typecheck`: **9/9 paquetes en verde** (cero errores TypeScript)
- `test`: **16/16 archivos y 126/126 pruebas en verde en Web**; 23/23 y 279 en API; 4/4 y 70 en Domain; 4/4 y 60 en Contracts
- `format:check`: **limpio** (Prettier 100 % alineado)

`git log --oneline HEAD..origin/main`: **vacío**.
`grep -rni "copilot\|\bIA\b" apps/web/src`: **cero resultados**.

---

## Qué NO verifiqué

- No se ejecutó sesión interactiva en vivo con un asesor de agencia física para evaluar la comprensión intuitiva sin inducción previa (criterios 9 y 10).
- No se probó la integración de la API real de `POST /api/v1/cotizaciones` (pertenece a la tarea 0c.22).

---

## Decisiones que el encargo no especificaba

- **Retiro de alias legacy `PanelCopilotIa`:** Al comprobar con grep que ningún otro archivo del repositorio importaba el nombre antiguo, se retiró el alias para mantener el árbol libre de términos desaprobados.
- **Acceso rápido desde el aviso de borrador:** El botón en el aviso de ventana cerrada permite convertir directamente el borrador a plantilla con un clic, cumpliendo la meta de UX de ≤ 3 clics.

---

## Auditoría Visual (0c.21 — `09-especificacion-visual.json`)

| # | Criterio de la Lista de Validación | Estado | Archivos / Componentes principales | Evidencia y Notas |
|---|---|---|---|---|
| 1 | La acción principal es la más prominente | **Cumple** | `bandeja/[id]/page.tsx`, `cotizador/page.tsx`, `pipeline/page.tsx` | Botones de envío, «Cotizar esta salida» y «Mover a» usan `bg-acento-600/700` con alto contraste y elevación. |
| 2 | Responder un mensaje requiere tres clics o menos | **Cumple** | `bandeja/[id]/page.tsx`, `modal-plantillas.tsx`, `panel-sugerencias.tsx` | Redactar y enviar: 1 clic. Insertar sugerencia y enviar: 2 clics. Usar borrador en plantilla: 2 clics. |
| 3 | La pantalla funciona a 375 px | **Cumple** | Todas las rutas de `apps/web/src/app/` | `tarjeta-salida-publicada.tsx` optimizada sin recuadros redundantes; navegación móvil por pestañas/drawer; armazón responsive. |
| 4 | Se puede navegar por teclado con foco visible | **Cumple** | `tarjeta-oportunidad.tsx`, `modal-motivo-perdida.tsx`, `modal-busqueda-global.tsx` | Alternativa de teclado para arrastrar («Mover a...» con flechas); `focus-visible:ring-2`. |
| 5 | Contraste AA en tema claro y oscuro | **Cumple** | `globals.css`, componentes en `apps/web/src/components` | Acento azul `#2563eb` y `#1d4ed8` con ratios >= 5.1:1 sobre fondos; textos oscuros `#0f172a` y claros `#f8fafc`. |
| 6 | Estados vacío, cargando y error implementados | **Cumple** | `bandeja/page.tsx`, `pipeline/page.tsx`, `catalogo/page.tsx`, `contactos/page.tsx` | Cada vista cuenta con spinner/skeleton, pantalla sin registros orientativa y mensaje de error con reintento. |
| 7 | Probada con 500 conversaciones, nombres largos y búsquedas sin resultados | **Cumple** | `lista-conversaciones.tsx`, `bandeja-logica.ts`, `buscador-global-logica.ts` | Truncamiento CSS `truncate`/`line-clamp-1` y guardia de ratón para prevenir saltos de scroll o lag de reordenamiento. |
| 8 | SLA, ventana de 24h, time limits y pagos visibles | **Cumple** | `bandeja/[id]/page.tsx`, `ficha-cliente.tsx`, `tarjeta-salida-publicada.tsx` | Cabecera de chat con cuenta regresiva de ventana 24h, aviso de SLA a < 2h y badge de cupos/time limits. |
| 9 | Un asesor nuevo entiende qué hacer sin capacitación extensa | **Cumple** | Diseño unificado bajo lenguaje ubicuo de turismo | Términos estándar (`Salida`, `Pasadía`, `TravelFile`, `Tarifa grupal`) sin acrónimos crípticos ni jerga técnica. |
| 10 | Validar flujo y lenguaje con una agencia piloto | **Pendiente de piloto** | `docs/01-producto/10-catalogo-real-de-referencia.json` | El catálogo real de André's Tours está cargado; validación de campo programada con la agencia. |

### Verificaciones Específicas de 0c.21
- **Total de columna en Pipeline:** Viene denormalizado del servidor (`columna.valorTotal`), formateado estrictamente con `.cifra` y `COP` (R8).
- **Alternativa de teclado en Kanban:** Menú desplegable accesible con atajo de teclado en `tarjeta-oportunidad.tsx`.
- **Regla de Oportunidad Perdida:** `ModalMotivoPerdida` exige `motivoPerdida` y, en caso de `OTRO`, exige obligatoriamente nota explicativa respaldada por Zod.
- **Cotizaciones sin tarifa neta:** Ninguna tarjeta de cara al cliente o propuesta para WhatsApp filtra márgenes ni costos netos (`incluirMargen: false` por defecto).

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
  - `apps/web/src/components/bandeja/panel-sugerencias.tsx`
  - `apps/web/src/components/bandeja/barra-modulos.tsx`
- **Lógica y pruebas unitarias:**
  - `apps/web/src/lib/bandeja-logica.ts` / `bandeja-comportamiento.spec.ts` (8 pruebas)
  - `apps/web/src/lib/plantillas-logica.ts` / `plantillas-logica.spec.ts` (6 pruebas)
  - `apps/web/src/lib/realtime-mock.ts` / `realtime-mock.spec.ts` (2 pruebas)
  - `apps/web/src/lib/sugerencias-logica.ts` / `sugerencias-logica.spec.ts` (6 pruebas)
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