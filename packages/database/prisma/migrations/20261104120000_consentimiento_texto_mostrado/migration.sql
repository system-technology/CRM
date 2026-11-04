-- =============================================================================
-- T-096 — consentimiento del viajero: guardar el texto mostrado y la versión del aviso
--
-- `consentimientos_contacto` ya existe (T-075) con finalidad, canal, prueba, fecha de otorgamiento
-- y de revocación. Para DEMOSTRAR el consentimiento (Ley 1581, docs/05-seguridad/02) faltaba lo
-- que se le mostró al titular y con qué versión del aviso de privacidad.
--
-- Solo dos columnas NULABLES, sin DEFAULT ni reescritura: ADD COLUMN nullable es metadato en
-- Postgres 16 y no recorre la tabla. Las filas existentes (migradas de `contactos.consentimientos`)
-- quedan en NULL: no hay texto que inventar para ellas.
--
-- Tabla existente: la RLS, los privilegios y la entrada en aislamiento.spec.ts ya la cubren y no
-- cambian. **REVERSIBLE** con una migración posterior: DROP COLUMN de las dos.
-- =============================================================================

ALTER TABLE "consentimientos_contacto"
  ADD COLUMN "texto_mostrado" VARCHAR(2000),
  ADD COLUMN "version_aviso"  VARCHAR(40);
