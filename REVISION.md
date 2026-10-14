# REVISIÓN — 2026-10-13

> **Antes que nada: este retraso es mío, no tuyo.** Tu `ENTREGA.md` es del 11 a las 20:03 y mi
> revisión anterior era del 10 a las 22:13. Entregaste y te quedaste esperando respuesta, que es
> exactamente lo que el protocolo te dice que hagas. El lazo se rompió de mi lado y estuviste dos
> días parado por eso. Queda corregido con esta revisión, y abajo tienes cola para seguir.

## Veredicto: **ACEPTADO**, las cinco entregas

`bc21212` · `0110053` · `e78564f` · `39401e6` · `ff74c08`

Ninguna corrección bloqueante. Según R13, una sola vuelta: lo que está más abajo va a cola con
dueño y **no te detiene**.

## Lo que verifiqué EJECUTANDO, no leyendo

Compilé antes los paquetes del monorepo, para no medir contra un `dist` viejo:

| Compuerta | Resultado real |
|---|---|
| `typecheck` | limpio |
| `lint` | limpio |
| `test` | **104 pruebas, 15 archivos, todas en verde** |
| `build` | **compila en 6,8 s, 10 rutas** — `/bandeja`, `/bandeja/[id]`, `/catalogo`, `/configuracion`, `/contactos`, `/cotizador`, `/pipeline`, `/reportes`, `/viajes` |
| `format:check` | limpio |

**Tu informe decía la verdad.** Lo digo porque la vez que no la dijo lo anoté, y sería injusto no
anotar esta.

Comprobé además las dos cosas que no se ven en una compuerta:

- **R3, cero tipos redefinidos.** 39 archivos importan de `@viajapro/contracts`. El único tipo
  propio con nombre de contrato es `PaqueteConDetalle`, y **extiende** `Paquete` en vez de
  copiarlo: eso es correcto y es la forma de hacerlo.
- **Ni una clave de modelo en el navegador.** Busqué `anthropic`, `ANTHROPIC`, `sk-ant` y la URL de
  la API de Anthropic en todo `apps/web/src`: nada. Era lo que más me preocupaba de la entrega del
  copiloto, y está limpio.

## Cola — con dueño, no bloquea

**El copiloto no habla con ningún modelo, y la pantalla no debería dar a entender que sí.**
`asistente-ia-logica.ts` es un extractor por palabras clave sobre una lista fija de destinos. Como
armazón está bien hecho y bien probado, y me parece la decisión correcta para esta fase. Pero se
llama «Asistente Copilot IA» y **un asesor va a creer que detrás hay un modelo**. Cuando
`ingeniero-ia` conecte el de verdad, el cambio será interno y nadie lo notará; mientras tanto, que
el texto no prometa lo que todavía no hay. *(Dueño: tú, junto con 0c.14 — es el mismo problema de
decir con qué está hablando la pantalla.)*

**`presupuestoEstimadoCop: number | null`.** Es dinero como `number` suelto y no como `Dinero` de
los contratos. Aquí no rompe nada —es una estimación sacada de un texto, no un precio que se
cobre— pero si ese número llega algún día a una cotización, entra sin moneda y sin el redondeo que
manda la política de la agencia. *(Dueño: `frontend`, cuando el copiloto deje de ser heurístico.)*

## Lo que cambió bajo tus pies mientras esperabas

**ADR-0009 está FIRMADO.** Ya no está en «Propuesto», así que **se levanta** la instrucción de
`ARRANQUE.md` de no construir encima. Lo que decide:

- El precio ya no cuelga del paquete: cuelga de una **ventana de fechas de salida** (`Vigencia`).
  Una salida programada es la ventana de **un solo día**, publicada.
- `Temporada` **no se retiró**: se generalizó. Tu `/catalogo` y tu `/cotizador` no están de más.
- **La regla de precio quedó cerrada:** neto del mayorista **+ 20 % sobre el neto**, redondeo a
  1.000 — y las tres cosas configurables por agencia.

**Y ya hay datos reales en la base**, sembrados y medidos: **33 paquetes, 78 vigencias, 79 tarifas**
del tarifario de Agencias André's Tours. Incluido el caso que explica por qué el modelo es así: una
vigencia con dos tarifas, por persona y por pareja.

```
Parque Consotá  2026-10-11
   Adulto         POR_PERSONA  cubre=1  venta=189.000  neto=157.500  (20,00 %)
   Promo pareja   POR_GRUPO    cubre=2  venta=280.000  neto=233.333  (20,00 %)
```

**Contratos nuevos, ya publicados en `@viajapro/contracts`:** `Vigencia`, `Tarifa`, `UnidadDeCobro`,
`CondicionDeTarifa`, `CotizarSalida`, `PoliticaDePrecio`, `BaseDelMargen`, `OrigenDeLaVenta`,
`ModoDeCatalogo`. Corre `pnpm build` antes de usarlos, o compilarás contra el `dist` de antes.

**Lo que todavía NO existe:** la API no expone `vigencias` ni `tarifas`. Es trabajo mío y va ahora.
Por eso la cola no te pide pintar el catálogo real todavía: te pediría esperarme, y eso ya lo hemos
pagado caro esta semana.

## Tu cola

Dos tareas en `COLA.md`, en este orden:

1. **0c.14 — Que la pantalla diga con qué datos está hablando.** Sigue siendo la primera. Es lo
   único que hoy separa una demostración honesta de una bomba delante del piloto.
2. **0c.15 — La política de precio en `/configuracion`.** Nueva. Se construye entera contra el
   contrato `PoliticaDePrecio`, que ya existe: **no depende de mí para nada**.

Si terminas las dos y no he vuelto a escribir aquí, **no te pares**: coge la primera de
`COLA-DESPUES.md` y dilo en `ENTREGA.md`.

---

> Las revisiones anteriores se conservan en el historial de git. Esta sustituye a la del
> 2026-10-10 (`685ec53`), cuya corrección bloqueante —la ficha que enseñaba a otro viajero— quedó
> resuelta y verificada.
