# 2026-10-19 — Cotizaciones con versiones inmutables: el esquema (tarea 6)

Agente: `datos`. Rama: `feat/quoting-cotizaciones-esquema`, desde `origin/main` (v0.21.2, `59c8004`).
El caso de uso y la ruta de la API quedan para `backend`.

## Qué entra

- `20261019200000_cotizaciones_con_versiones_inmutables`:
  - `cotizaciones` es la cabecera, mutable y con borrado en blando.
  - `versiones_cotizacion` es la instantánea inmutable.
  - Las dos tienen RLS forzada con `aplicar_aislamiento_tenant()`.
  - Todas sus foráneas son compuestas con `tenant_id`.
  - `mensajes.cotizacion_id` recibe por fin su foránea compuesta, `NOT VALID` y después
    `VALIDATE`. Era la cola de `ESTADO.md` con dueño `datos`.
- `20261019200100_margen_desconocido_es_nulo` corrige un defecto de la anterior. Ver abajo.
- `schema.prisma` gana los modelos `Cotizacion` y `VersionCotizacion`, el enum `EstadoCotizacion`
  y las relaciones inversas.
- `borrar-tenants.mjs` declara la purga: `set_config('viajapro.purga_de_tenants', ids, true)`.
- Aserciones 47 a 52 y mutaciones M8 a M13.

Diseño y razones en `docs/02-arquitectura/03-modelo-de-datos.md`, § «Cotizaciones».

## Lo que se aprendió por el camino

- **Una acción en cascada corre como el propietario de la tabla.** El primer borrador colgaba la
  versión de la cabecera con `ON DELETE CASCADE`, y la salida de purga del disparador exige ser
  propietario y haber fijado una variable de sesión. La variable la puede fijar cualquier rol. Con
  esos dos datos, un `DELETE FROM cotizaciones` desde la API habría borrado versiones. Se cambió a
  `RESTRICT` antes de aplicar.
- **Un CHECK que da NULL pasa.** `margen = venta - neto` con neto nulo y margen 0 entraba. Lo
  encontró la aserción 50 en el primer intento contra Neon. La migración ya estaba aplicada, así
  que la corrección va en una segunda migración (`IS NOT DISTINCT FROM`) y no editando la primera.
- **`TRUNCATE` de una tabla referenciada lo rechaza el motor antes de llegar al disparador.** La
  aserción usa `TRUNCATE … CASCADE` dentro de `ROLLBACK` para probar el disparador y no la foránea.

- **`INSERT … RETURNING` pasa la fila nueva también por el `USING`.** La mutación M9
  (`WITH CHECK (true)` en versiones) salió verde en la primera corrida: la escritura cruzada se
  rechazaba por el `RETURNING` y no por el `WITH CHECK`. La aserción 48 inserta ahora sin
  `RETURNING`, y M9 se pone roja.

## Verificación (Neon, `neondb`)

- Las dos migraciones se ensayaron primero en una base desechable con la cadena completa desde
  cero. Después se aplicaron con `migrate deploy`.
- `aislamiento.spec.ts`: 57 de 57 en verde tres veces seguidas.
- `mutaciones-aislamiento.mjs`: 13 de 13 en rojo, de las cuales M8 a M13 son nuevas.
  `tablas_sin_aislamiento` queda vacía al terminar.
- lint, typecheck, build (sin caché) y format:check en verde. Las pruebas pasan en contracts (56),
  domain (70) y database (57). En api pasan 256 y un archivo falla porque este `.env` no tiene
  `WHATSAPP_DIRECTORY_PEPPER`. Es del entorno y no tiene relación con este cambio.

## Pendiente (cola, no bloquea)

- Contratos Zod de la cotización guardada: los escribe `backend` con el caso de uso. La tabla no
  exige ninguno nuevo. `CotizacionResumen` ya existe y se sirve de la cabecera más la versión enviada.
- Semilla de la agencia demo sin cotizaciones: la alimentará el caso de uso de `backend`.
- `QuoteOption` y `QuoteItem` del lenguaje ubicuo no tienen tabla. Hoy una versión es una opción
  con sus líneas en JSONB. Cuando llegue la cotización con alternativas, se decide si una opción es
  una versión hermana o una tabla.
