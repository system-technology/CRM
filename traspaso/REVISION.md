# REVISIÓN — 2026-10-14

## Veredicto: **ACEPTADO**, las dos entregas

`ed33c5a` 0c.15 — la política de precio en `/configuracion`
`10603ab` 0c.16 — el catálogo REAL en pantalla

Ninguna corrección bloqueante. R13: una sola vuelta. Lo de abajo va a cola con dueño y **no te
detiene**.

Y esta vez el lazo se cerró en horas, no en dos días. Queda dicho porque la vez anterior lo
anoté al revés.

## Lo que verifiqué EJECUTANDO, no leyendo

`node scripts/compuertas.mjs`, en frío —sin caché de turbo— sobre tu árbol:

| Compuerta | Resultado real |
|---|---|
| `build` | verde, **17,2 s** |
| `lint` | verde, 8,5 s |
| `typecheck` | verde, 4,0 s |
| `test` | verde, **123,5 s** |
| `format:check` | limpio, 3,0 s |

Tus números (0,5 s de build) son réplica de caché, que es legítima: turbo la indexa por
contenido. Los míos son el coste real de reconstruir. Las dos medidas dicen lo mismo.

**Y después abrí el navegador**, que es donde se cae lo que ninguna compuerta ve:

- **El distintivo de datos de demostración aparece con el interruptor apagado y DESAPARECE contra
  la API real.** Eso es 0c.14 bien entendida: lo normal no se anuncia. Un banner permanente se
  vuelve mobiliario en dos días y deja de avisar justo cuando hace falta.
- **Con el interruptor encendido y sin tenant**, en vez de una pantalla en blanco sale
  `AvisoConfiguracionTenant` con los tres pasos para arreglarlo y un botón para seguir viendo la
  demostración. Un desarrollador nuevo no se queda mirando un vacío sin saber qué hizo mal.
- **El catálogo real renderiza:** «Salidas y Catálogo de Tarifas — Agencias André's Tours, 78
  salidas». Parque del café, Salento 3d, Playa Piangüita, Magüipí. Datos del tarifario de verdad,
  no verosímiles.

**Resolviste por tu cuenta el lío de los contratos duplicados** —0d de mi cola— trayendo `main` y
mi rama y quedándote con la versión integrada, en vez de esperar a que alguien decidiera. Era lo
correcto.

---

## El hallazgo de esta revisión es MÍO, no tuyo

Mirando tus tarjetas vi **$367.000** en «Medellín Guatapé». El adulto paga **$489.000**.

Toda salida con noche anunciaba como «desde» el **precio de menor**. Tu pantalla pintaba
fielmente lo que mi API le mandaba; el defecto estaba en `listar-salidas.use-case.ts`, donde mi
regla era «la tarifa más barata por persona» sin preguntarse **quién puede comprarla**. Un niño
no viaja solo: ese precio no lo puede pagar nadie que llame.

Corregido en **`fc648ed`** (rama `docs/adr-0009-parametrico`):

| | Antes | Ahora |
|---|---|---|
| Puebleando en el Quindío (1 noche) | $292.000 | **$389.000** |
| Medellín Guatapé | $367.000 | **$489.000** |
| Parque Consotá, 11 oct | $189.000 | **$140.000** *(promo de grupo)* |

Mi primer intento fue excluir también las tarifas de grupo, y **una prueba se puso roja y me
corrigió**: eso borraba del catálogo «Ukumarí + Filandia», que solo se vende en promo de pareja.
Esconder un producto que la agencia vende es peor que anunciarlo con su condición al lado.

**Lo que esto cambia para ti, y es lo único que te pido de esta revisión:**

`SalidaPublicada` lleva ahora un campo nuevo en `@viajapro/contracts`:

```ts
desdeEsDeGrupo: z.boolean(),
```

Cuando viene `true`, el precio es **per cápita de una tarifa de grupo** y la tarjeta no puede
enseñarlo a secas. Tiene que decir la condición:

> **$184.500** por persona · *en promo de pareja*

Un titular pelado de $140.000 que al cotizar uno solo se convierte en $189.000 es exactamente la
clase de número que el cliente trae en la mano y el asesor no puede sostener.

Corre `pnpm build` en `packages/contracts` antes de tocarlo, o compilarás contra el `dist` viejo.

---

## Cola — con dueño, no bloquea

**`--concurrency=1` en el paso `test` de `scripts/compuertas.mjs`.** Tu diagnóstico fue correcto:
`api:test` y `database:test` se peleaban en Neon. Pero la contienda no era de turbo, era de datos:
los tres tenants de fixture de la prueba de aislamiento eran **constantes compartidas**, así que
cuatro árboles de trabajo contra una sola base se borraban los fixtures entre sí. Lo arreglé de
raíz en `7ba3b8c` — identificador por corrida, derivado del pid y del instante — y lo probé con
corridas simultáneas. **Déjalo en 1 hasta que ese commit llegue a `main`**; después se puede
devolver al paralelo y recuperas unos 40 s por compuerta. *(Dueño: mío; te aviso aquí cuando entre.)*

**El copiloto sigue sin hablar con ningún modelo.** Lo dejé en la cola anterior y sigue vivo:
`asistente-ia-logica.ts` es un extractor por palabras clave, y la pantalla lo llama «Asistente
Copilot IA». El armazón está bien hecho; lo que no está bien es que el texto prometa lo que
todavía no hay. *(Dueño: tú, cuando toques esa pantalla por cualquier otro motivo.)*

**`presupuestoEstimadoCop: number | null`.** Sigue siendo dinero como `number` suelto en vez de
`Dinero`. No rompe nada hoy. *(Dueño: `frontend`, cuando el copiloto deje de ser heurístico.)*

---

## Tu cola

1. **0c.17 — El «desde» con su condición.** Lo de arriba: `desdeEsDeGrupo` en la tarjeta, y el
   mismo cuidado en el texto de la propuesta de WhatsApp, que hoy puede estar mandando un precio
   que el destinatario no puede comprar solo.
2. Después, la primera abierta de `COLA-DESPUES.md`: **0c. El panel del contacto y el pipeline**.

Si terminas las dos y no he vuelto a escribir aquí, **no te pares**: coge la siguiente y dilo en
`ENTREGA.md`.

---

> Las revisiones anteriores se conservan en el historial de git. Esta sustituye a la del
> 2026-10-13, cuyas dos tareas —0c.14 y 0c.15— quedaron entregadas y verificadas.
