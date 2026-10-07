# 2026-10-07 — La primera interfaz, verificada en navegador

**Participantes:** Claude Opus 5, en sesión autónoma mientras el propietario dormía
**Alcance:** de "la API responde" a un producto que se ve y se usa, de Next.js a Neon.

---

## Qué se hizo

| Versión | Qué entró |
|---|---|
| — | Reparación del hilo: `ESTADO.md` se contradecía con el código |
| v0.9.0 | Sistema de diseño en Stitch + cotizador funcionando contra la API real |

**Sistema de diseño en Stitch.** Proyecto `8333038101997719867`, sistema `20525949899749456`.
Verde azulado `#0F766E`, Inter, esquinas de 8, esquema tonal. Los ocho principios de
`docs/01-producto/06-diseno-y-ux.md` van dentro del `designMd`, no en el prompt de cada
pantalla: así no hay que repetirlos y no se degradan entre generaciones.

**Pantalla de bandeja generada** — `docs/_assets/diseno/01-bandeja.png`. Respeta la dirección:
cuatro columnas densas, sin cabecera decorativa, ventana de 24 h en ámbar, SLA vencido en rojo.

**`apps/web`** — Next.js 15 con Tailwind 4. Tokens de diseño en `globals.css`, los mismos que se
subieron a Stitch. Cliente de API que **valida la respuesta** con el esquema de
`@viajapro/contracts`, no solo la petición. El cotizador no hace una sola operación aritmética:
todo número que muestra viene del servidor.

## Verificado en navegador real contra Neon

| Caso | Resultado |
|---|---|
| 2 ADT + 2 CHD en diciembre | "Temporada alta — diciembre", doble, 2 habitaciones, **$9.100.000 COP**, margen **$1.820.000 (20,0 %)** |
| 3 ADT en doble | **"1 plaza sin usar, se paga igual"** en ámbar |

Capturas en `docs/_assets/diseno/02-cotizador-real.png` y `03-plazas-sin-usar.png`.

El margen es lo más visible del panel, a propósito: es el dato que hoy ningún dueño de agencia
responde sin abrir Excel. El aviso de plaza vacía es la pregunta que el viajero hace siempre.

## Lo que costó tiempo

**1. El hilo estaba roto.** El hook de inicio inyectaba "no existe código de aplicación" cuando
el backend llevaba desde la v0.8.0 funcionando. `ESTADO.md` es la primera autoridad del
proyecto (CLAUDE.md §9); si miente, todas las sesiones siguientes arrancan desde una premisa
falsa. Se reparó antes de tocar nada más.

**2. `NEXT_PUBLIC_*` se incrusta al compilar, no al arrancar.** Definir la variable solo al
ejecutar deja el paquete con cadenas vacías, y el síntoma es un 401 sin pista de su origen.
Van en `apps/web/.env.local`.

**3. `pkill` no mata el servidor de Next en Windows.** Estuve depurando contra un build viejo que
seguía sirviendo. Hay que matarlo por puerto: `netstat` y `taskkill`.

## Limitación de Stitch, documentada

`list_screens` devuelve vacío aunque el proyecto tenga pantallas. Sin los identificadores no se
puede llamar a `get_screen` ni a `get_screen_code`. La bandeja se recuperó por la miniatura del
proyecto; el cotizador que generó Stitch no se pudo extraer.

No bloqueó nada, y conviene recordar por qué: **el código de Stitch nunca entra al repositorio.**
Sirve como dirección visual; la interfaz se construye a mano contra nuestros contratos. La
limitación encarece la exploración, no la producción.

## Qué aprendimos

**Compilar no es funcionar, y esta vez tampoco bastaba con que la API respondiera.** Los dos
defectos de entorno —la variable incrustada y el proceso zombi— pasaban el `typecheck` sin una
queja. La única evidencia aceptable fue abrir el navegador y leer la cifra en pantalla.

---

## Epílogo: el guardián devolvió la rama, y tenía razón

Al cerrar esta sesión, el agente `integrador` **rechazó** la rama de documentación. Al ejecutar sus
compuertas sobre ella descubrió algo que ninguna sesión anterior había visto: **v0.9.0 se etiquetó
declarando verificaciones que nunca se habían ejecutado.** Cuatro de las siete compuertas eran
imposibles de poner en verde desde el primer commit del proyecto — `lint` invocaba un ESLint que no
estaba instalado, `test` fallaba por los paquetes sin pruebas, `commitlint` no tenía hook, y
`format` referenciaba un plugin ausente.

Eso se reparó en **v0.9.1**, y la decisión de fondo quedó en
[`docs/_integraciones/2026-10-07-v0.9.1.md`](../_integraciones/2026-10-07-v0.9.1.md).

### Lo que esto enseña sobre el método

**Una compuerta que no puede ponerse en verde es peor que no tener compuerta.** No solo no
verifica: produce la impresión documentada de que algo se verificó. El registro de autorizaciones
de v0.9.0 lista `typecheck` y `build` y no menciona `lint` ni `test` — la ausencia estaba a la
vista y nadie la leyó como ausencia.

**El valor del `integrador` no es que integre: es que devuelva.** Un revisor que aprueba todo lo que
le llega no añade información al sistema. Esta es la primera vez que el guardián rechaza algo, y lo
que encontró no estaba en la rama que revisaba, sino debajo de ella.

**Y la confirmación de siempre:** el linter, en su primerísima pasada, encontró dos defectos reales
—el sobre de error leído a tientas, dos promesas sueltas— que llevaban publicados desde la víspera
y que `typecheck` daba por buenos. Compilar sigue sin ser funcionar.
