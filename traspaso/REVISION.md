# REVISIÓN — 2026-10-19 (noche)

## Veredicto: **ACEPTADO** — `6b70867..b2c5c6d` (0c.18, 0c.19, 0c.20, 0c.21)

R13: una sola vuelta. Nada de lo de abajo te detiene.

## Bloqueante

Ninguno en lo entregado.

## Cola — con dueño, no bloquea

1. **`ENTREGA.md` dice «cero commits por detrás de main»; hoy son 4** (`20da8ef`, `d806804`, `2cb5ce4`,
   `7fba2e9`: solo `ESTADO.md`, gitleaks y docs, 3 archivos). No toca `apps/web`. Se resuelve con
   `git merge main` antes de integrar. *(Dueño: integrador.)*
2. **Tu WIP de 0c.22 no pasa las compuertas todavía** (esperado, es trabajo en curso): `typecheck`
   falla en `apps/web/src/lib/mock-cotizaciones.ts` (origen `'MAYORISTA'` no existe en el contrato,
   las líneas no traen `masBarata`) y `format:check` marca `cotizaciones-logica*.ts`. Corrígelo
   antes de entregar 0c.22; el mock debe construirse con los tipos de `@viajapro/contracts`.
   *(Dueño: Antigravity.)*
3. **La auditoría 0c.21 afirma «Cumple» en 9 de 10 criterios sin evidencia visual.** No la
   reproduje en navegador (no tengo el MCP `navegador` en esta sesión). Los criterios 3, 6 y 7
   necesitan captura a 375 px en la próxima entrega. *(Dueño: Antigravity.)*

## Lo verificado, ejecutando

- `pnpm --filter @viajapro/web lint`: limpio.
- `pnpm --filter @viajapro/web test`: 17 archivos, 139 pruebas en verde.
- `pnpm --filter @viajapro/web typecheck`: **solo** falla `mock-cotizaciones.ts`, archivo **sin
  commitear** (tuyo, 0c.22). Lo commiteado no da errores.
- `format:check` raíz: solo los 2 archivos sin commitear de 0c.22.
- `grep -rniE "copilot|\bIA\b" apps/web/src`: 0 coincidencias (confirmado).
- Rama: 76 por delante de `origin/main`, 4 por detrás (ver cola 1).
- **No** corrí la suite de aislamiento ni miré el navegador a 375 px.

## Plan de integración por tandas

`origin/main...HEAD`: 95 archivos, +19 189 / -315 líneas. **Demasiado grande para entrar entera**,
aunque esté al día y sin bloqueantes. Antes de nada, `git merge main`. Cuatro tandas:

1. **Base** (~15 archivos, ~600 líneas + lockfile): `package.json`, `vitest.config.mts`,
   `tsconfig.json`, `scripts/compuertas.mjs`, `pnpm-lock.yaml`, armazón (`layout.tsx`, `page.tsx`,
   `globals.css`), `components/` compartidos y `lib/` transversal (accesibilidad, búsqueda
   global, notificaciones).
2. **Bandeja** (`app/bandeja`, `components` y `lib` de bandeja/sugerencias/ventana 24 h).
3. **Catálogo + cotizador** (política de precio, tarjeta de salida, mocks y lógica de cotización).
4. **CRM operativo**: pipeline, contactos, configuración, viajes, reportes, y `docs/`, `traspaso/`.

Cada tanda con sus propias compuertas verdes sobre un `main` que ya contiene la anterior.
La 0c.22 va aparte, en una quinta rama, cuando esté completa.
