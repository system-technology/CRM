# 2026-10-19 — Foráneas compuestas del modelo antiguo y aserción 17 por el dato

Agente: `datos`. Rama: `fix/db-fk-compuestas-y-asercion-17`. Aislamiento entre tenants: sin recorte.

## Qué se hizo

1. **Migración `20261019220000_foraneas_con_tenant_en_el_modelo_antiguo`.** Pasa a compuestas
   `(x_id, tenant_id) REFERENCES t(id, tenant_id)` las tres foráneas simples de la migración inicial:
   - `paquetes_mayorista_id_fkey` → `paquetes_mayorista_id_tenant_id_fkey`, `ON DELETE SET NULL ("mayorista_id")`
     (un `SET NULL` a secas anularía `tenant_id`, el defecto de 20261011090200).
   - `temporadas_paquete_id_fkey` → `temporadas_paquete_id_tenant_id_fkey`, `CASCADE`.
   - `precios_temporada_id_fkey` → `precios_temporada_id_tenant_id_fkey`, `CASCADE`, con
     `temporadas_id_tenant_id_key` nueva.
   - `ON UPDATE RESTRICT` en las tres: con el tenant dentro de la clave, una cascada de UPDATE
     movería hijos de agencia.
   - Bloque final que barre todo el catálogo y aborta el despliegue si queda alguna foránea así.
2. **Aserción 54 (nueva):** el mismo barrido, sobre `pg_constraint`, en la prueba de aislamiento.
   **Resultado del barrido en la base del CI: exactamente esas tres**; no había más.
3. **Aserción 17 reescrita:** toda tabla (particiones por su raíz) fuera de `excepciones_rls` con
   una columna foránea hacia `tenants` o llamada `tenant%` tiene RLS habilitada y forzada; toda
   fila de `excepciones_rls` tiene `motivo` no vacío; se conserva la comprobación anterior de las
   tablas globales. Lleva una contraprueba permanente: planta `contraprueba_17 (tenant_x uuid
   REFERENCES tenants)` en una transacción que se deshace y exige que el detector la vea.
4. Prisma: relaciones compuestas en `Paquete.mayorista`, `Temporada.paquete`, `Precio.temporada`
   y `@@unique([id, tenantId])` en `Temporada`.

## Verificación (solo CI, Neon no se tocó)

- Rojo: run `39342971342`, commit `6970747` (aserciones nuevas, tabla `prueba_roja_17` plantada,
  sin migración). Rojas: 17 (`prueba_roja_17 [tenant_x]`), 54 (las tres foráneas) y 36.
- Verde: ver el run del commit siguiente en la rama.

## Lo que hay que decir

- La aserción 1 (`tablas_sin_aislamiento`) también detecta una tabla no exceptuada sin `tenant_id`.
  En el run rojo no saltó solo porque la tabla se plantó después de que corriera. El valor añadido
  de la 17 nueva es no depender de esa vista, que vive en la base, y exigir el `motivo`.
- `temporadas` y `precios` no tienen foránea a `tenants`; la compuesta hacia `paquetes` la
  garantiza por transitividad. Va a la cola, no bloquea.
- `Temporada`/`Precio` siguen en uso (`cotizar-paquete`, `listar-paquetes`); no se borran aquí.
