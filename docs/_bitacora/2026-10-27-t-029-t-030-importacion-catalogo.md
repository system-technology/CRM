# 2026-10-27 — Asistente de importación de catálogo (T-029) y descarga de plantillas CSV (T-030)

- **Autor:** Antigravity (IA colaborativa)
- **Rama:** `b/T-029-t-030-asistente-importacion`
- **Tareas cerradas:**
  - `T-029`: Asistente de importación en cuatro etapas (archivo con marcador `#viajapro`, mapeo inteligente de columnas con cálculo de confianza, previsualización con KPIs e informe clasificado de errores por fila con huella digital SHA-256, y confirmación atómica todo-o-nada).
  - `T-030`: Descarga de plantillas CSV oficiales por tipo de producto (excursión de un día, pasadía, pasanoche, paquete con hotel) con el marcador `#viajapro;plantilla=<formato>;version=<version>`.
- **Diseño Stitch:**
  - Proyecto: `8333038101997719867`
  - Pantalla: `1ae9a897573c4a5db87a584bf12605c0` (*Asistente de Importación de Catálogo y Plantillas — ViajaPro CRM*)

## Qué se construyó

1. **Lógica Pura (`apps/web/src/lib/importacion-logica.ts` y `.spec.ts`):**
   - `generarCsvPlantilla`: Construcción de CSV con marcador oficial `#viajapro`, encabezados oficiales en español y fila de datos de ejemplo verosímiles.
   - `extraerMarcadorViajaPro`: Detección y extracción de formato y versión a partir de la primera línea.
   - `parsearCsvAImportacion`: Parser tolerante a comillas escapadas y detección automática de delimitadores (coma o punto y coma).
   - `sugerirMapeoLocal`: Algoritmo fonético de aproximación de etiquetas para correspondencia local de columnas.
   - `clasificarInformeDeImportacion`: Filtros por severidad (`ERROR`, `AVISO`, `OK`) y bloqueo de confirmación ante errores invalidantes.
   - 13 pruebas unitarias sin dependencias externas.

2. **Cliente API (`apps/web/src/lib/importaciones-api.ts`):**
   - Consume los endpoints del ADR-0017: `/api/v1/catalogo/formatos`, `/api/v1/catalogo/formatos/:id/plantilla`, `/api/v1/catalogo/importaciones/sugerir-mapeo`, `/api/v1/catalogo/importaciones/previsualizar` y `/api/v1/catalogo/importaciones/confirmar`.
   - Incluye cabeceras de tenant y fallback a `PLANTILLAS_DE_SISTEMA` cuando opera en modo offline/demostración.

3. **Componente de Plantillas (`apps/web/src/components/catalogo/importacion/descarga-plantillas.tsx` y `.spec.tsx`):**
   - Cuadrícula de tarjetas con insignias de duración (1D pasadía vs D/N), conteo de columnas, obligatorias y distintivo `#viajapro`.
   - Descarga directa de archivos `.csv` en el navegador con nombres normalizados (`plantilla-<formato>-viajapro.csv`).
   - Acceso táctil mínimo de 44 px conforme a directrices de accesibilidad.

4. **Asistente Wizard en 4 Pasos (`apps/web/src/components/catalogo/importacion/asistente-importacion.tsx` y `.spec.tsx`):**
   - Paso 1: Selección de formato, moneda y subida de archivo o pegado directo con auto-detección del marcador `#viajapro`.
   - Paso 2: Correspondencia de columnas contra los atributos de la plantilla con selector de formato de fechas (`DD/MM/AAAA` vs `MM/DD/AAAA`).
   - Paso 3: Previsualización con KPIs de impacto (total, a crear, a actualizar, errores), tarjeta con huella SHA-256 e informe de incidencias por fila. Botón de confirmación deshabilitado si existen errores bloqueantes.
   - Paso 4: Confirmación atómica y resumen de creación.

5. **Integración en la Vista de Catálogo (`apps/web/src/app/catalogo/page.tsx`):**
   - Botón directo «Importar archivo (CSV)» en la cabecera.
   - Pestaña de navegación para explorar el catálogo de salidas o consultar y descargar plantillas masivas.
