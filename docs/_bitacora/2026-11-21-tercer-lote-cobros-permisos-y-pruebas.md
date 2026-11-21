# 2026-11-21 — Tercer lote: cobros en pantalla, catálogo de permisos y estabilidad de pruebas

> Lote integrado por la sesión madre relevada a las 08:50 UTC. `main` al abrir: `3a494cd`.

## Qué entró

| PR | Tarea | Qué aporta |
|---|---|---|
| #414 (`4e3de11a`) | — | Relevo de la orquestadora, aviso al despertar y la trampa de los scopes de commitlint |
| #416 (`d7ce0289`) | T-505 → `done` | Una prueba compara el `CHECK` de la base con `PERMISOS` de contratos, en los dos sentidos |
| #415 (`87981c6b`) | T-510 → sigue `in_progress` | e2e de `apps/api` en serie y la prueba del índice sin depender del planificador |
| #410 (`e16f5499`) | T-331 → `done` | Registrar un pago y ver el saldo en el archivo de viaje |

`main` quedó en **`e16f5499`**, con cero PR abiertos. La cola abierta por la auditoría de #410 es
**T-513 a T-519**.

## El hallazgo del día: el sobrepago se verificó sin querer

La prueba de navegador de #410 falló al principio con «el diálogo no se cierra». La causa **no era un
fallo de la funcionalidad**: el archivo de la semilla vale $ 550.000 y la prueba intentaba pagar
$ 1.500.000 fijos. El servidor lo rechazó por sobrepago y la pantalla ofreció el checkbox para
confirmarlo — **el diálogo se quedó abierto porque debía quedarse**, que es lo que tiene que pasar
con un pago rechazado. La aserción estaba bien; el monto de la prueba estaba mal.

De paso, eso dejó verificado contra la API real el camino completo de sobrepago: rechazo del
servidor → mensaje → confirmación. No estaba previsto verificarlo en esta tarea.

La corrección fue derivar el pago del saldo real (`GET /archivos/:id/cobro`) en lugar de una
constante, y hacer que el fallo de la prueba **lea el mensaje del diálogo** en vez de decir solo que
seguía abierto. Esa segunda parte es la que habría ahorrado el diagnóstico.

## La auditoría independiente de #410, y por qué no se recortó

Es dinero en pantalla, así que además de la revisión de la sesión corrió una auditoría
independiente con `auditor-seguridad` (R13: en dinero, autenticación, aislamiento y datos
personales no se recorta). Encontró **tres bloqueantes**, los tres reales y verificados en el
código antes de devolverlos:

1. **El saldo a favor se pintaba en negativo.** El dominio es explícito
   (`packages/domain/src/cobro.ts:106`): «positivo = el viajero debe; **negativo = saldo a favor**».
   La web lo pasaba crudo a `formatearDinero`, así que el sobrepago se leía «Saldo a favor
   −$ 100.000», y la confirmación decía **siempre** «Falta por cobrar», sin mirar `situacion`:
   afirmaba una deuda inexistente con el signo al revés. Es exactamente el error que R8 avisa que
   se cobra caro.
2. **Doble cobro tras un fallo de red.** La clave de idempotencia era un `useState` **del
   diálogo**, así que cerrarlo y reabrirlo generaba otra; y el panel no releía el saldo tras un
   fallo, de modo que la pantalla confirmaba visualmente que «no se guardó». Camino real al pago
   duplicado, que además el asesor no puede deshacer: reversar es de `cobro.corregir` (ADR-0034).
3. **Un aviso que mentía:** «No escribas números de tarjeta: no se guardan». La nota se persiste
   en claro y queda en el historial inmutable.

Corregidos los tres en `aa8f80f8`, con prueba de regresión para cada uno. `sinSigno()` quita el
signo manipulando la cadena de unidades enteras, **sin pasar por coma flotante**, y `fraseDeSaldo()`
cubre también `PAGADO` para no decir «Falta por cobrar $ 0».

Lo que el auditor revisó y estaba bien: aislamiento (ninguna llamada manda `tenant_id`; los ids van
en la ruta y el repositorio va bajo RLS), autorización (los gates de la web son cosméticos y el
servidor manda con `@RequierePermiso` más la comprobación fina en el caso de uso), R8 en
`cobros-logica.ts` (delega en `Money` y `MONEDAS`, no reimplementa aritmética) y R6/R10.

## La trampa que costó tres PR

El `scope` de commitlint es una **lista cerrada y los nombres de los agentes no están en ella**.
Murieron por eso #411 (`test(datos)`), #412 (`test(qa)`) y el primer intento del tablero
(`docs(contexto)`). Como `git push --force-with-lease` está denegado por el clasificador, un scope
malo **no se enmienda**: obliga a recrear la rama y abrir otro PR. Equivalencias:
`datos → db`, `qa → test`, `backend → api`, contexto/cerebro → `hilo`, reportes → `analytics`.
Queda anotado en el tablero (#414) para que no vuelva a pasar.

## Medido, que nadie lo había medido

La ejecución en serie de las e2e de `apps/api` (#415) sube el job `test` de **3m11s a 4m26s**, un
40% más en cada PR. Es el peaje por quitar la inestabilidad; se acepta, pero queda escrito.

## Lo que NO quedó cerrado

- **T-510 sigue `in_progress`**, no `done`: su criterio de salida son **cinco corridas de CI
  seguidas sin rojo** y van **cero**. Los deadlocks 40P01 de `historial-de-etapas` e
  `invitaciones.e2e-spec` **no se reprodujeron y no se cerraron**; la hipótesis (bloqueo entre
  procesos por el `AccessExclusiveLock` de `aislamiento.spec` al reaplicar políticas) está sin
  demostrar.
- La prueba del índice ya no comprueba que el planificador lo **elija**, solo que el índice existe
  con la forma correcta y que el `WHERE`/`ORDER BY` es ese prefijo. Es menos de lo que se quería,
  pero es estable; lo anterior no lo era.
- Nada se probó contra Postgres local en ninguna sesión: el clasificador lo deniega. **Todo lo de
  «API real» lo validó el CI**; lo visual salió de modo demostración.

## Bloqueo que solo resuelve el propietario

El despertar automático de 2 h quedó apuntando a la madre **anterior** tras el relevo. Tres caminos
para repuntarlo fueron denegados (`create_trigger`, `update_trigger`, `send_message` a la madre
anterior) y **ninguno se rodeó**. Mitigación: un aviso al despertar en la cabecera del tablero, en
`main` y en la rama `claude/repository-status-d4ug6p`, que es la que inyecta el hook. El arreglo de
verdad es el punto **8f** de `PENDIENTES-DEL-PROPIETARIO.md`.

## Una compuerta que no estaba apretada

La sesión de T-331 terminó con **318 mil tokens** y unos 25 USD, cuando su encargo fijaba un tope de
150 mil y el traspaso al llegar ahí. Lo hizo notar ella misma, y tiene razón: **ninguna sesión
recibe aviso de su propio consumo**. El tope solo se cumple si la madre consulta `get_session` →
`context_usage` en cada vuelta y archiva al pasarse. Es trabajo de la madre, no de la hija, y en
este lote no se hizo a tiempo. Queda anotado en el tablero como parte del ciclo, no como buena
intención.

## Nota de método

Las cuatro integraciones fueron **en serie y a mano, con squash**, actualizando cada rama y
repitiendo el CI después de cada merge, porque la protección exige la rama al día. Son tres vueltas
completas de CI que no se pueden ahorrar mientras la compuerta sea `strict`.

El rastro documental del lote va en **un solo PR** en lugar de tres: con tres sesiones tocando
`roadmap/tasks.yaml` a la vez, el conflicto estaba garantizado.
