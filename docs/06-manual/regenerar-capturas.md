# Cómo regenerar las capturas del manual

**Para quien mantiene el manual, no para la agencia.** Las capturas de `imagenes/` caducan cada vez que
cambia una pantalla (regla R14: el manual se actualiza en el mismo PR que la pantalla). Esta página
deja escrito cómo volver a tomarlas.

Todas son de **modo demostración**: la web con datos de muestra, sin API ni Postgres. Ninguna es de una
agencia real.

## Reglas

1. **Se capturan contra producción, no contra `next dev`.** `next dev` pinta la insignia de errores de
   Next y mete el HMR; una foto así no es lo que verá la agencia. Usa `next build` + `next start`.
   `next dev` y `next build` no comparten `.next`: al cambiar de uno a otro hay que recompilar.
2. **El aviso de cookies no se esconde.** Sale en la primera captura (ingreso) y se acepta antes de las
   demás. El paso 1 del recorrido del asesor lo documenta.
3. **Resolución:** ventana de 1280×800 con `deviceScaleFactor: 2`, porque las lee una persona.
4. **Las pantallas con datos que cambian por tareas en vuelo («Hoy», colores) se capturan al final**,
   cuando esas tareas ya entraron en `main`.

## Preparar el entorno

Desde la raíz del repositorio:

```bash
pnpm install --frozen-lockfile --filter @viajapro/web...
pnpm --filter @viajapro/contracts --filter @viajapro/domain build   # sin esto: "Can't resolve @viajapro/contracts"
cd apps/web && pnpm build && pnpm start                             # web en :3000
```

Playwright y Chromium vienen preinstalados en el entorno de las sesiones (`require('playwright')`
funciona desde cualquier carpeta). No hace falta Postgres ni la API.

## Entrar en modo demostración

El modo demostración se activa con `?demo=1` en la dirección, o con la clave de `localStorage`
`viajapro_modo_demo` igual a `true` (ver `apps/web/src/lib/modo-demo.ts`). Con él, las pantallas muestran
la insignia «datos de demostración» y entran directo a «Hoy».

**La pantalla de ingreso es un caso aparte, y exige dos compilaciones distintas.**

- `/ingresar` redirige a «Hoy» si el interruptor de autenticación está apagado. Para fotografiar el
  formulario hay que compilar con `NEXT_PUBLIC_USE_REAL_AUTH=true` (no necesita API para dibujarlo).
- Pero con esa compilación el modo demostración **ya no entra**: el guardián de sesión muestra «No
  pudimos verificar tu sesión», porque no hay API que la confirme.

Por eso: compila con `NEXT_PUBLIC_USE_REAL_AUTH=true`, toma solo `asesor-01-ingreso`, y vuelve a
compilar **sin** esa variable para todas las demás. El recuadro verde del formulario («Conectado a la
API y PostgreSQL en vivo») sale igual aunque no haya API: refleja la configuración, no una comprobación.

## Generar las capturas: un comando

[`capturas.mjs`](capturas.mjs) toma **todas** las capturas de una pasada, acepta el aviso de cookies una
sola vez y escribe cada imagen con su nombre final en `imagenes/`. Con la web ya sirviendo en :3000:

```bash
node docs/06-manual/capturas.mjs                      # todas menos el ingreso
node docs/06-manual/capturas.mjs --solo=asesor-02-hoy # solo algunas
node docs/06-manual/capturas.mjs --ingreso            # solo el ingreso (compilación con autenticación)
```

Si una captura falla, el script lo dice y sale con error; las demás se toman igual. Las que no se
pueden tomar o salen distintas a lo que describe el texto están anotadas dentro del propio script
(por ejemplo, «Mis números» en demostración: el usuario de muestra es dueño).

## Qué ruta da cada captura

| Imagen | Ruta o gesto |
|---|---|
| `asesor-01-ingreso` | `/ingresar` (compilación con autenticación activada), aviso de cookies a la vista |
| `asesor-02-hoy` | `/` |
| `asesor-03-conversaciones` | `/bandeja` |
| `asesor-04-conversacion-abierta` | `/bandeja`, abrir una conversación |
| `asesor-05-oportunidades` | `/pipeline` |
| `asesor-06-cotizador` | `/cotizador` |
| `asesor-07-cotizaciones` | `/cotizaciones` |
| `asesor-08-archivos-de-viaje` | `/viajes` |
| `asesor-09-archivo-de-viaje` | `/viajes`, pulsar «File 1043» |
| `asesor-10-registrar-pago` | Lo anterior y pulsar «Registrar pago» |
| `asesor-11-mis-numeros` | `/reportes` |
| `dueno-01-configuracion` | `/configuracion` |
| `dueno-02-etapas` | `/configuracion`, sección «Etapas del Pipeline» |
| `dueno-03-catalogo` | `/catalogo` |
| `dueno-04-datos-de-la-agencia` | `/configuracion`, sección «Marca y Datos Fiscales» |
| `dueno-05-reportes` | `/reportes` |

## Antes de dar por buena una captura

- Mírala: ¿se ve la insignia de errores de Next, un error rojo o un «No pudimos leer…»? Entonces está mal.
- ¿El texto del manual sigue diciendo lo que se ve? Una captura nueva con texto viejo es peor que ninguna.
- Si una pantalla dejó de ser real o dejó de ser maqueta, mueve su fila en
  [lo que este manual no cubre](03-lo-que-no-cubre.md).
