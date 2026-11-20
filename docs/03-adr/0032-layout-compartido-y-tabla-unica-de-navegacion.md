# ADR-0032 — Layout compartido `(app)` y tabla única de navegación

- **Estado:** Aceptado (2026-11-20, por el propietario: «acepto el ADR-0032»). La compuerta de sesión pasó por una pasada de `auditor-seguridad` antes de integrar el ADR como propuesta.
- **Fecha:** 2026-11-20
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto` (redacta). **Pendientes:** `auditor-seguridad` (dónde queda la
  compuerta de sesión, §2), `frontend` (N1–N2), `diseno-ux` (nombres), `dueno-de-producto` (contenido
  del menú y de la barra móvil, §6).
- **Origen:** `docs/_auditorias/2026-11-20-auditoria-de-navegacion.md` §3.3, §4.2, §4.4 y §6 (T-314).

---

## Contexto

**Fuerza: acoplamiento por copia en el frontend.** No es estética, es la causa de defectos ya vistos:

- 12 páginas importan `BarraModulos` y la montan cada una a su manera. `/seguimientos` no la monta y
  queda sin salida; en Cotizaciones y Reservas la barra no llega abajo; `/`, `/cotizaciones` y
  `/cotizaciones/[id]` no marcan ningún ítem activo (auditoría §3.3).
- La barra se **desmonta en cada navegación**: vuelve a pedir los pendientes del día y a suscribirse
  al socket, y pierde su estado.
- La lista de módulos está copiada **tres veces** con nombres distintos: `modulos` en
  `components/bandeja/barra-modulos.tsx`, `ACCIONES_RAPIDAS` en `lib/buscador-global-logica.ts` y
  `CONFIGURACION_MODULOS` en `components/comun/iconos-modulos.tsx`. Además la barra móvil está
  escrita a mano, y los H1 y `document.title` («ViajaPro» en todas) van por libre. Resultado: una
  pantalla con cuatro nombres (§3.4), y «Reservas» contradice el lenguaje ubicuo.

`CLAUDE.md` §5 fija `app/<ruta>/` «plano, sin (dashboard)/». Cambiarlo es estructura (R7). Por eso
este ADR.

## Opciones consideradas

### A — Seguir con `BarraModulos` por página (no hacer nada)
- **Gana:** cero movimiento de archivos y ningún conflicto con ramas en curso.
- **Cuesta:** cada pantalla nueva puede olvidar la barra; los defectos de §3.3 se arreglan uno a
  uno y reaparecen. La barra sigue remontándose en cada navegación.
- **Cierra:** nada, y por eso mismo no resuelve nada.

### B — Un `layout.tsx` por segmento (`bandeja/`, `pipeline/`, `viajes/`…)
- **Gana:** las URL y las rutas de archivo no se mueven.
- **Cuesta:** 13 layouts casi idénticos: la misma copia que hoy, un nivel más arriba. Y la barra se
  sigue remontando al pasar de un segmento a otro, porque Next solo conserva los layouts comunes.
- **Cierra:** nada, pero tampoco gana lo que buscamos.

### C — El layout raíz decide en tiempo de ejecución si pinta el marco (`esRutaPublica(pathname)`)
- **Gana:** no se mueve ningún archivo.
- **Cuesta:** la estructura queda en un `if` de cliente en vez de en el árbol de rutas; la vista
  imprimible necesita una excepción más en una lista; el marco (con su socket y sus llamadas) se
  monta en el cliente antes de saber si hacía falta.
- **Cierra:** la posibilidad de comprobar la estructura mirando el sistema de archivos.

### D — Grupo de rutas `app/(app)/` con un layout que monta el marco una vez
- **Gana:** el marco se monta una sola vez y sobrevive a la navegación. Las URL no cambian, porque
  los grupos no cuentan en la ruta. La frontera entre privado y público se ve en el árbol y se
  puede probar.
- **Cuesta:** mover ~14 directorios con `git mv`, en un PR mecánico que choca con cualquier rama
  que toque páginas en ese momento.
- **Cierra:** nada que hoy usemos.

## Decisión

**Opción D, y una tabla única de navegación en `lib/navegacion.ts (en apps/web)`.** Es la única
opción que elimina la copia en vez de moverla, y su coste es de una sola vez.

### 1. Árbol de rutas

```
app/layout.tsx                  raíz: <html>, GuardaSesion (misma política, ciclo corregido §2), pie, banner de cookies
app/(app)/layout.tsx            MarcoDeTrabajo: barra lateral + barra inferior + <main id="contenido">
app/(app)/page.tsx              Hoy (/)
app/(app)/{bandeja,pipeline,cotizaciones,cotizador,viajes,seguimientos,contactos,catalogo,
          reportes,configuracion,bienvenida,ensayo}/
app/(impresion)/cotizaciones/[id]/imprimir/    privada y sin marco
app/{ingresar,login,iniciar-sesion,aceptar-invitacion,terminos,privacidad,cookies,
     politica-cookies}/, app/not-found.tsx, /salud                públicas, sin marco
```

- Las páginas pintan solo su contenido. Ninguna importa `BarraModulos`. `bandeja/layout.tsx`
  conserva sus columnas de lista e hilo, pero deja de montar la barra.
- La altura y el `overflow` de la región de trabajo los fija `MarcoDeTrabajo`, no cada página.
- `/ensayo` es privada y queda dentro de `(app)`, con marco, pero no aparece en el menú.

### 2. La compuerta de sesión no se mueve de sitio, pero su ciclo cambia

`GuardaSesion` **ya se monta una sola vez, en el layout raíz, y deniega por defecto**: todo lo que
no esté en `rutas-publicas.ts` exige sesión. Llevarla a `(app)/layout.tsx` la volvería permisiva por
defecto: una página creada fuera del grupo quedaría abierta sin que nada lo señale. Por eso se queda
donde está, y la política (qué exige sesión) y `rutas-publicas.ts` no se tocan (auditoría §6). Lo que sí
se añade es una prueba que obliga a que el árbol y la lista coincidan («Cómo se prueba»).

**Corrección tras la auditoría de seguridad (una pasada):** hoy `GuardaSesion` vuelve a `verificando` en
**cada** cambio de ruta y desmonta sus hijos, y eso remonta el marco aunque el layout sea compartido.
Para que «el marco se monta una vez» sea verdad, su **ciclo** cambia, sin relajar la política: verifica al
montar y al pasar de ruta pública a privada; **no** desmonta `children` al navegar entre privadas;
vuelve a `verificando` al cerrar sesión o al entrar en una ruta pública; un 401 de la API en cualquier
llamada redirige a `/ingresar`. Ese cambio va en su propio PR (N1), con prueba en `guarda-sesion.spec.tsx`
(privada → pública → privada exige nueva verificación) y revisión del `auditor-seguridad`.

**Cola (no bloquea):** la prueba de inventario debe cubrir también `route.ts` (hoy solo `salud`), rechazar
slots `@x` e interceptadas `(.)` salvo lista, y convertir bien ruta de archivo en URL; prohibir
`cookies()`/`headers()` o datos de servidor bajo `(app)` sin ADR; fijar con prueba que el cambio de agencia
siga recargando la página completa; y que el despliegue falle si `NEXT_PUBLIC_USE_REAL_AUTH` falta fuera
de local.

### 3. La tabla: `lib/navegacion.ts`

```ts
interface EntradaDeNavegacion {
  id: IdDeModulo;                 // estable; futura clave i18n `navegacion.<id>` (ADR-0020)
  etiqueta: string;               // = ítem del menú = comando de la paleta = H1 = título
  etiquetaCorta?: string;         // solo barra móvil; debe ser parte de `etiqueta`
  ruta: `/${string}`;
  icono: LucideIcon;
  grupo: 'hoy' | 'atender' | 'vender' | 'operar' | 'clientes' | 'agencia';
  permiso?: Permiso;              // tipo de @viajapro/contracts (R3). Solo oculta: autoriza la API
  prefijosActivos: readonly string[];
  movil: 'barra' | 'mas';
  detalleAPantallaCompletaEnMovil?: boolean;   // p. ej. /bandeja/[id]
}
export const NAVEGACION: readonly EntradaDeNavegacion[];
export const ACCIONES: readonly { id; etiqueta; ruta }[];   // «Cotizar» → /cotizador
export function moduloActivo(pathname: string): EntradaDeNavegacion | null; // gana el prefijo más largo
export function tituloDeDocumento(pantalla?: string): string;               // «{pantalla} · ViajaPro»
```

El menú objetivo, en este orden: **Hoy · Conversaciones · Oportunidades · Cotizaciones · Archivos de
viaje · Seguimientos · Contactos · Catálogo · Reportes · Configuración**. `/cotizador` y
`/cotizaciones/*` activan Cotizaciones. `/configuracion/*` y `/bienvenida` activan Configuración.
`CONFIGURACION_MODULOS` y `ACCIONES_RAPIDAS` se derivan de la tabla o desaparecen.

### 4. Qué lee cada pieza

| Pieza | Lee |
|---|---|
| Menú lateral | `NAVEGACION` filtrada por `permiso`, agrupada por `grupo`. Activo = `moduloActivo()`, con `aria-current="page"` |
| Barra móvil | Exactamente las 3 entradas con `movil: 'barra'` (`etiquetaCorta ?? etiqueta`), más «Buscar» y «Más». «Más» abre una hoja con las entradas `'mas'` y la campana. Se oculta en las subrutas con `detalleAPantallaCompletaEnMovil` |
| Paleta Ctrl+K | Un comando por entrada de `NAVEGACION` (con su `etiqueta`, filtrada por permiso), más `ACCIONES` |
| Migas | Solo en segundo nivel: `moduloActivo().etiqueta` → `ruta`, y la hoja la aporta la página (nombre, file). Nunca un nivel que no sea pantalla |
| H1 | `<TituloDePantalla />` en las páginas de primer nivel, que lee la `etiqueta`. Los detalles pintan su propio nombre |
| `document.title` | Un hook en `MarcoDeTrabajo` pone `tituloDeDocumento(moduloActivo()?.etiqueta)`. Los detalles lo sobrescriben con `tituloDeDocumento(nombre)` |

El título se fija en el cliente porque casi todas las páginas son `'use client'` y el nombre de un
detalle llega de la API. Exportar `metadata` por página obligaría a la opción B.

## Consecuencias

### Positivas
- Una pantalla nueva tiene marco por estar en `(app)/`. No hay que acordarse de nada.
- Cambiar un nombre es cambiar una línea, y las pruebas impiden que menú, paleta, H1 y título
  vuelvan a divergir.
- La barra deja de remontarse (siempre que la guarda adopte el ciclo de §2): menos llamadas, el socket no se resuscribe y el estado se conserva.

### Negativas
- **El PR de N1 mueve ~14 directorios.** Cualquier rama abierta que toque páginas va a chocar. Hay
  que hacerlo como un PR mecánico, solo `git mv` y quitar importaciones, y aprovechar una ventana
  con pocas ramas de frontend abiertas. `git log --follow` conserva la historia.
- El título del documento aparece después de la hidratación: hasta entonces se ve «ViajaPro».
- El menú filtrado por permiso puede dar una falsa sensación de control. **Ocultar no es
  autorizar.** La API sigue siendo la única que decide (ADR-0011).
- `BarraModulos` (1 000 líneas) no se parte en este ADR. Pasa a leer la tabla, pero sigue siendo un
  componente grande. Partirlo va a la cola.

### Qué habría que cambiar para revertir esto
- Sacar los directorios de `(app)/` y volver a montar la barra en cada página. La tabla puede
  sobrevivir sola: no depende del grupo.

## Riesgos abiertos
- **Página privada fuera del grupo, o pública dentro:** lo cubre la prueba de inventario de rutas.
- **Error de sesión que tapa la 404:** sigue igual. Es N8, con `auditor-seguridad`.
- **Contenido del menú:** que «Hoy» sea el destino tras ingresar, que el cotizador deje de ser
  módulo y qué tres módulos van en la barra móvil lo decide el `dueno-de-producto` (§6). Este ADR
  fija el mecanismo, no el contenido.

## Cómo se prueba

- **`navegacion.spec.ts`:** tabla ruta → módulo activo que cubre `/`, `/bandeja/abc`,
  `/cotizador`, `/cotizaciones/x`, `/viajes?id=…`, `/configuracion/whatsapp` y `/bienvenida`.
  `/ensayo` → `null`, pero solo por estar en una lista explícita. Además: ids y rutas únicos, orden
  igual al del menú objetivo, exactamente 3 entradas `'barra'` y `etiquetaCorta` contenida en
  `etiqueta`.
- **Inventario de rutas (spec sobre el sistema de archivos):** toda `page.tsx` fuera de `(app)/` y
  `(impresion)/` cumple `esRutaPublica`; toda la que está dentro, no. Ninguna página importa
  `BarraModulos` (también como `no-restricted-imports` de eslint en `app/**/page.tsx`).
- **`buscador-global-logica.spec.ts`:** los comandos son las entradas de `NAVEGACION`. «cotizaciones»
  y «seguimientos» devuelven su módulo.
- **e2e `03-paginas`, ampliado:** en cada ruta privada, a 1440 se ve la barra lateral con un solo
  `aria-current="page"` cuyo texto es la `etiqueta`. A 390 se ve la barra inferior, salvo en los
  detalles declarados a pantalla completa. En las pantallas de primer nivel, `h1` = `etiqueta` =
  comando de la paleta y `page.title()` = «{etiqueta} · ViajaPro».

## Cuándo revisar esta decisión

- Si aparece una segunda zona con su propio marco (portal del viajero, consola de plataforma): será
  otro grupo hermano, `(portal)`, no una excepción dentro de `(app)`.
- Si una agencia necesita ordenar u ocultar módulos por su cuenta: la tabla pasa a ser dato por
  tenant (R12) y hará falta un ADR nuevo.
- Si las páginas pasan a ser componentes de servidor con datos en el servidor: el título debería
  moverse a `generateMetadata`.

---

> Un ADR aceptado **no se edita jamás.** Si la decisión cambia, se escribe uno nuevo que lo supersede.
