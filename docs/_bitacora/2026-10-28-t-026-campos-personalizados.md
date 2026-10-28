# 2026-10-28 — T-026: Campos personalizados por agencia en contactos y oportunidades

## Contexto
Tarea T-026 del roadmap (Fase 1: Un CRM mostrable y endurecido):
- Configuración permite definir campos (texto, número, fecha, lista) para contactos y oportunidades, y la ficha los muestra y edita.
- Los tipos de campo salen del contrato de `packages/contracts`, sin redefinirlos (R3).
- Si la API aún no lo soporta, se pide en `traspaso/ENTREGA.md` y se deja el componente con pruebas.

## Implementación

1. **Contratos Zod en `@viajapro/contracts` (Regla R3)**:
   - Esquemas agregados a `packages/contracts/src/crm.ts`:
     - `TipoCampoPersonalizado`: `texto`, `numero`, `fecha`, `lista`.
     - `EntidadCampoPersonalizado`: `contacto`, `oportunidad`.
     - `DefinicionCampoPersonalizado`: `id`, `entidad`, `nombre`, `clave`, `tipo`, `opciones`, `requerido`, `descripcion`.
     - `ValorCampoPersonalizado`: `campoId`, `clave`, `valor`.
   - Pruebas añadidas en `packages/contracts/src/crm.spec.ts`.

2. **Componente de Configuración `BloqueCamposPersonalizados`**:
   - Ubicación: `apps/web/src/components/configuracion/bloque-campos-personalizados.tsx`.
   - Montado en `apps/web/src/app/configuracion/page.tsx` (pestaña `campos`).
   - Permite alternar entre campos de viajeros y de oportunidades.
   - Creación de campos con modal accesible (`useFocoModal`, WCAG AA).
   - Eliminación interactiva y persistencia resiliente en storage local.

3. **Sección y Edición en Ficha de Contacto y Bandeja `SeccionCamposPersonalizados`**:
   - Ubicación: `apps/web/src/components/contactos/seccion-campos-personalizados.tsx`.
   - Integrado en `apps/web/src/components/contactos/ficha-detalle-contacto.tsx` y en `apps/web/src/components/bandeja/ficha-cliente.tsx` (contacto y oportunidad viva).
   - Validación tipada por tipo de campo con mensajes de error accesibles (`validarValorCampoPersonalizado`).
   - Botón de guardar con touch targets >= 44 px y estado de guardado en vivo.

4. **Pruebas y Verificación**:
   - `packages/contracts/src/crm.spec.ts`: 28 pruebas pasando.
   - `apps/web/src/lib/campos-personalizados-logica.spec.ts`: 7 pruebas pasando.
   - `apps/web/src/components/configuracion/bloque-campos-personalizados.spec.tsx`: 5 pruebas pasando.
   - `apps/web/src/components/contactos/seccion-campos-personalizados.spec.tsx`: 2 pruebas pasando.
   - Total `@viajapro/web`: 70 suites, 589 pruebas unitarias en verde.
   - Typecheck (9/9), Linter (7/7) y Compilación Next.js (18 rutas) en verde.
   - Compuertas de hooks y fronteras en verde.
