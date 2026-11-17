# ADR-0026 — `viajapro_metricas` y `medir_cola_de_salida`: una lectura entre agencias sin saltarse RLS

- **Estado:** Aceptado (2026-11-15, por delegación expresa del propietario). Registra lo que ya
  integró el PR #268 (`46e88a6`, T-223) tras la auditoría de seguridad de T-223/T-214, cuyo
  dictamen fue «integrable». No decide nada nuevo: pone en la arquitectura lo que la migración ya es.
- **Fecha:** 2026-11-15
- **Decide:** propietario (delegado), a propuesta de `arquitecto`
- **Consultados:** `datos` (autor de la migración), `auditor-seguridad` (auditoría de T-223)
- **Tarea:** T-231
- **Amplía:** [ADR-0008](0008-resolucion-de-tenant-en-webhooks-entrantes.md) §1.3 (roles) y su
  inventario de funciones `SECURITY DEFINER` (§1.2, §1.4, §5), ya corregido por
  [ADR-0010](0010-webhook-tal-como-es-y-el-trabajador-en-apps-api.md) §1.2. No supersede nada: no
  contradice ninguna regla de los dos, añade un rol y una función que las cumplen. Es la misma
  vía que siguió [ADR-0011](0011-autenticacion-y-tenant-de-sesion.md) con `viajapro_accesos`.

---

## Contexto

**Fuerza: cumplimiento y auditabilidad de la frontera entre agencias.** ADR-0008 es la
especificación contra la que se audita el aislamiento, y enumera los roles y las funciones que
pueden cruzar esa frontera. El PR #268 añadió las dos cosas que más importan en esa lista —un rol
propietario nuevo y una función `SECURITY DEFINER` que **lee entre agencias**— sin que ningún ADR
las nombrara. R7 pide escribir el ADR antes; aquí se escribe después, y queda dicho.

La necesidad operativa: el trabajador publica en `/salud/listo` la antigüedad del envío saliente
pendiente más viejo de todo el sistema. Esos envíos viven en `mensajes`, con `tenant_id` y RLS
forzada; `viajapro_webhook` solo ve la agencia de su `app.current_tenant`, y ningún rol se salta RLS
(R2, aserción 14). Sin una función `SECURITY DEFINER`, la medida no existe.

Todo lo que sigue se contrastó con
`packages/database/prisma/migrations/20261115140000_medir_cola_de_salida/migration.sql`.

## Opciones consideradas

### A — Dueño con `BYPASSRLS`

- **Gana:** la consulta más simple: un `min`/`count` sobre toda la tabla.
- **Cuesta:** es la opción E de ADR-0008, rechazada allí: un rol que se salta RLS es una brecha a
  un cambio de cuerpo de distancia, y la aserción 14 lo pone en rojo.
- **Cierra:** la garantía de que ningún rol del sistema se salta RLS.

### B — Política adicional en `mensajes` para el dueño, o excepción en `excepciones_rls`

- **Gana:** sin bucle; una sola consulta.
- **Cuesta:** `mensajes` deja de tener solo la política canónica; toda auditoría futura de esa
  tabla tiene que razonar sobre dos políticas. Y `mensajes` no es una tabla global: declararla
  excepción sería falso.
- **Cierra:** la uniformidad de `aplicar_aislamiento_tenant` sobre las tablas de negocio.

### C — Reutilizar `viajapro_staging` como dueño

- **Gana:** ningún rol nuevo.
- **Cuesta:** `viajapro_staging` ya ve los criptogramas de todas las agencias en el staging;
  darle además `mensajes` junta dos superficies en un solo dueño.
- **Cierra:** que cada propietario tenga la superficie mínima de su función.

### D — Rol nuevo `viajapro_metricas`, privilegios por columna, recorrido por agencia (elegida)

Descrita abajo.

- **Gana:** RLS intacta, superficie de columnas, salida de dos enteros.
- **Cuesta:** una consulta por agencia cada 30 s; un rol más en el inventario.
- **Cierra:** nada que no estuviera ya cerrado.

## Decisión

**D.** Es la única que cruza la frontera sin debilitar ninguna de las garantías de ADR-0008: el
dueño ve exactamente una agencia en cada consulta, como la API.

### 1. El rol `viajapro_metricas` (se añade a ADR-0008 §1.3)

- `NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`. Si existe
  `neon_superuser` y el rol es miembro, se le revoca.
- `USAGE` sobre `public`. `SELECT` **solo de columnas**: `mensajes (tenant_id, estado, wamid,
  creado_en)` y `tenants (id)`. Ningún privilegio de tabla; no puede leer `texto_cifrado` aunque
  alguien cambie el cuerpo de la función.
- `CREATE` sobre `public` se le presta para crear la función y se le retira en la misma migración.
- **Miembros:** ningún rol de login **de aplicación** (los de `roles_de_login_vigilados`). El rol de
  migraciones sí lo es, con `SET TRUE, INHERIT FALSE`: puede ponérselo para crear la función como
  su dueño, pero no hereda sus privilegios. Es el mismo arreglo que `viajapro_accesos`.

### 2. La función `medir_cola_de_salida()` (entra en el inventario de ADR-0008/ADR-0010)

- `SECURITY DEFINER`, `LANGUAGE plpgsql`, `VOLATILE` (llama a `set_config`), `SET search_path =
  ''` y todo cualificado, sin SQL dinámico, sin argumentos. Creada bajo `SET ROLE
  viajapro_metricas`, de modo que el dueño es el correcto desde el principio. Cumple las cuatro
  reglas de ADR-0008 §1.4.
- **Salida:** una fila con dos enteros, `mas_vieja_s` (segundos del pendiente más viejo, 0 si no
  hay) y `pendientes` (cuántos, acotado a `2147483647`). Ni ids de mensaje ni de agencia, ni texto,
  ni desglose por agencia. La forma de la salida **es** la frontera.
- **Predicado:** `estado = 'PENDIENTE' AND wamid IS NULL`, el de `idx_mensajes_envios_pendientes`.
- **Cómo cruza agencias:** guarda el `app.current_tenant` del llamador, recorre `tenants` y, para
  cada una, fija `app.current_tenant` con `set_config(..., true)` (local a la transacción) y cuenta.
  Al terminar devuelve el contexto al valor del llamador (`''` si no tenía). Si falla, el error
  aborta la transacción o el punto de guardado del llamador y el cambio de GUC se deshace con ella.
  No usa `SET app.current_tenant` en la cabecera: PostgreSQL ≥ 15 lo rechaza para un dueño sin
  superusuario.
- **`EXECUTE`:** revocado a `PUBLIC` inmediatamente después de crearla; concedido solo a
  `viajapro_webhook` (el trabajador, que publica la medida en Redis). `viajapro_app`,
  `viajapro_altas` y `viajapro_identidad` no la ejecutan: la API lee la medida de Redis.
- Es la **decimotercera** función `SECURITY DEFINER` según el comentario de la migración. Todo
  cambio de su cuerpo pasa por `auditor-seguridad`, como las demás.

### 3. Verificación

La propia migración aborta si el rol puede iniciar sesión o saltarse RLS, si conserva `CREATE`, si
tiene algún privilegio de tabla, si puede leer `texto_cifrado`, si la función no es `SECURITY
DEFINER` de `viajapro_metricas` con `search_path` vacío, si `PUBLIC` o alguno de los otros tres roles
de aplicación puede ejecutarla, o si un rol de `roles_de_login_vigilados` es miembro del dueño.
`aislamiento.spec.ts` la incluye en las aserciones 12, 13, 14 y 20 (matriz de `EXECUTE` y dueño
esperado) y en la prueba `T-223` del bloque del inbox. El diagrama y el porqué operativo están en
`docs/02-arquitectura/03-modelo-de-datos.md` («Cola de salida medida entre agencias»).

## Consecuencias

### Positivas

- ADR-0008 vuelve a enumerar todo lo que cruza la frontera: rol y función quedan nombrados con su
  superficie, y el próximo auditor no los encuentra por sorpresa.
- El patrón «dueño NOLOGIN por columnas que recorre agencias fijando el contexto» queda escrito
  para la siguiente métrica entre agencias, en vez de reinventarse con `BYPASSRLS`.

### Negativas

- Una lectura entre agencias más. Su salida es agregada, pero un cuerpo modificado por error podría
  devolver más: la defensa es la superficie por columnas y la auditoría obligatoria de cada cambio.
- El coste crece con el número de agencias (una consulta por agencia cada 30 s), aunque sobre un
  índice parcial casi vacío.
- La restauración del contexto ante un error descansa en la semántica transaccional de
  PostgreSQL, no en una prueba: T-230 la añade.
- Este ADR llega después de la implementación, contra R7.

### Qué habría que cambiar para revertir esto

- `DROP FUNCTION public.medir_cola_de_salida()`, `REVOKE` de las columnas y `DROP ROLE
  viajapro_metricas`, en una migración nueva. Sin datos. El trabajador tolera su ausencia y
  publica `sin_verificar`.

## Cuándo revisar esta decisión

- Si hace falta una segunda métrica entre agencias: decidir si se amplía este rol (y su superficie
  de columnas) o se crea otro, y escribirlo antes.
- Si el número de agencias hace que el recorrido deje de medirse en milisegundos.
- Si alguien propone desglosar la medida por agencia: eso cambia la forma de la salida, que es la
  frontera, y necesita ADR y auditoría propios.

---

> Este ADR no se edita. Si cambia la función o el rol, se escribe uno nuevo que lo supersede.
