# 2026-11-22 · Pasajeros en la pantalla de cobros (T-590, carril b)

## Qué se hizo
- Pantalla `apps/web/src/app/(app)/cobros/page.tsx`: columna «Pasajeros» en la tabla (md+) y una línea
  «Pasajeros» en la tarjeta móvil (390 px). Total en negrita; si viajan niños o infantes, debajo la
  composición compacta («2 ad · 1 niño · 1 inf», `text-xs` neutral-700/300, el mismo par ya
  validado por contraste). Lectores de pantalla: frase completa en `sr-only`.
- CSV (`exportar-csv.ts`): cuatro columnas numéricas tras «Salida»: Adultos, Niños, Infantes, Pasajeros.
  Numéricas a propósito: «2+1» como texto empieza por dígito pero es ambiguo y no se suma en la hoja.
- Lógica pura `pasajerosEnPantalla` en `cobros-logica.ts`. La maqueta (`dashboard-admin-api.ts`) trae composiciones.

## Decisiones
- **Cifras, no nombres (R10, ADR-0024 §3.7).** `cobro.ver` lo tiene también OPERACIONES y el CSV sale de la agencia.
- **Sin `pasajeros`: «—» en pantalla y celda vacía en el CSV, nunca 0.**
- El escapado de fórmulas (T-335) se reutiliza sin cambios: los números van como `number` y no pasan por la sanitización.

## Pendiente / cola
- Volver `pasajeros` obligatorio en el contrato (`packages/contracts`, carril a) cuando no quede respuesta antigua; entonces el «—» sobra.
- Prueba e2e de la pantalla de cobros a 390 px (fuera de este carril: `apps/web/e2e`).
