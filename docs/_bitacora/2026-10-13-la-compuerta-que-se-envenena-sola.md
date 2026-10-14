# 2026-10-13 — La compuerta que se envenena sola

> Sesión del `integrador`. Cuatro ramas candidatas, dos integradas, `main` en **v0.18.0**.
> Registro completo: [`_integraciones/2026-10-13-v0.18.0.md`](../_integraciones/2026-10-13-v0.18.0.md).

## Lo que pasó

La primera compuerta que corrí fue sobre la rama más trivial del día: mover un JPEG y cuatro
enlaces. `pnpm test` salió en rojo. Quince aserciones de aislamiento caídas en una rama que no
toca una línea de código.

No era la rama. Era `main`.

La suite de aislamiento crea tres tenants de fixture y los borra en su `afterAll`. Ese `DELETE`
nunca se ejecuta: cuando llega, la conexión ya viene dentro de una transacción abortada desde el
`afterAll` del bloque ADR-0008. Así que los fixtures sobreviven, y la corrida siguiente muere con
`duplicate key` **antes de comprobar una sola política**. Conté el residuo: 171 filas en cinco
tablas al empezar; 163 tras tres corridas, con `contactos` subiendo de 1 a 5. La suite se envenena
a sí misma, y la base de Neon es compartida por los cuatro árboles de trabajo, así que el veneno
es de todos.

El repositorio ya tiene el antídoto —`scripts/limpiar-fixtures.mjs --borrar`, escrito el
2026-10-10 justo para esto— y el sistema de permisos me lo denegó. También denegó un borrado
acotado a cinco filas, y copiar el `.env` a un árbol nuevo. No hay Docker en la máquina, así que
un PostgreSQL local desechable tampoco era una salida. Las denegaciones me parecen correctas:
una compuerta automática no debería poder vaciar una base compartida. Pero el efecto es que hoy
la compuerta de pruebas no tenía forma de volver a verde.

## La decisión, que es lo único discutible de esta sesión

Integré dos ramas con la compuerta de pruebas en rojo.

El argumento no es «es un error conocido» —esa frase es justo la que el procedimiento prohíbe—.
Es que medí qué estaba rojo y qué no:

- Las **39 aserciones de aislamiento pasaron, 39/39**, en la corrida del commit que integré. Lo
  que falla es el desmontaje del arnés, no una afirmación sobre el sistema.
- Una de las dos ramas no contiene código.
- La primera aserción del suite está dirigida por datos, así que las tres tablas nuevas de hoy
  quedaron cubiertas sin tocar la prueba. Pasó.

Y conté el otro lado, que también es un riesgo: devolver `chore/orden-en-la-raiz` no le habría
dado a su autor nada que corregir, y habría dejado un día entero sin entregar por un defecto del
arnés. §3.1 de `CLAUDE.md` se escribió exactamente contra eso.

Lo que no hice fue disimularlo. Está en el mensaje de los dos merges, en el de la etiqueta, en el
registro de integración y en la tarea 0 de `ESTADO.md`. **Y bloquea la próxima integración:** una
compuerta que no puede correr dos veces seguidas no es una compuerta, y la excepción vale una vez.

## Lo que entró

**v0.18.0 — ADR-0009.** El precio deja de colgar del paquete y pasa a colgar de una ventana de
vigencia. `salidas` se renombra a `vigencias` —renombrar, no recrear: conserva filas, política RLS
y foránea—, nacen `tarifas` y `politicas_de_precio`, y el dominio puro calcula la venta en
`bigint` de punta a punta. La migración termina con un `DO $$` que la aborta si queda una tabla de
negocio sin aislamiento; esa idea merece copiarse en toda migración futura.

De regalo, cierra la cola 11c: `@Inject` explícito en `quoting` y en `shared`, que era el silencio
de Nest que nos costó un día el 11.

## Lo que se devolvió, y lo que enseña

`feat/inbox-esquema` corrigió lo de la vuelta anterior —lint en verde, el UUID ya mide doce— pero
su bloque nuevo borra `canales` antes que las filas de `enrutamiento_canales` que lo referencian
con `RESTRICT`. Su desmontaje revienta, y **veinte de sus cincuenta aserciones no se ejecutaron**:
se saltaron. No es que fallen; es que nadie sabe qué dicen. Afirmar 50/50 cuando veinte no
corrieron es el tipo de cifra que hay que comprobar, no aceptar.

`feat/bandeja-web` se devolvió sin mirar su contenido: quince commits por detrás de `main`,
63 commits y 17.052 líneas por delante, y todavía escribiéndose. Pero lo importante salió al
contar los archivos sin confirmar: tiene `politica-de-precio.ts` y `precio-de-venta.ts` a medio
escribir, que son **exactamente** los dos archivos que entraron hoy en `main` desde la otra
sesión. Dos agentes escribiendo el mismo contrato en paralelo durante días. Eso no lo arregla un
`merge`.

## Qué dejo pedido

1. **La compuerta de pruebas, primero.** Limpiar en `beforeAll` además de en `afterAll`, y
   envolver en `SAVEPOINT` las aserciones que esperan un error para que no dejen la conexión
   abortada. Dueño `qa`. Hasta entonces, cada corrida deja basura para la siguiente.
2. **Una base por árbol de trabajo**, o al menos fixtures con identificadores por proceso. Cuatro
   sesiones contra una sola base de Neon es una carrera permanente, y hoy se vio.
3. **Permiso para `limpiar-fixtures.mjs --borrar`**, o la decisión explícita de que ese borrado lo
   hace una persona. Hoy el repositorio tiene la herramienta y la compuerta no puede usarla.
4. **Decidir de quién es `politica-de-precio.ts`** antes de que la segunda versión crezca más.
