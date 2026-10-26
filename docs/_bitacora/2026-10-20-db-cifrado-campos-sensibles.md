# 2026-10-20 — ADR-0015, la parte del esquema (datos)

**Qué pasó:** rama `feat/db-cifrado-campos-sensibles`, sobre `origin/docs/adr-0015-campos-sensibles`
(el ADR aceptado). M1.4 del roadmap v2. Solo esquema: el servicio de cifrado es de `backend`.

## Lo que entra

- **Migración** `packages/database/prisma/migrations/20261020120000_cifrar_columnas_con_pii_sensible/`.
  Las cinco columnas se borran y cada una pasa a cuatro: `<col>_cifrado bytea`, `<col>_nonce bytea`
  (12), `<col>_tag bytea` (16) y `<col>_clave_version smallint` (≥ 1), con
  `CHECK num_nonnulls(...) IN (0, 4)` y CHECK de formato. `notas_internas`: las cuatro NOT NULL.
  Se retira `mensajes_texto_trgm_idx`. Se rehace `conversaciones_ultimo_mensaje_completo` con la
  columna nueva (el `DROP COLUMN` la habría borrado en silencio). CHECK nuevo
  `adjuntos_clave_objeto_opaca`: `<tenant_id de la fila>/<uuid>`.
- **Filas existentes** (solo desarrollo, ADR «Por qué ahora»): el claro se destruye con el `DROP
  COLUMN`, sin convivencia ni marcador. Las notas de desarrollo se **borran**; las `clave_objeto`
  que no cumplen se anulan con su `descargado_en`. **No reversible** en el contenido; declarado en
  la cabecera de la migración.
- **`schema.prisma`** con los veinte campos `Bytes`/`Int @db.SmallInt`.
- **Semillas** (`seed.ts`, `seed-demo-crm.ts`): ya no escriben claro. El hilo demo queda sin texto
  y sin notas hasta que `backend` siembre por la primitiva.
- **Aserciones** en `aislamiento.spec.ts`: 67 (claro ausente, tipos), 68 (restricciones
  validadas + el motor rechaza filas mal formadas), 69 (sin trigram), 70 (clave opaca, dentro de la
  38), 71 (lista declarada de columnas de texto en tablas con tenant, concreción 7). Los fixtures
  existentes cifran de verdad (AES-GCM, clave de corrida).
- **Contratos:** sin cambios. La API descifra.
- Doc: `docs/02-arquitectura/03-modelo-de-datos.md`, sección «Columnas cifradas (ADR-0015)».

## Verificación

- En local: `prisma validate`, `prisma format`, `typecheck` y `lint` de `@viajapro/database`
  verdes; `guarda-mutaciones.spec.ts` verde; la migración la acepta el parser de PostgreSQL 16
  (`libpg-query`, 31 sentencias).
- **NO verificado contra una base.** CI bloqueado por facturación, sin Postgres local (no hay
  Docker) y Neon prohibido. `pnpm db:migrate` desde cero y la suite de aislamiento quedan **para
  el CI**. La lista de la aserción 71 se generó desde `schema.prisma`, no desde el catálogo: si el
  catálogo trae una columna de texto declarada solo en SQL, la 71 la nombrará en rojo.
- **`apps/api` no compila** en esta rama hasta que `backend` adapte los adaptadores. Es la lista
  de abajo; el compilador la vigila.

## Para `backend`

**Columnas** (las cuatro de cada una; `<col>_clave_version` es la `v<n>` de la maestra):

| Tabla.columna en claro (ya no existe) | Columnas nuevas (Prisma) | Nulable | Id del AAD | Tope antes de cifrar |
|---|---|---|---|---|
| `mensajes.texto` | `textoCifrado/Nonce/Tag/ClaveVersion` | sí | `mensajes.id` | sin tope (Meta) |
| `conversaciones.ultimo_mensaje_texto` | `ultimoMensajeTextoCifrado/…` | sí | `conversaciones.id` | 200 car. |
| `contactos.preferencias` | `preferenciasCifrado/…` | sí | `contactos.id` | 2.000 car. |
| `notas_internas.texto` | `textoCifrado/…` | **no** | `notas_internas.id` | 2.000 car. |
| `adjuntos.nombre_archivo` | `nombreArchivoCifrado/…` | sí | `adjuntos.id` | 255 car. |

Tipo: `Bytes` (bytea) ×3 + `Int` (smallint). Nonce 12 bytes, tag 16, versión ≥ 1: si no, la base
rechaza la fila (CHECK). **Todo id de una fila con columna cifrada se genera en la aplicación
antes del INSERT** (concreción 3); hoy los `create` lo dejan al `DEFAULT`.

**Dónde se cifra:**
- Entrantes: `apps/api/src/modules/inbox/infrastructure/bandeja.prisma.ts:65` (`texto`), `:86`
  (`nombreArchivo`) y `:110` (`ultimoMensajeTexto`), llamados desde `procesar-change.ts` (trabajador).
- Salientes: `conversaciones.prisma.ts:414` (`texto`) y `:427` (`ultimoMensajeTexto`).
- Notas: `conversaciones.prisma.ts:~486-494` (`crearNota`) y `crm/infrastructure/puertos-de-crm.prisma.ts:72`.
- Preferencias: no hay escritura hoy en la API; la semilla `seed-demo-crm.ts` la tenía.

**Dónde se descifra:**
- `inbox/infrastructure/mapeo.ts:15/32` (`texto`) y `:51/78` (`ultimoMensajeTexto`): hilo y bandeja.
- `conversaciones.prisma.ts:329/340` (`nombreArchivo` de adjuntos) y `:619-626` (notas).
- `crm/infrastructure/crm.prisma.ts:191` (notas), `:324/337` (`preferencias`, ficha del contacto).
- `crm/infrastructure/puertos-de-crm.prisma.ts:95` (notas del panel).

**Consultas que hoy usan el claro para buscar o listar:**
- `conversaciones.prisma.ts:145`: `mensajes.some.texto contains … insensitive` en
  `ConsultarBandeja.buscar`. **Se quita**: la búsqueda queda en nombre y teléfono del contacto
  (concreción 5).
- Ninguna otra filtra por estas columnas; la bandeja **lista** con `ultimoMensajeTexto` (descifrar
  30 filas por página).

**Pruebas que rompen:** `inbox-visibilidad.e2e-spec.ts:159/181/498/576`,
`inbox-tiempo-real.e2e-spec.ts:134`, `inbox-relay.e2e-spec.ts:260` (SQL crudo con `texto`).

**Pendiente de `backend`, por el ADR:** la primitiva en `apps/api/src/shared/cifrado/`, aborto sin
`CAMPOS_SENSIBLES_KEY`, sembrar cifrado (las semillas no pueden importar de `apps/api`; o se mueve
la primitiva a un paquete o la semilla se corre desde la API), y la mitad 1 de la concreción 7
(e2e por la API: el texto sembrado no aparece en ninguna de las cinco columnas con SQL directo),
vista en rojo antes del arreglo.

## Cola (no bloquea)

- La aserción 71 compara solo en un sentido (columnas nuevas sin declarar). Las declaradas que
  desaparezcan no la ponen en rojo. Dueño: `datos`.
