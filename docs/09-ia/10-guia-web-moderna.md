# Guía web moderna de Google Chrome en la capa de agentes

> Estado: **medido y adoptado en el código; la instalación del plugin espera al propietario.**
> Fecha: 2026-11-22. Tarea: T-617. Lo pidió el propietario tras encontrar el repositorio.

## 1. Qué es

[`GoogleChrome/modern-web-guidance`](https://github.com/GoogleChrome/modern-web-guidance) es un
conjunto de *skills* para agentes de código, mantenido por los equipos de **Google Chrome, Microsoft
Edge, Mozilla Firefox y MDN**. Su descripción literal: «Keep your coding agent up to date with the
latest web best practices».

El problema que ataca es exactamente el nuestro: los modelos arrastran patrones viejos de su
entrenamiento y escriben JavaScript pesado donde la plataforma web ya tiene algo nativo. Son **262
funcionalidades** y **204 casos de uso**, en 235 ficheros Markdown, agrupados en disciplinas
(accesibilidad, CSS, formularios, rendimiento, seguridad, componentes de interfaz, transiciones…).

Licencia: **Apache-2.0** el repositorio; las guías llevan además CC-BY 4.0 y derivan de MDN, W3C,
WHATWG e IETF.

## 2. Revisión de seguridad hecha antes de proponerlo

La documentación de Claude Code avisa de que «un plugin puede ejecutar código arbitrario en tu
máquina con tus privilegios». Así que **se clonó y se revisó el repositorio entero** en el commit
`64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65` (etiqueta `Release v1.0.1`, 2026-11-16). Resultado:

| Qué se buscó | Qué hay |
|---|---|
| `hooks/hooks.json` (comandos de shell) | **No existe** |
| `.mcp.json` (servidores MCP fuera del cajón) | **No existe** |
| `bin/`, `*.sh`, `*.mjs` ejecutables | **No existe ninguno en el repositorio** |
| Ficheros que no sean `.md`, `.json`, `.toml` o imágenes | **Ninguno** |

El `package.json` declara un `bin` que apunta a `skills/modern-web-guidance/modern-web.mjs`, y **ese
fichero no está en este repositorio**: se construye en `modern-web-guidance-src` y se publica en npm.

**Conclusión, y es la que importa:** instalar el *plugin* trae **solo texto**. Lo que ejecuta código
es la CLI de npm, que la propia skill invoca con `npx -y modern-web-guidance@latest`. Son dos
superficies distintas y conviene no confundirlas.

Por eso la entrada del marketplace se fija con `ref` al commit revisado y no a `main`: si se deja en
`main`, lo que se revisó puede cambiar en disco sin que nadie lo mire.

## 3. Lo que el analizador encontró en ViajaPro (medido, no supuesto)

`legacy-scan` no es consejo genérico: lee el código y señala sitios concretos. Ejecutado el
2026-11-22 con `DISABLE_TELEMETRY=1`:

| Dónde | Hallazgos |
|---|---|
| `apps/web` | **11**, todos de `js/copying-array-methods` |
| `apps/api` | **17**: 13 de `copying-array-methods`, 1 `error-cause`, 1 `promise-with-resolvers`, 2 `structured-clone` |
| `packages/database` | **1** (`error-cause`) |
| `packages/domain`, `packages/contracts` | **0** |

Cubre 38 de las guías con reglas deterministas, «~20 % del corpus». No es una auditoría completa.

### Qué se aplicó y qué no

- **Se aplicó** `copying-array-methods` (`[...arr].sort()` → `arr.toSorted()`, etc.). Es ES2023 y
  `tsconfig.base.json` ya declara `"target": "ES2023"` y `"lib": ["ES2023"]`: no hubo que tocar
  ningún tsconfig. Tareas T-615 (web) y T-616 (API).
- **Se aplicó** `error-cause`, porque encaja con una regla propia: «nunca `catch` silencioso»
  (CLAUDE.md §6).
- **NO se aplicó** `error-cause` en `notifications/interface/consumidor-de-correo.ts`. Ahí el error
  **se despoja a propósito por R10**: el original puede traer la dirección o el cuerpo del correo. El
  código ya lo decía en un comentario y con un `eslint-disable preserve-caught-error`. **Aplicado a
  ciegas habría metido datos personales en un log.** Es el falso positivo más caro de los cuatro.
- **NO se aplicó** `structured-clone` en los dos sitios que lo pedían
  (`confirmar-importacion.use-case.ts` y `catalogo.prisma.ts`). Ahí `JSON.parse(JSON.stringify(x))`
  **no es una copia profunda: es un normalizador a algo serializable en JSON** — uno de los dos
  devuelve `as JsonValue`. `structuredClone` conserva `Date`, `Map`, `Set` y `undefined` con otra
  semántica, así que cambiaría lo que acaba escrito en una columna JSON de Postgres.
- **NO se aplicó** `promise-with-resolvers`: `Promise.withResolvers` es ES2024 y nuestro `lib` es
  ES2023, así que no está tipado. Subir el `lib` es una decisión aparte.

**La lección operativa:** de 29 hallazgos, **4 había que descartarlos tras leerlos**, y uno de ellos
—el de `error-cause`— habría sido un **defecto de privacidad**. La herramienta avisa de ello
(«Static analysis results are provisional — verify against the Keep/Drop criteria»), pero el aviso
solo sirve si alguien lo cumple. **Ningún hallazgo se aplica sin leer el sitio.**

Dicho de otro modo: la guía acierta en el 86 % y el 14 % restante incluye cosas que ninguna regla
estática puede saber, porque dependen de decisiones nuestras escritas en comentarios y en las reglas
de `CLAUDE.md`. **Sirve para encontrar, no para decidir.**

## 4. Precedencia frente a nuestras skills

Igual que ya pasa con `frontend-design`, esta guía **no manda sobre lo que el proyecto ya fijó**:

1. **`CLAUDE.md`** y el lenguaje ubicuo, siempre primero. R8 (dinero en enteros), R9 (fechas en UTC),
   R3 (contratos en `packages/contracts`) no se negocian con una guía externa.
2. **`diseno-web`**, la skill propia: tokens, densidad de herramienta de trabajo, lenguaje de interfaz.
   Es la que define cómo se ve y se siente ViajaPro.
3. **`modern-web-guidance`**: *cómo* implementar eso con la plataforma web, no *qué* implementar.

Dicho corto: **la guía de Chrome decide la técnica; `diseno-web` decide la forma.** Si chocan, manda
`diseno-web`, y el choque se anota.

Tampoco se dispara para todo: su propia descripción excluye backend (SQL, ORM, rutas de API),
infraestructura y herramientas. En ViajaPro eso significa `apps/web` y poco más.

## 5. Lo que falta, y por qué no lo puede hacer un agente

**La instalación del plugin la tiene que hacer el propietario.** Dos motivos, los dos verificados:

1. **`.claude/**` es ruta protegida** (`ownership.json`) y además el clasificador del modo automático
   deniega que una sesión escriba en `.claude/settings.json`: es la barrera que impide que un agente
   se conceda permisos a sí mismo. **No se rodeó.**
2. **Una sesión en la nube no carga `extraKnownMarketplaces`**, porque eso exige el diálogo de
   confianza de la carpeta, que en la nube no aparece. O sea: aunque se commiteara, **las sesiones de
   nube como esta seguirían sin el plugin**. Quien lo aprovecha es Claude Code en la máquina del
   propietario.

Y aun commiteado, cada colaborador debe correr **una vez por clon**:

```sh
claude plugin install modern-web-guidance@googlechrome --scope project
```

### Fragmento exacto para `.claude/settings.json`

Se fusiona con lo que ya hay (`permissions`, `hooks`, `env`); **no se sobrescribe el fichero**.

```jsonc
{
  "env": {
    "APP_ENV": "local",
    "DISABLE_TELEMETRY": "1"
  },
  "extraKnownMarketplaces": {
    "googlechrome": {
      "source": {
        "source": "github",
        "repo": "GoogleChrome/modern-web-guidance",
        "ref": "64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65"
      }
    }
  },
  "enabledPlugins": {
    "modern-web-guidance@googlechrome": true
  }
}
```

Y en `permissions.allow`, para que las sesiones puedan llamar al analizador sin preguntar cada vez:

```jsonc
"Bash(npx -y modern-web-guidance@latest:*)",
"Bash(npx modern-web-guidance:*)"
```

`DISABLE_TELEMETRY=1` no es opcional aquí: la CLI envía telemetría por omisión, y este es un
repositorio con datos de clientes reales en el horizonte.

## 6. Mientras tanto, lo que sí funciona hoy

**La CLI no necesita el plugin.** Cualquier sesión, y el CI, pueden usarla:

```sh
DISABLE_TELEMETRY=1 npx -y modern-web-guidance@latest legacy-scan apps/web
DISABLE_TELEMETRY=1 npx -y modern-web-guidance@latest search "light dismiss dialog"
DISABLE_TELEMETRY=1 npx -y modern-web-guidance@latest retrieve "<id-de-la-guia>"
```

La búsqueda es **local** (BM25 más un modelo de embeddings embebido): no hace falta red ni clave de
API una vez descargado el paquete.

Queda en la cola decidir si `legacy-scan` entra como comprobación del CI. **No se ha decidido**: hoy
son 8 checks obligatorios y añadir uno que depende de un paquete de npm externo que puede cambiar de
versión es justo el tipo de cosa que hay que pensar antes, no después.
