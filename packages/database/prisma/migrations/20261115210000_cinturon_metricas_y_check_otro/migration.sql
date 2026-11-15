-- =============================================================================
-- T-233 — cinturón: superficie de `viajapro_metricas` en FUNCIONES y el CHECK de OTRO por definición
--
-- SOLO COMPROBACIONES: no cambia esquema, filas ni privilegios. Existe porque el cinturón de
-- 20261115200000 ya está aplicado y no se edita (CLAUDE.md §10), y le faltaban dos cosas que la
-- auditoría de T-230/T-232 dejó en la cola (R13):
--
--   1. La superficie de `viajapro_metricas` se fijaba en COLUMNAS. En funciones: el rol es dueño
--      EXACTAMENTE de `public.medir_cola_de_salida` (una función SECURITY DEFINER más suya
--      ejecutaría con sus privilegios), y ninguna función le concede EXECUTE (fuera de la
--      entrada implícita que el dueño tiene en el ACL de las suyas).
--   2. El CHECK `motivos_de_perdida_otro_exige_nota` se comprobaba por NOMBRE. Un CHECK con el
--      mismo nombre y otra expresión (p. ej. `true`) pasaba. Aquí se compara `pg_get_constraintdef`
--      normalizado (sin espacios, paréntesis, comillas dobles ni los casts que el motor añade a
--      `clave`, que es VARCHAR(32)) con la expresión que escribió 20261115200000 §2.
--
-- Las mismas tres aserciones están en `tests/aislamiento.spec.ts` (T-233).
--
-- **Segura en caliente:** solo lee el catálogo. **REVERSIBLE** trivialmente: no hay nada que
-- deshacer; si alguna comprobación falla, la migración no entra y nada cambió.
-- =============================================================================
DO $$
DECLARE
  propias text[];
  concedidas text[];
  definicion text;
  normalizada text;
BEGIN
  -- 1a. Dueño exactamente de medir_cola_de_salida, en cualquier esquema.
  SELECT array_agg(format('%s.%s', n.nspname, p.proname) ORDER BY n.nspname, p.proname)
    INTO propias
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proowner = 'viajapro_metricas'::regrole;
  IF propias IS DISTINCT FROM ARRAY['public.medir_cola_de_salida'] THEN
    RAISE EXCEPTION 'viajapro_metricas debe ser dueño solo de public.medir_cola_de_salida; lo es de: %', propias;
  END IF;

  -- 1b. Ningún EXECUTE concedido a viajapro_metricas. Se excluye la entrada del propio dueño,
  -- que el motor materializa en el ACL de medir_cola_de_salida al revocar a PUBLIC.
  SELECT array_agg(p.oid::regprocedure::text ORDER BY 1)
    INTO concedidas
    FROM pg_proc p, aclexplode(p.proacl) x
   WHERE x.grantee = 'viajapro_metricas'::regrole
     AND p.proowner <> x.grantee;
  IF concedidas IS NOT NULL THEN
    RAISE EXCEPTION 'Funciones que conceden EXECUTE a viajapro_metricas: %', concedidas;
  END IF;

  -- 2. El CHECK de OTRO, validado y con la expresión de 20261115200000 §2:
  --    CHECK ("clave" IS DISTINCT FROM 'OTRO' OR "exige_nota")
  SELECT pg_get_constraintdef(c.oid) INTO definicion
    FROM pg_constraint c
   WHERE c.conrelid = 'public.motivos_de_perdida'::regclass
     AND c.conname = 'motivos_de_perdida_otro_exige_nota'
     AND c.contype = 'c'
     AND c.convalidated;
  IF definicion IS NULL THEN
    RAISE EXCEPTION 'Falta (o no está validado) motivos_de_perdida_otro_exige_nota.';
  END IF;
  normalizada := regexp_replace(definicion, '::character varying|::text|[[:space:]()"]', '', 'g');
  IF normalizada IS DISTINCT FROM 'CHECKclaveISDISTINCTFROM''OTRO''ORexige_nota' THEN
    RAISE EXCEPTION 'motivos_de_perdida_otro_exige_nota no tiene la expresión esperada: %', definicion;
  END IF;
END;
$$;
