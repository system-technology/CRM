# Bitácora — 2026-10-28 — T-104: Respuestas rápidas en la bandeja con inserción «/» y administración por agencia

## Contexto
- **Tarea:** `T-104` (Fase 1, Prioridad P2)
- **Objetivo:**
  1. Insertar respuestas rápidas directamente en el compositor de mensajes de WhatsApp de la bandeja escribiendo «/», con menú flotante accesible, navegación con flechas/Enter y vista previa con reemplazo dinámico de variables contextuales (`{nombre}`, `{asesor}`, `{agencia}`, `{destino}`).
  2. Pantalla/sección de administración de respuestas rápidas en Configuración (`/configuracion`), consumiendo la API cuando exista (T-078) y mientras tanto operando en almacenamiento local aislado por agencia con estado transparente y honesto.

## Qué se construyó

1. **Módulo de Lógica Pura (`apps/web/src/lib/respuestas-rapidas-logica.ts`):**
   - Estructuras de datos tipadas `RespuestaRapida`, `CategoriaRespuestaRapida` y `ContextoInterpolacion` compatibles con `exactOptionalPropertyTypes: true`.
   - Catálogo predeterminado para agencias de turismo: saludo cordial, datos bancarios para transferencias en COP, requisitos migratorios y documentación, horario de atención, seguimiento comercial a cotización y despedida.
   - Función `interpolarVariables`: sustituye etiquetas `{nombre}`, `{asesor}`, `{agencia}`, `{destino}` de forma tolerante a mayúsculas/minúsculas, con valores de respaldo cuando el dato no está disponible.
   - Función `detectarDisparadorSlash`: reconoce cuándo el cursor se ubica tras un comando «/» (al inicio de línea o precedido de espacio/salto de línea), extrayendo la consulta y la posición inicial.
   - Función `reemplazarComandoSlash`: sustituye limpiamente el comando por el texto expandido e interpolado y calcula la posición final del cursor.
   - Función `filtrarRespuestasRapidas`: filtra por atajo, título, contenido y categoría, ordenando por relevancia.
   - Validaciones de formulario y persistencia aislada por tenant en almacenamiento local del navegador (`viajapro:respuestas_rapidas:<tenantId>`).

2. **Componente Flotante de Selección (`apps/web/src/components/bandeja/menu-respuestas-rapidas.tsx`):**
   - Popover flotante sobre el compositor con `role="listbox"` y opciones con `role="option"`.
   - Vista previa dinámica e interactiva con las variables ya interpoladas según la conversación y el asesor en sesión.
   - Navegación por teclado (flechas arriba/abajo, Enter/Tab para insertar, Esc para cerrar).
   - Objetivos táctiles `>= 44 px` en opciones y botones para usabilidad móvil.

3. **Integración en la Bandeja (`apps/web/src/app/bandeja/[id]/page.tsx`):**
   - Detección reactiva en el textarea al escribir «/».
   - Botón de acceso rápido en la barra de herramientas del chat (`btn-respuestas-rapidas`) para abrir el selector táctilmente sin necesidad de tipear.
   - Cierre automático al enviar mensaje o pulsar Escape.

4. **Administración en Configuración (`apps/web/src/components/configuracion/bloque-respuestas-rapidas.tsx`):**
   - Nueva pestaña `Respuestas Rápidas` (`tab-btn-respuestas`) en `/configuracion` con distintivo `T-104`.
   - Filtros por categoría y buscador en tiempo real.
   - Banner de estado honesto explicando la persistencia local de la agencia y la futura conexión con la API T-078.
   - Modal de creación y edición con botones de inserción rápida de variables (`+ {nombre}`, `+ {asesor}`, etc.) y validaciones tipadas.
   - Vista previa interactiva de variables en cada tarjeta.
   - Eliminación y restablecimiento a valores por defecto con confirmación.

## Verificación y Calidad
- **Pruebas unitarias (@viajapro/web):** 87 suites de prueba, 723 pruebas unitarias 100% en verde.
- **Typecheck:** 9/9 paquetes en verde sin errores TypeScript.
- **Linter:** 7/7 paquetes en verde sin advertencias.
- **Next.js Production Build:** 23/23 rutas compiladas y optimizadas con éxito.
- **Hooks de seguridad (`pnpm test:hooks`):** 59/59 casos de política de rama, 19/19 detección de secretos, 6/6 fronteras de módulos.
