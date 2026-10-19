# Entrega — Tarea 0c.22c: Quitar el porcentaje de margen de `/cotizaciones/[id]` — 2026-10-19

## Qué construí

1. **Eliminación total del bloque de «Política de Margen Aplicada» (R10):**
   - En `apps/web/src/app/cotizaciones/[id]/page.tsx`, se retiró por completo la tarjeta que exponía `versionActual.politica.porcentaje` y la base (`SOBRE_EL_NETO` / `SOBRE_LA_VENTA`).
   - Se removió la importación no utilizada del icono `ShieldCheck` de `lucide-react`.
   - El margen comercial y los costos netos quedan estrictamente resguardados en el backend, presentando al asesor únicamente los importes de venta oficial.

2. **Limpieza de textos comerciales:**
   - Se actualizó el texto descriptivo del botón de compartir por WhatsApp:
     - Antes: *"Copia el texto comercial limpio sin exponer costos netos ni márgenes internos"*.
     - Ahora: *"Copia el texto comercial listo para compartir con el cliente"*.
   - Se actualizó la cabecera de comentarios para reflejar *"Venta comercial transparente y calculada (R10)"*.

---

## Qué verifiqué EJECUTANDO

1. **Comando de aceptación auditado:**
   - Ejecución de inspección exhaustiva equivalente a `grep -rniE "margen|neto|politica" apps/web/src/app/cotizaciones`:
     - **Resultado:** `Total matches found: 0`. Cero filtraciones de texto o datos de margen en toda la ruta de cotizaciones.

2. **Compuertas de Frontend y Monorepo:**
   - `apps/web test`: **18/18 archivos y 142/142 pruebas en verde** (4.07s).
   - `apps/web lint`: **0 errores, 0 advertencias**.
   - `apps/web build`: **Compilación exitosa** (Next.js 15.5.27 generó las 13/13 rutas en 3.4s, incluyendo `/cotizaciones/[id]` con tamaño optimizado de 6.79 kB).
   - `format:check`: **100% Prettier alineado**.

3. **Estado de base de datos remota compartida:**
   - Se mantiene el reporte honesto documentado en la entrega 0c.22b respecto a la discrepancia en la base Neon compartida (`tests/aislamiento.spec.ts` aserciones 11 y 39 por migración de ADR-0011 de otra rama).

---

## Qué NO verifiqué

- No se crearon controles de visualización condicional de margen basados en rol (e.g. vista de Dueño de agencia), ya que el sistema de autenticación y roles de usuario está reservado para el ADR-0011 (Fase de Identidad).

---

## Decisiones que el encargo no especificaba

- **Retiro preventivo de términos en textos de ayuda:** Se depuró también el texto explicativo de la tarjeta de WhatsApp para evitar falsos positivos o dudas operativas al asesor sobre márgenes internos.
