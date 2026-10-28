# Bitácora — 2026-10-28 — T-105: Onboarding de una agencia nueva: asistente de 4 pasos

- **Fecha:** 2026-10-28
- **Autor:** Antigravity (`frontend`)
- **Tarea:** `T-105` (Fase 1, Prioridad P1, Esfuerzo L)
- **Rama:** `b/T-105-onboarding-agencia-nueva`

---

## 1. Contexto y Objetivos

El objetivo de la tarea `T-105` es guiar a una agencia turística nueva desde una cuenta vacía hasta su primera cotización enviada por WhatsApp mediante un asistente guiado de 4 pasos con progreso guardado y cada paso saltable:

1. **Marca e Identidad (T-039):** Configuración de nombre comercial, razón social, NIT con validación colombiana, teléfono oficial, ciudad base y selector de paletas de acento predefinidas (`Dorado Cartagena`, `Azul Caribe`, `Verde Esmeralda`, etc.) o color HEX personalizado con vista previa en vivo de una tarjeta de cotización.
2. **Catálogo de Servicios (T-031 / T-029):** Tres opciones claras: precarga de excursiones insignia colombianas (`Islas del Rosario`, `City Tour Amurallado`, `Barú Manglares`, `Circuito Cafetero`), creación de excursión manual rápida o enlace al importador masivo en 4 pasos con validación estricta.
3. **Equipo y Asesores (T-027):** Explicación clara de roles (`ASESOR`, `ADMIN_AGENCIA`, `OPERATIVO`) con formulario de invitación por correo electrónico y validación de formato.
4. **WhatsApp Cloud API Oficial:** Explicación técnica clara en lenguaje de agencia, checklist de preparación (línea dedicada, Meta Business Suite con RUT, Display Name aprobado) y opción de probar en modo simulador inmediatamente sin solicitar secretos en pantalla (Regla R6).

Al finalizar o resolver los 4 pasos, se presenta la pantalla de celebración con accesos directos principales:
- «Crear y enviar mi primera cotización» (`/cotizador`).
- «Ir a la bandeja de WhatsApp» (`/bandeja`).
- «Ver pipeline de ventas» (`/pipeline`).

---

## 2. Archivos Creados y Modificados

- `apps/web/src/lib/onboarding-logica.ts`:
  - Lógica pura de validación, estados de paso (`pendiente`, `en_progreso`, `completado`, `omitido`), cálculo porcentual (25% por paso), almacenamiento con ámbito por tenant (`viajapro:onboarding:<tenantId>`), avance y reinicio.
- `apps/web/src/lib/onboarding-logica.spec.ts`:
  - 11 pruebas unitarias cubriendo inicialización, cálculo porcentual, validaciones (nombre, NIT, HEX, correos, ausencia de secretos R6) y persistencia.
- `apps/web/src/components/onboarding/paso-marca.tsx`:
  - Formulario de identidad y marca con selector de paletas y vista previa en vivo.
- `apps/web/src/components/onboarding/paso-marca.spec.tsx`:
  - 5 pruebas unitarias con simulación de eventos y validaciones.
- `apps/web/src/components/onboarding/paso-catalogo.tsx`:
  - Selector de estrategia (semilla de muestra, creación manual o importación CSV) con precios en COP mediante `formatearCOP`.
- `apps/web/src/components/onboarding/paso-catalogo.spec.tsx`:
  - 5 pruebas unitarias.
- `apps/web/src/components/onboarding/paso-equipo.tsx`:
  - Formulario de invitación y administración de compañeros con explicación de roles.
- `apps/web/src/components/onboarding/paso-equipo.spec.tsx`:
  - 5 pruebas unitarias.
- `apps/web/src/components/onboarding/paso-whatsapp.tsx`:
  - Guía oficial para Meta Cloud API con checklist y modo simulador sin secretos en pantalla.
- `apps/web/src/components/onboarding/paso-whatsapp.spec.tsx`:
  - 5 pruebas unitarias.
- `apps/web/src/components/onboarding/resumen-onboarding-completado.tsx`:
  - Estado de celebración, resumen de los 4 pilares y CTA principal para crear la primera cotización.
- `apps/web/src/components/onboarding/asistente-onboarding.tsx`:
  - Contenedor orquestador de 4 pasos con stepper, tiempos estimados, barra de progreso y persistencia.
- `apps/web/src/components/onboarding/asistente-onboarding.spec.tsx`:
  - 5 pruebas de integración del orquestador.
- `apps/web/src/app/bienvenida/page.tsx`:
  - Ruta de la aplicación `/bienvenida` accesible para nuevas agencias con cabecera y barra de navegación unificada.
- `apps/web/src/app/bienvenida/bienvenida.spec.tsx`:
  - 3 pruebas de integración de la página y área táctil accesible (`min-h-[44px]`).
- `apps/web/src/app/page.tsx`:
  - Enlace al asistente de inicio desde el banner de cuenta vacía en el dashboard.
- `apps/web/src/app/configuracion/page.tsx`:
  - Botón de acceso al Asistente de Inicio en la cabecera de configuración.
- `apps/web/src/components/bandeja/barra-modulos.tsx`:
  - Enlace accesible en el menú de sesión del usuario.
- `roadmap/tasks.yaml`: `T-105` marcado como `status: done`.
- `ESTADO.md`: Registro de hito completado y avance a `T-106`.

---

## 3. Calidad y Verificación

- `@viajapro/web` test suite: 94 archivos de prueba, 762 pruebas unitarias en verde (100% pasando).
- Monorepo `typecheck`: 9 paquetes en verde sin errores TypeScript.
- Monorepo `lint`: 7 paquetes en verde sin errores ESLint.
- `pnpm test:hooks`: 59/59 políticas de rama, 19/19 detección de secretos, 6/6 fronteras entre módulos.
- Next.js build: 24 rutas compiladas y optimizadas sin errores.
