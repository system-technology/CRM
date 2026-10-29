# 2026-10-28 — T-011: test de integración automático del cotizador

**Rama:** `b/T-011-test-integracion-cotizador` · **Autor:** Antigravity (`backend` + `frontend`)

## Qué se hizo

1. **API, punta a punta contra Neon** —
   [`cotizador-punta-a-punta.e2e-spec.ts`](../../apps/api/src/modules/quoting/cotizador-punta-a-punta.e2e-spec.ts):
   - Crea su propia agencia de fixture (`fixture-aislamiento-cotizador-…`) y un contacto; todo
     lo demás se crea **por HTTP**: paquete San Andrés, vigencia de temporada alta
     (2027-12-15 → 2028-01-15) con «Adulto en doble» (venta 2.690.000 / neto 2.150.000),
     «Menor en doble» (1.860.000 / 1.490.000) y «Promo pareja» (POR_GRUPO de 2).
   - Cotiza por la ruta vigente `POST /api/v1/catalogo/cotizar`:
     - 2 ADT + 2 CHD el 24 de diciembre, doble: líneas 5.380.000 + 3.720.000 = **$9.100.000 COP**,
       margen 1.080.000 + 740.000 = **1.820.000 = 20 %** de la venta (cálculo en `bigint`, R8).
       La promo de pareja sale como alternativa, no aplicada.
     - Sin `incluirMargen`, la misma respuesta no contiene «margen» ni «neto».
     - Guardar con `POST /api/v1/cotizaciones` y releer: versión 1 con acomodación DOBLE,
       venta 9.100.000, neto 7.280.000, margen 1.820.000; la fila existe con su `tenant_id`.
     - 3 ADT en doble: total 8.070.000; la promo de pareja va a `noAplicables` con el motivo
       exacto «Aplica a grupos de 2; sobra 1».
   - Limpieza con el `borrarTenants` compartido.
   - Archivo propio y no ampliación de `cotizaciones.e2e-spec.ts`: esa suite cuenta las
     cotizaciones de su tenant (`count === 1`) y meter fixtures nuevos la habría roto.

2. **Web, la mitad «2 habitaciones / plaza sin usar»:**
   - La API no reparte camas: el reparto en habitaciones y `plazasSinUsar` son de la lógica de la
     web (`cotizador-logica.ts`). Por eso el aviso «1 plaza sin usar, se paga igual» se prueba ahí.
   - `mock-catalogo.ts`: San Andrés gana la «Temporada alta — diciembre» con los precios de `seed.ts`.
   - `cotizador-logica.spec.ts` (pruebas 14 y 15): 2+2 en diciembre = temporada alta, doble,
     2 habitaciones, 0 plazas libres, $9.100.000, margen 20,0 %; 3 ADT en doble = 2 habitaciones,
     1 plaza sin usar, y el texto de WhatsApp lo dice.
   - `cotizador/page.tsx`: aviso visible `aviso-plazas-sin-usar` y selector de acomodación en
     modo demostración (sin él, 3 adultos caían a TRIPLE y el caso no se podía reproducir).
   - `cotizador/page.spec.tsx` (pruebas 5 y 6): la pantalla muestra $9.100.000 con las dos líneas
     y sin aviso; con 3 adultos en doble muestra «1 plaza sin usar, se paga igual».

## Trampas

- La vista de demostración **no pinta `temporadaNombre`**; la primera versión de la prueba 5 lo
  buscaba y caducaba. Se afirma el total y las líneas, que es lo que el asesor copia.
- **En local, las e2e que arrancan la app fallan con «Authentication failed» del rol
  `viajapro_identidad`** (`DATABASE_IDENTIDAD_URL`). Pasa igual con `cotizaciones.e2e-spec.ts`
  ya existente: es la credencial local, no la prueba. Además `.env` repite claves
  (`DATABASE_ALTAS_URL`, `DATABASE_WEBHOOK_URL`, `DATABASE_IDENTIDAD_URL`). La verificación de la
  e2e nueva queda en el job `test` del CI, que usa sus propios secretos. Queda anotado para el
  propietario: rotar o corregir la credencial local de identidad.

## Pruebas

- `pnpm --filter @viajapro/web test src/lib/cotizador-logica.spec.ts` → 15/15.
- `pnpm --filter @viajapro/web test src/app/cotizador/page.spec.tsx` → 8/8.
- e2e de la API: en CI (ver arriba).
