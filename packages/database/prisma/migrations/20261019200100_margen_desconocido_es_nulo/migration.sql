-- =============================================================================
-- Corrección: «margen 0 con neto desconocido» entraba
--
-- DEFECTO REAL de 20261019200000, encontrado por su propia aserción 50 contra Neon y corregido
-- aquí, no editando aquella (ya estaba aplicada).
--
-- El CHECK decía `(neto IS NULL AND margen IS NULL) OR margen = venta - neto`. Con neto nulo y
-- margen 0, la primera mitad es falsa y la segunda es `0 = NULL`, que es NULL — y un CHECK que
-- evalúa a NULL **pasa**. Es la trampa de la lógica de tres valores, y aquí afirmaba justo lo que
-- ADR-0009 §5 prohíbe: que se vendió a precio de costo cuando no se sabe el costo.
--
-- `IS NOT DISTINCT FROM` no tiene esa trampa: con neto nulo, `venta - neto` es NULL y el margen
-- tiene que ser NULL; con neto conocido, tiene que ser la resta.
--
-- Seguro en caliente: la tabla nació hace minutos y no tiene filas fuera de los fixtures de la
-- prueba. Reversible: el mismo ALTER con la expresión anterior.
-- =============================================================================

ALTER TABLE "versiones_cotizacion" DROP CONSTRAINT "versiones_cotizacion_margen_es_la_resta";
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_margen_es_la_resta"
  CHECK ("margen_unidades" IS NOT DISTINCT FROM "venta_unidades" - "neto_unidades");
