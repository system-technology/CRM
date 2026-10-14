# ENTREGA.md — Tarea 0c.14: Que la pantalla diga con qué datos está hablando

- **Rama:** `feat/bandeja-web`
- **Fecha:** 2026-10-13
- **Tarea completada:** `0c.14. Que la pantalla diga con qué datos está hablando` (y honestidad de sugerencias en bandeja según `REVISION.md`)

---

## 1. Qué construí

1. **Distintivo honesto, visible y discreto (`apps/web/src/components/comun/distintivo-datos-demo.tsx` - 0c.14.1):**
   - Etiqueta pequeña, discreta y visible con la leyenda `«datos de demostración»` y un indicador sutil ámbar.
   - Cuando la pantalla está operando contra la API real conectada a PostgreSQL/Neon: **no aparece nada** («lo normal no se anuncia»).
   - Cuando la pantalla opera con datos simulados (o fallback offline): se muestra visible en la cabecera junto al título.
   - Integrado en todas las pantallas principales: `/pipeline`, `/contactos`, `/bandeja` (lista de conversaciones), `/catalogo`, `/cotizador`, `/reportes`, `/viajes` y `/configuracion`.

2. **Manejo de error de configuración de tenant sin pantalla rota (`apps/web/src/components/crm/aviso-configuracion-tenant.tsx` y `crm-api.ts` - 0c.14.2):**
   - En `apps/web/src/lib/crm-api.ts`:
     - Funciones `estaUsandoApiReal()` y `obtenerTenantDemo()`.
     - Si `NEXT_PUBLIC_USE_REAL_CRM=true` pero no se configuró `NEXT_PUBLIC_DEV_TENANT_ID`, `obtenerTableroPipeline()` lanza un `CrmApiError` tipado (`CONFIG_TENANT_FALTANTE`, status 401).
   - En `apps/web/src/app/pipeline/page.tsx`:
     - La pantalla ya no se queda en blanco ni rota. Muestra un panel de advertencia de configuración (`AvisoConfiguracionTenant`) que explica con exactitud técnica qué falta:
       1. Correr `pnpm db:seed` en la terminal (que al finalizar imprime el UUID de la agencia sembrada, André's Tours).
       2. Añadir `NEXT_PUBLIC_DEV_TENANT_ID=<id>` a `.env`.
       3. Reiniciar el servidor de desarrollo (`pnpm dev`).
     - Ofrece un botón de acción "Ver con datos de demostración" que permite desbloquear la vista simulada si se desea explorar mientras se configuran las variables.

3. **Corrección definitiva del error de hidratación en `/pipeline` (`pipeline-logica.ts` y `tarjeta-oportunidad.tsx` - 0c.14.3):**
   - Causa raíz identificada: discrepancias de caracteres de espacio (`\u202f` espacio fino no separable vs `\u00a0` espacio no separable vs `\u0020` espacio estándar) generados por diferentes motores de `Intl` en Node.js (servidor) frente a Chromium/navegador, sumado a diferencias de zona horaria por omisión.
   - Función determinista `formatearFechaTarea(fechaIso)`:
     - Fija la zona horaria en presentación a `America/Bogota` (cumpliendo la regla R9).
     - Normaliza de forma determinista todos los espacios no separables con `.replace(/[\u202f\u00a0]/g, ' ')`.
   - Inyección de `suppressHydrationWarning` en los nodos de texto de vencimiento y tiempo relativo en `tarjeta-oportunidad.tsx`.
   - En `mock-pipeline.ts`: redondeo temporal a la hora (`Math.floor(Date.now() / 3600000) * 3600000`) para garantizar una base idéntica entre SSR y renderizado cliente.
   - Tres pruebas unitarias añadidas en `pipeline-logica.spec.ts` validando la ausencia de `\u202f`/`\u00a0` y la consistencia en `America/Bogota`.

4. **Honestidad en el panel de sugerencias de bandeja (`REVISION.md`):**
   - Siguiendo la observación de Claude en `REVISION.md`, se reemplazó la mención engañosa de "Copilot IA — Inteligencia de Ventas" por "Sugerencias Automáticas — Reglas Heurísticas" y "Sugerencias" en el botón de redactor, para no prometer al asesor un modelo generativo que aún no está conectado.

---

## 2. Qué verifiqué EJECUTANDO

Ejecución formal completa del comando unificado **`pnpm compuertas`**:

```
══════════════════════════════════════════════════════════════════════
  ✓ build          verde     22.1s
  ✓ lint           verde     9.9s
  ✓ typecheck      verde     4.9s
  ✓ test           verde     105.2s
  ✓ format:check   verde     3.6s

  Las cinco en verde. Ejecutadas, no supuestas.
```

Detalles de ejecución:
1. **`build` (turbo run build):**
   - Next.js 15.5.27 compiló 13/13 rutas estáticas y dinámicas limpiamente en 4.0s. Paquetes monorepo compilados a `dist`.
2. **`lint` (turbo run lint):**
   - ESLint en `apps/web`, `packages/contracts`, `packages/domain`, `packages/database`, `apps/api`: **cero errores, cero advertencias**.
3. **`typecheck` (turbo run typecheck):**
   - TypeScript `tsc --noEmit` en modo estricto en todos los paquetes del monorepo: **limpio**.
4. **`test` (turbo run test):**
   - **109 pruebas en verde en 15 suites** en `apps/web` (subió de 104 a 109 pruebas).
   - 112 pruebas en verde en `apps/api`.
   - 39 pruebas de aislamiento RLS en `packages/database`.
   - Todas las pruebas de contratos y dominio en verde.
5. **`format:check` (prettier --check):**
   - `All matched files use Prettier code style!`.

---

## 3. Qué NO verifiqué

1. **Persistencia de variables en el archivo `.env` del repositorio:**
   - De acuerdo con la regla R6 y el hook de seguridad de git, ni Antigravity ni Claude pueden modificar el archivo `.env` local. Por ende, la verificación con `NEXT_PUBLIC_USE_REAL_CRM=true` y `NEXT_PUBLIC_DEV_TENANT_ID` cargados desde el entorno vivo de desarrollo requiere que el usuario los configure en su `.env` local o los pase en las variables de ejecución de Node. La lógica fue verificada a nivel unitario y de componente inyectando las variables en `process.env`.
2. **Conexión real de WhatsApp Cloud API en la bandeja:**
   - Tal como estipula `ARRANQUE.md §6`, Meta no ha iniciado el proceso de verificación técnica, por lo que la bandeja opera sobre datos simulados.

---

## 4. Decisiones que el encargo no especificaba

1. **Botón de fallback en el aviso de configuración:**
   - Cuando la pantalla de configuración informa que falta `NEXT_PUBLIC_DEV_TENANT_ID`, se incluyó el botón "Ver con datos de demostración" para que un evaluador o asesor no quede bloqueado si quiere revisar la interfaz visual mientras un desarrollador realiza el sembrado de base de datos. Al hacer clic, se activa el modo demostración y aparece el distintivo honesto `datos de demostración`.
2. **Extensión del distintivo honesto a las 8 pantallas:**
   - La tarea mencionaba el distintivo para cuando cualquier pantalla pinte datos simulados. Se colocó de forma coherente en `/pipeline`, `/contactos`, `/bandeja`, `/catalogo`, `/cotizador`, `/reportes`, `/viajes` y `/configuracion`.
3. **Ajuste del Asistente Heurístico en la Bandeja:**
   - Siguiendo la instrucción en `REVISION.md` («el copiloto no habla con ningún modelo... que el texto no prometa lo que todavía no hay»), se adaptaron las etiquetas del panel deslizable a "Sugerencias Automáticas — Reglas Heurísticas".
