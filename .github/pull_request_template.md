<!--
  Este PR pasa por la compuerta del agente `integrador`.
  Rellenarlo no es trámite: es lo que el integrador verifica. Un PR sin esto se devuelve.
-->

## Qué hace

<!-- Una o dos frases. Qué cambia para el usuario o para el sistema. -->

## Por qué

<!-- La fuerza que lo motiva. Enlaza la historia de usuario, el ADR o la entrada de ESTADO.md. -->

## Cómo verificarlo

<!-- Pasos concretos para comprobar que funciona. No "probar la funcionalidad". -->

---

## Compuertas

- [ ] `pnpm typecheck` en verde
- [ ] `pnpm lint` en verde
- [ ] `pnpm test` en verde — **todas**, ninguna omitida
- [ ] `pnpm build` en verde

## Verificaciones del proyecto

- [ ] **Tabla nueva** → lleva `tenant_id`, RLS con `USING` **y** `WITH CHECK`, y su prueba de aislamiento
- [ ] **Sin secretos** en el historial de esta rama (tokens, claves, `.env`)
- [ ] **Documentado (R14)** → lo hecho en `ESTADO.md`, `DIARIO.md` o la bitácora (en este PR o en el de cierre del lote), lo que viene en `roadmap/tasks.yaml` y en la hoja de ruta, y la decisión estructural en un ADR
- [ ] **Sin importaciones directas entre módulos** (regla R4)
- [ ] **Contrato cambiado** → sus consumidores están actualizados
- [ ] **Migración nueva** → es segura en caliente y compatible con la versión anterior en ejecución
  (las migraciones corren ANTES del despliegue: durante minutos la versión vieja usa el esquema nuevo).
  Marca solo lo que aplique y explica el resto en «Riesgos»:
  - [ ] Solo **expande**: tabla/columna/índice nuevos; nada se borra ni se renombra en este PR
  - [ ] Columna nueva `NOT NULL` → lleva `DEFAULT` (la versión vieja no la conoce y sigue insertando)
  - [ ] Sin `DROP COLUMN`/`DROP TABLE`/`DROP TYPE`, sin `ALTER ... TYPE`, sin `RENAME`, sin `SET NOT NULL` sobre lo existente; si hace falta, es el paso **contraer** y la versión que dejó de usarlo ya lleva ≥1 despliegue en producción
  - [ ] Probado: la **suite de la versión anterior (`main`)** pasa contra el esquema nuevo
  - [ ] Índice sobre tabla grande → `CREATE INDEX CONCURRENTLY` o tabla pequeña (sin bloqueo largo)
  - [ ] Tabla/rol/función nuevos → el aviso `compat-migraciones` (no obligatorio) no marcó nada, o cada aviso está justificado arriba
- [ ] **Ninguna migración ya aplicada fue editada**
- [ ] **Sin `any`** en TypeScript
- [ ] **Dinero en enteros** (unidad mínima de la moneda; en COP, el peso) + ISO-4217, nunca coma flotante
- [ ] **Webhook o job nuevo** → es idempotente

## Auditoría

- [ ] Toca datos de tenants, credenciales, pagos o PII → **`auditor-seguridad` ejecutado**
- [ ] Más de 300 líneas de lógica → `auditor-codigo` ejecutado
- [ ] Toca el modelo de negocio del turismo → `experto-turismo` consultado

## Hilo documental

- [ ] `ESTADO.md` refleja lo que esta rama completó
- [ ] Hay entrada en `docs/_bitacora/`
- [ ] Decisión estructural → su ADR está escrito
- [ ] Ningún documento de `docs/` quedó mintiendo por este cambio
- [ ] Término nuevo del dominio → está en `docs/01-producto/02-lenguaje-ubicuo.md`

---

## Versión propuesta

<!-- SemVer. Ruptura → MAYOR · funcionalidad → MENOR · corrección → PARCHE -->

`v0.0.0`

## Riesgos y qué vigilar tras integrar

<!-- Qué podría salir mal. Si la respuesta es "nada", piénsalo otra vez. -->
