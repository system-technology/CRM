# 2026-10-20 — ADR-0015, la parte de aplicación (backend)

**Qué pasó:** rama `feat/db-cifrado-campos-sensibles`, sobre la migración de `datos` (a16f937). M1.4 del
roadmap v2. `apps/api` vuelve a compilar.

## Lo que entra

- **`apps/api/src/shared/cifrado/`**: `PuertoCifradoDeCampos` (clase abstracta, token de inyección con
  `@Inject` explícito), `CifradoDeCampos` (`node:crypto`, sin dependencias nuevas) y `CifradoModule`
  (`@Global`, lo importan `SharedModule` y `WorkerModule`: solo la API y el trabajador tienen la clave).
  - HKDF-SHA256, sal fija de 32 bytes, `info` = `viajapro/<tabla>.<columna>/v<n>/` ‖ tenant (16 bytes).
  - AES-256-GCM, IV aleatorio de 96 bits generado dentro (no se acepta por parámetro).
  - AAD = longitud(etiqueta) (2 bytes) ‖ etiqueta ‖ tenant (16) ‖ id de fila (16) ‖ código de columna (1).
  - Clave: `CAMPOS_SENSIBLES_KEY` (hex de 64 o base64 de 32 bytes), `_VERSION` y `_PREVIOUS`. **La anterior
    solo vale para la versión `n-1`.** Sin clave o sin versión válida, la fábrica lanza y el proceso no arranca.
    La clave no sale en ningún mensaje.
  - `CampoCifradoIlegibleError` (`CAMPO_CIFRADO_ILEGIBLE`): sin contenido ni ids; el filtro global lo
    traduce a **500**, no a 400, porque es un fallo nuestro.
- **Escritura cifrada**, con el id generado en la aplicación antes del INSERT (`randomUUID()`):
  `bandeja.prisma.ts` (texto, nombre de adjunto, vista previa), `conversaciones.prisma.ts` (respuesta y
  vista previa), `puertos-de-crm.prisma.ts` (notas). Nombre de adjunto con tope de 255 antes de cifrar.
- **Lectura descifrada**: `mapeo.ts` (`aMensaje` y `aResumen` reciben el puerto), `conversaciones.prisma.ts`
  (adjuntos), `crm.prisma.ts` (notas y preferencias), `puertos-de-crm.prisma.ts` (notas del panel).
- **El socket**: `LecturaDeMensajesPrisma` y `LecturaDeConversacionesPrisma` leen bajo RLS con el tenant
  del evento y descifran con `aMensaje`/`aResumen` antes de emitir. El outbox y Redis siguen llevando
  solo ids: nada cambió ahí.
- **Búsqueda**: se quitó la rama `mensajes.some.texto contains`. `ConsultarBandeja.buscar` mira solo
  nombre y teléfono del contacto. El contrato (`packages/contracts/src/inbox.ts`) conserva el campo
  `buscar`; **solo cambió el comentario** (antes decía «y texto de los mensajes»). Sin cambio de forma.
- **Semillas**: las de `packages/database` no pueden importar la primitiva. Nuevo script
  `pnpm --filter @viajapro/api campos:sembrar-dev` (`src/shared/cifrado/sembrar-campos-dev.ts`): usa el
  mismo servicio y `CAMPOS_SENSIBLES_KEY` del entorno (no hay clave en el repo), exige `APP_ENV=local` y
  anfitrión local, es idempotente y solo toca `agencia-demo`. Siembra el hilo demo, la vista previa, las
  preferencias de los contactos y cuatro notas.
- **Entorno**: `.env.example` (tres variables vacías), `ci.yml` (genera la clave efímera por job),
  `generar-secretos-locales.ps1` (la genera en hex), `vitest.setup.ts` (efímera si falta, como
  `BETTER_AUTH_SECRET`).

## Pruebas

- **Unitarias** (`cifrado-de-campos.spec.ts`, 18): ida y vuelta, Unicode y vacío; nonce de 12, etiqueta
  de 16, versión; 5.000 cifrados sin repetir nonce ni criptograma; AAD trasplantado a otra fila, otro
  tenant y otra columna falla; fila manipulada; dos agencias, criptogramas distintos; rotación (la anterior
  abre, sin anterior no, solo `n-1`); nulables; el error no lleva contenido; la configuración aborta sin
  clave o versión. Más un caso del filtro (500).
- **e2e para el CI** (`inbox-visibilidad.e2e-spec.ts`, describe «cifrado en reposo»): tras crear un
  mensaje saliente, una nota y un entrante con adjunto, SQL directo sobre las columnas demuestra que no hay
  texto en claro (bytes y fila entera) y la API lo devuelve descifrado; dos agencias con el mismo texto
  producen criptogramas distintos. Las e2e que escribían claro (`inbox-visibilidad`, `inbox-tiempo-real`,
  `inbox-relay`) ahora cifran con el servicio real vía `cifradoDePrueba()`. La búsqueda por texto de
  `inbox-visibilidad` pasó a búsqueda por nombre, más una prueba de que el texto ya no es buscable.

## Verificación

- **En local, verde:** `pnpm typecheck` (9/9), `pnpm lint` (7/7), `vitest` sin las e2e: 41 archivos, 460 pruebas.
- **NO verificado — solo para el CI** (facturación bloqueada, sin Postgres local, Neon prohibido):
  todas las `*.e2e-spec.ts`, incluida la nueva suite de cifrado en reposo, y la migración de `datos` contra
  una base. No se dan por verificadas.
- No se ejecutó `campos:sembrar-dev` (escribe en la base).

## Para Antigravity (web)

- `apps/web/src/components/bandeja/lista-conversaciones.tsx:210`: el placeholder dice «Buscar por cliente o
  mensaje... (/)». La búsqueda ya no mira el texto de los mensajes: cambiarlo a «Buscar por nombre o
  teléfono... (/)». Sin otro cambio: el parámetro `buscar` y la forma de la respuesta son los mismos.
- Si alguna pantalla promete encontrar una conversación por una palabra del mensaje (texto de vacío,
  ayuda, pruebas), corregirla. En el hilo abierto la búsqueda puede hacerse en el cliente.

## Cola (no bloquea)

- **Tope de 2^32 cifrados por clave derivada** (concreción 2): el servicio no puede contar entre procesos;
  lo vigila el trabajo de recifrado con la cuenta sacada de la base. Ese trabajo no existe todavía. Dueño: `backend`.
- **`contactos.preferencias` no tiene escritura en la API**; hoy solo la siembra el script. Cuando exista,
  debe cifrar con `columnasDePreferencias`. Dueño: `backend`.
- La clave maestra debe registrarse con custodio y copia fuera de Render en
  `docs/05-seguridad/02-proteccion-de-datos.md` §5. Dueño: `devops` / `auditor-seguridad`.
- `vitest.setup.ts` fabrica una clave efímera si falta: si una e2e lee filas escritas por otra corrida con
  otra clave, dará `CAMPO_CIFRADO_ILEGIBLE`. Los fixtures se crean y borran en la misma corrida.
