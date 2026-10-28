# Bitácora — 2026-10-28 — T-106: Pantalla de conexión de WhatsApp en Configuración: estado, calidad, tier y ventana de 24 h

- **Fecha:** 2026-10-28
- **Autor:** Antigravity (`frontend`)
- **Tarea:** `T-106` (Fase 1, Prioridad P2, Esfuerzo M)
- **Rama:** `b/T-106-pantalla-conexion-whatsapp`

---

## 1. Contexto y Objetivos

El objetivo de la tarea `T-106` es proporcionar a las agencias turísticas una pantalla completa y didáctica de administración y diagnóstico de su canal empresarial de WhatsApp (Meta Cloud API) en Configuración:

1. **Estado Real de Conexión del Canal:**
   - Visualización honesta de los parámetros de salud: estado (`Conexión Saludable` vs. `Canal No Conectado`), número verificado en formato E.164, nombre visible aprobado ante Meta, identificadores públicos (Phone Number ID y WABA ID) y capacidad de envíos (Tier).
   - Aviso de cumplimiento de la **Regla R6 (Cero secretos en frontend)**: el token permanente de Meta Cloud API se encuentra cifrado con AES-256-GCM en el backend; la pantalla solo visualiza identificadores públicos no sensibles.

2. **Calidad y Tier en Lenguaje de Agencia:**
   - La calidad del número emitida por Meta (`GREEN`, `YELLOW`, `RED`, `UNKNOWN`) se explica con claridad comercial turística: reputación del número, tasa de bloqueos/spam por parte de los viajeros y recomendaciones operativas para no poner en riesgo la línea.
   - El nivel de mensajería (Tier: `TIER_50`, `TIER_1K`, `TIER_10K`, etc.) se traduce a clientes únicos por 24 horas y conversaciones activas simultáneas.

3. **Guía de Vinculación para Canales No Conectados:**
   - Guía paso a paso en 3 etapas comprensibles (línea limpia sin WhatsApp regular, verificación de negocio en Meta Business Suite con RUT de la agencia y vinculación segura del webhook con ViajaPro).
   - Botón interactivo para simular el estado desconectado y verificar la experiencia guiada.

4. **La Ventana de 24 Horas Explicada para Agencias:**
   - Comparativa pedagógica en dos columnas sin jerga técnica de Meta:
     - **Ventana Abierta (0 a 24 horas):** Chateo libre y bidireccional cuando el viajero escribe; envío de cotizaciones personalizadas, itinerarios, fotos y notas de voz sin costo por mensaje individual.
     - **Ventana Cerrada (+24 horas sin respuesta):** Protección de Meta contra spam; requiere el uso de plantillas oficiales pre-aprobadas (HSM) de utilidad o reactivación para reabrir la ventana de atención libre.
   - **Simulador Interactivo:** Permite a los asesores seleccionar el tiempo transcurrido desde el último mensaje (hace 2h, 18h por vencer, 26h vencida) para observar cómo cambia el semáforo, el tiempo restante y las recomendaciones de acción.
   - **Catálogo de Plantillas Oficiales Aprobadas:** Muestra 4 plantillas pre-aprobadas de uso frecuente en agencias colombianas (seguimiento de cotización, confirmación de punto de encuentro de excursión, solicitud de documentos para póliza médica y reactivación de viajero).

---

## 2. Archivos Creados y Modificados

- `apps/web/src/lib/whatsapp-conexion-logica.ts`:
  - Modelado de tipos e interfaces: `CalidadMeta`, `TierMensajeriaMeta`, `DatosConexionWhatsApp`, `SimulacionVentana24h`, `PlantillaAgencia`.
  - Funciones puras: `calcularEstadoVentana24h`, `interpretarCalidadMeta`, `interpretarTierMensajeria`, `validarIdentificadoresPublicos`.
  - Constantes predefinidas: `DATOS_WHATSAPP_CONECTADO_DEFAULT`, `DATOS_WHATSAPP_DESCONECTADO_DEFAULT`, `PLANTILLAS_OFICIALES_AGENCIA`.
- `apps/web/src/lib/whatsapp-conexion-logica.spec.ts`:
  - 7 pruebas unitarias verificando cálculo de ventana, límites de tier, semáforo de calidad, validación de identificadores públicos, catálogo de plantillas y ausencia de secretos (R6).
- `apps/web/src/components/configuracion/bloque-conexion-whatsapp.tsx`:
  - Componente integral con tarjeta de salud, webhook con botón de copia, alternancia a modo desconectado con guía de 3 pasos, comparativa didáctica de ventana de 24 horas, simulador interactivo y catálogo de plantillas oficiales.
- `apps/web/src/components/configuracion/bloque-conexion-whatsapp.spec.tsx`:
  - 9 pruebas unitarias cubriendo renderizado de canal conectado, llamada R6, copiado al portapapeles, alternancia a modo desconectado, explicación de ventana 24h, simulador interactivo de tiempo transcurrido, catálogo de plantillas y tamaños táctiles mínimos `>= 44 px`.
- `apps/web/src/app/configuracion/page.tsx`:
  - Integración del componente `BloqueConexionWhatsapp` en la pestaña `Canal WhatsApp (WABA)` con la insignia `T-106`. Limpieza de variables y estados no utilizados.
- `apps/web/src/app/configuracion/whatsapp/page.tsx`:
  - Ruta dedicada `/configuracion/whatsapp` con navegación unificada mediante `BarraModulos`, migas de pan a `/configuracion` y enlaces directos a `/bienvenida` y `/inbox`.
- `apps/web/src/app/configuracion/whatsapp/page.spec.tsx`:
  - 2 pruebas de integración para la página dedicada.
- `roadmap/tasks.yaml`:
  - Actualización de `T-106` a `status: done` con evidencia detallada.
- `ESTADO.md`:
  - Actualización de `Avance` con `T-106` completado y avance del `Próximo hito` a `T-107`.
- `traspaso/ENTREGA.md`:
  - Entrada de entrega de la tarea `T-106` antepuesta al inicio del archivo.

---

## 3. Verificación y Calidad

- **Pruebas unitarias de T-106:** 18/18 pruebas en verde (0.4s).
- **Pruebas web completas:** 97 suites de prueba con 780 tests pasando al 100% en `@viajapro/web`.
- **Typecheck:** 9 de 9 tareas completadas exitosamente en Turborepo (`tsc --noEmit` y `next build`).
- **Linter:** 7 de 7 paquetes verificados sin errores ni advertencias (`eslint`).
- **Hooks de repositorio:** 59/59 políticas de rama, 19/19 reglas de secretos y 6/6 fronteras entre módulos en verde.
- **Accesibilidad:** Touch targets auditados `>= 44 px` en todos los controles interactivos.
