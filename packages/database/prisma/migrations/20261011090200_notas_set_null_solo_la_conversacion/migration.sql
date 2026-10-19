-- =============================================================================
-- Correccion: SET NULL debe anular SOLO conversacion_id, no tambien tenant_id
--
-- DEFECTO REAL de la migracion 20261011090000, corregido aqui y no editando aquella
-- (no se toca una migracion ya aplicada).
--
-- `notas_internas_conversacion_id_tenant_id_fkey` se declaro
-- `ON DELETE SET NULL` sobre la clave COMPUESTA (conversacion_id, tenant_id). PostgreSQL
-- acepta el DDL, pero SET NULL sobre una clave compuesta anula TODAS sus columnas: al
-- borrar una conversacion intentaria poner `tenant_id = NULL` en la nota, que es NOT NULL.
-- Resultado: el DELETE de cualquier conversacion con notas falla en tiempo de ejecucion,
-- y falla en produccion, no aqui. Peor aun, el borrado en cascada de un tenant se
-- atasca en medio.
--
-- PostgreSQL 15+ permite acotar que columnas anula. Es exactamente el caso de uso.
-- Reversible: volver a la forma anterior es el mismo ALTER sin la lista de columnas.
-- Seguro en caliente: la tabla esta vacia de esta clave foranea (columna recien creada),
-- y aun si no lo estuviera, revalidar una FK no toma ACCESS EXCLUSIVE prolongado.
-- =============================================================================

ALTER TABLE "notas_internas" DROP CONSTRAINT "notas_internas_conversacion_id_tenant_id_fkey";
ALTER TABLE "notas_internas" ADD CONSTRAINT "notas_internas_conversacion_id_tenant_id_fkey"
  FOREIGN KEY ("conversacion_id", "tenant_id") REFERENCES "conversaciones" ("id", "tenant_id")
  ON DELETE SET NULL ("conversacion_id") ON UPDATE RESTRICT;
