# ADR-0027 — `viajapro_ajustes` y `actualizar_zona_horaria_de_la_agencia`: escribir en `tenants` sin que el `WHERE` de la app sea la frontera

- **Estado:** Aceptado (2026-11-15, por delegación expresa del propietario). Registra lo que hace
  la migración `20261116090000_funcion_zona_horaria_de_la_agencia`, auditada antes de integrarse.
  No decide nada que la migración no haga: pone en la arquitectura lo que el SQL ya es.
- **Fecha:** 2026-11-15
- **Decide:** propietario (delegado), a propuesta de `arquitecto`
- **Consultados:** `datos` (autor de la migración), `auditor-seguridad`
- **Amplía:** [ADR-0008](0008-resolucion-de-tenant-en-webhooks-entrantes.md) §1.3 (roles) y su
  inventario de funciones `SECURITY DEFINER` (§1.2, §1.4, §5), ya corregido por
  [ADR-0010](0010-webhook-tal-como-es-y-el-trabajador-en-apps-api.md) §1.2. No supersede nada: no
  contradice ninguna regla de los dos, añade un rol y una función que las cumplen. Es la misma
  vía que siguieron [ADR-0011](0011-autenticacion-y-tenant-de-sesion.md) con `viajapro_accesos` y
  [ADR-0026](0026-rol-viajapro-metricas-y-medir-cola-de-salida.md) con `viajapro_metricas`.

---

## Contexto

**Fuerza: aislamiento entre agencias en una tabla sin RLS.** `PATCH /api/v1/agencia/ajustes`
necesita escribir `tenants.zona_horaria`. `tenants` es una tabla **global**, exceptuada de RLS en
`excepciones_rls`, y su declaración para `viajapro_app` es `{SELECT}`: la API solo lee. En una
tabla sin RLS, el `WHERE` de la consulta es la única frontera entre una agencia y otra; un bug ahí
(un `WHERE` olvidado, un id equivocado) reescribiría la fila de otra agencia sin que la base lo
impidiera.

Todo lo que sigue se contrastó con
`packages/database/prisma/migrations/20261116090000_funcion_zona_horaria_de_la_agencia/migration.sql`.

## Opciones consideradas

### A — `GRANT UPDATE (zona_horaria)` a `viajapro_app` (rechazada)

- **Gana:** la solución más corta: un `UPDATE` desde el repositorio de la API.
- **Cuesta:** la aplicación elige la fila. Sin RLS en `tenants`, su `WHERE` es la única frontera:
  es exactamente el diseño que «depende de que un programador recuerde filtrar». Además
  `viajapro_app` deja de ser «solo lee» sobre `tenants` y la declaración `{SELECT}` de
  `excepciones_rls` tendría que cambiar.
- **Cierra:** la garantía de que la API no puede escribir ninguna fila de `tenants`.

### B — Reutilizar un dueño `NOLOGIN` existente (rechazada)

- **Gana:** ningún rol nuevo en el inventario.
- **Cuesta:** junta superficies. `viajapro_accesos` o `viajapro_metricas` tienen cada uno la
  superficie mínima de su función; añadirles `UPDATE` sobre `tenants` hace que un cambio de cuerpo
  en cualquiera de sus funciones alcance también esa escritura, y viceversa.
- **Cierra:** que cada propietario tenga la superficie mínima de su función.

### C — Rol nuevo `viajapro_ajustes` + función `SECURITY DEFINER` (elegida)

Descrita abajo.

- **Gana:** la base elige la fila (la del contexto), no la aplicación; `viajapro_app` sigue sin
  ningún privilegio de escritura sobre `tenants`; superficie de tres columnas.
- **Cuesta:** un rol y una función `SECURITY DEFINER` más en el inventario, con auditoría
  obligatoria de cada cambio de cuerpo.
- **Cierra:** nada que no estuviera ya cerrado.

## Decisión

**C.** Es la única que permite escribir en `tenants` sin convertir el `WHERE` de la aplicación en
la frontera entre agencias y sin ampliar la superficie de un dueño existente.

### 1. El rol `viajapro_ajustes` (se añade a ADR-0008 §1.3)

- `NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`. Si existe `neon_superuser`
  y el rol es miembro, se le revoca.
- `USAGE` sobre `public`. Privilegios **solo de columna** sobre `tenants`: `SELECT (id)` y
  `UPDATE (zona_horaria, actualizado_en)`. Ningún privilegio de tabla: ni el nombre, ni el slug,
  ni el estado de la agencia, ni ninguna tabla de negocio.
- `CREATE` sobre `public` se le presta para crear la función y se le retira en la misma migración.
- **Miembros:** ningún rol de login **de aplicación** (los de `roles_de_login_vigilados`). El rol de
  migraciones sí lo es, con `SET TRUE, INHERIT FALSE`: puede ponérselo para crear la función como
  su dueño, pero no hereda sus privilegios. Es el mismo arreglo que `viajapro_accesos` y
  `viajapro_metricas`. El propio `viajapro_ajustes` no es miembro de ningún rol.

### 2. La función `actualizar_zona_horaria_de_la_agencia(zona text) RETURNS text` (entra en el inventario de ADR-0008/ADR-0010)

- `SECURITY DEFINER`, `LANGUAGE plpgsql`, `VOLATILE` (escribe), `SET search_path = ''` y todo
  cualificado, sin SQL dinámico. **No** es `STRICT`, a propósito: con `STRICT` una zona `NULL`
  devolvería `NULL` sin escribir y la API respondería 200 a un cambio que no ocurrió. Creada bajo
  `SET ROLE viajapro_ajustes`, de modo que el dueño es el correcto desde el principio. Cumple las
  cuatro reglas de ADR-0008 §1.4.
- **La agencia sale solo de `app.current_tenant`**, nunca de un parámetro: la firma no tiene por
  dónde nombrar otra agencia. El contexto tiene que ser un uuid canónico (8-4-4-4-12); vacío,
  ausente o con otra forma es un error.
- **La zona** tiene que existir en `pg_catalog.pg_timezone_names` (coincidencia exacta) y no ser
  uno de los alias que el tzdata de Postgres conoce y el ICU de Node no: `posix/%`, `right/%`,
  `localtime`, `posixrules`, `Factory`. La zona guardada la consume `Intl.DateTimeFormat`.
- **Escritura:** `UPDATE public.tenants SET zona_horaria = zona, actualizado_en = now() WHERE id =
  <uuid del contexto>`. Sin `RETURNING`. Devuelve la zona guardada.
- **`EXECUTE`:** revocado a `PUBLIC` inmediatamente después de crearla; concedido solo a
  `viajapro_app`. `viajapro_altas`, `viajapro_webhook` y `viajapro_identidad` no la ejecutan.
- La declaración de `tenants` para `viajapro_app` en `excepciones_rls` **sigue siendo `{SELECT}`**:
  la migración no la toca.
- Es la **decimocuarta** función `SECURITY DEFINER` según el comentario de la migración. Todo
  cambio de su cuerpo pasa por `auditor-seguridad`.

### 3. El contrato de errores (la API traduce por SQLSTATE, no por texto)

| SQLSTATE | Mensaje | Caso | HTTP |
|---|---|---|---|
| `22023` invalid_parameter_value | `zona_horaria_invalida: …` | Zona `NULL`, ausente de `pg_timezone_names` o alias excluido | 422 |
| `42501` insufficient_privilege | `agencia_sin_contexto: …` | `app.current_tenant` vacío, ausente o no es un uuid canónico. Error de programación | 500 |
| `P0002` no_data_found | `agencia_inexistente: …` | El uuid del contexto no corresponde a ninguna agencia (`UPDATE` de 0 filas) | 500 (o 404) |

Además, la función aborta con `P0003` (`agencia_ambigua`) si el `UPDATE` alcanzara más de una
fila. Con `id` como clave primaria es inalcanzable; si ocurre, se trata como 500.

### 4. Qué protege y qué no

Igual que RLS en las tablas de negocio, la función confía en `app.current_tenant`, que fija el
propio rol de la aplicación: **no defiende de quien fije el contexto de otra agencia** (una
inyección SQL que haga `set_config`), y ahí RLS tampoco. Lo que cierra es el caso que la opción A
abría: con el contexto de A, ningún error de la aplicación alcanza la fila de B, porque la
aplicación no elige la fila.

### 5. Verificación

La propia migración aborta si el rol puede iniciar sesión, saltarse RLS o es superusuario; si
conserva `CREATE` sobre `public`; si su superficie efectiva de columnas no es exactamente
`tenants.id:SELECT`, `tenants.zona_horaria:UPDATE` y `tenants.actualizado_en:UPDATE`; si tiene algún
privilegio de tabla; si es miembro de algún rol; si un rol de `roles_de_login_vigilados` puede
actuar como él; si es dueño de algo más que esta función o alguien le concede `EXECUTE` sobre otra;
si la función no es `SECURITY DEFINER` con `search_path` vacío y la firma `(zona text) -> text`; si
`PUBLIC`, `viajapro_altas`, `viajapro_webhook` o `viajapro_identidad` pueden ejecutarla o
`viajapro_app` no; si `viajapro_app` tiene `INSERT`, `UPDATE`, `DELETE` o `TRUNCATE` de tabla, o
`UPDATE`/`INSERT` de columna, sobre `tenants`; o si la declaración de `tenants` para `viajapro_app`
dejó de ser `{SELECT}`. Según su comentario, las mismas aserciones están en
`tests/aislamiento.spec.ts` («Ajustes de la agencia»).

## Consecuencias

### Positivas

- La única escritura de la API sobre `tenants` tiene la fila elegida por la base, no por la
  aplicación.
- `viajapro_app` sigue sin ningún privilegio de escritura sobre `tenants`; `excepciones_rls` no
  cambia.
- El patrón «dueño `NOLOGIN` por columnas + función que toma la agencia del contexto» queda escrito
  para el siguiente ajuste de agencia que viva en `tenants`.

### Negativas

- Una función `SECURITY DEFINER` y un rol más en el inventario que audita ADR-0008.
- Cada nuevo campo de ajustes en `tenants` exige ampliar la superficie de columnas del rol (y su
  cinturón) o escribir otra función: no se añade con un cambio de la API.
- El límite de §4 sigue abierto, como en RLS.

### Qué habría que cambiar para revertir esto

En una migración nueva, después de que la API deje de llamarla:
`DROP FUNCTION public.actualizar_zona_horaria_de_la_agencia(text)`, `REVOKE ALL ON TABLE
public.tenants FROM viajapro_ajustes` (también los de columna), `REVOKE viajapro_ajustes FROM <rol
de migraciones>` y `DROP ROLE viajapro_ajustes`, que es global al clúster: solo si ninguna otra
base lo usa. Sin datos.

## Cuándo revisar esta decisión

- Si otro ajuste de la agencia en `tenants` necesita escritura: decidir si se amplía este rol y su
  superficie de columnas o se crea otra función, y escribirlo antes (R7).
- Si alguien propone que la función reciba la agencia como parámetro: eso devuelve la elección de
  la fila a la aplicación y necesita ADR y auditoría propios.
- Si `tenants` deja de ser global o pasa a tener RLS.

---

> Este ADR no se edita. Si cambia la función o el rol, se escribe uno nuevo que lo supersede.
