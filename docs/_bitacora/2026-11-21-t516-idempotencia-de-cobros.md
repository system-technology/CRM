# 2026-11-21 — T-516: la idempotencia de cobros ignoraba `referencia` y `nota`

Sesión corta, una sola tarea. Origen: la auditoría independiente de #410 (T-331).

## El defecto

`mismoContenido` (`apps/api/src/modules/payments/domain/movimiento.ts`) comparaba lo que ADR-0034 §4
paso 2 enumera —tipo, archivo, monto, moneda, fecha, medio, pagador, `reverso_de_id`— y nada más.
El texto libre (`referencia`, `nota`, `motivo`) quedaba fuera de la comparación **y fuera del
candidato** que se le pasaba.

Consecuencia: la asesora registra un pago, corrige la nota en el mismo formulario y reenvía. El
formulario reutiliza su clave de idempotencia, el servidor lo ve como reintento, responde `200` con
la fila original y **descarta la corrección en silencio**. Ella cree que corrigió.

Y no puede deshacerlo: registrar es `cobro.registrar`, corregir el libro es `cobro.corregir` —del
dueño (ADR-0034 §2)— y el libro es inmutable (sin `UPDATE` ni `DELETE` en ninguna ruta).

## Hecho

1. **`mismoContenido` compara todo el cuerpo**, texto libre incluido. Firma asimétrica y explícita:
   `(existente: ContenidoDeMovimiento & {notaTachadaEn}, candidato: ContenidoDeMovimiento)`.
   Si algo difiere → `409 CLAVE_DE_IDEMPOTENCIA_REUTILIZADA`, sin escribir nada.
2. **El `candidato` del caso de uso lleva ya `referencia`, `nota` y `motivo`**, y el `nuevo` que se
   inserta se arma con ese mismo objeto. Antes se calculaban dos veces, en dos sitios, y solo uno
   llegaba a la comparación: esa duplicación **era** el defecto.
3. **El reverso compara su `motivo`** (lo único que el cliente escribe ahí), en los dos caminos: el
   reintento normal y la red del `ON CONFLICT`.
4. **Excepción de la fila tachada** (ADR-0034 §2.4): si `nota_tachada_en` no es nulo, `nota` y
   `referencia` no cuentan. Las vació la base a propósito; compararlas daría `409` a un reintento
   honesto.
5. **ADR-0036**, que enmienda ADR-0034 §4 paso 2 (solo ese paso) y defiende por escrito por qué se
   rechaza en vez de aceptar-y-avisar.
6. **Contrato**: la semántica queda escrita junto a `ClaveDeIdempotencia` en
   `packages/contracts/src/cobros.ts`. Ningún tipo ni esquema cambia, así que `apps/web` no necesita
   nada para compilar.

## La decisión, en una línea

**Rechazar (409), no aceptar-y-avisar.** Lo que queda escrito en el libro la asesora no puede
quitarlo; `409` evita ensuciarlo y usa el camino de error que la web ya maneja desde #410. El
razonamiento completo, con las alternativas descartadas, en ADR-0036.

## Pruebas

Los dos caminos que pide el criterio de aceptación, y los dos están escritos:

| Camino | Dónde |
|---|---|
| Reintento **idéntico** → `200`, misma fila, una sola fila | `registrar-movimiento.use-case.spec.ts`, e2e |
| Otra `nota` → `409`, nada nuevo, nota original intacta | use-case + e2e |
| Otra `referencia` → `409` | use-case + e2e |
| **Quitar** la nota que traía → `409` | use-case + e2e |
| Otro `motivo` (AJUSTE) → `409` | use-case |
| Reverso con otro `motivo` → `409` | use-case |
| Fila tachada: el texto libre no cuenta | `movimiento.spec.ts` |

La prueba que afirmaba el comportamiento viejo («una nota distinta no cambia el contenido que
cuenta») se invirtió: era la que documentaba el defecto.

## Verificado y sin verificar

- **Verificado en local:** `pnpm typecheck` y `pnpm lint` en verde; las unitarias de `apps/api`
  (158 ficheros, 1583 pruebas, 1 fallo esperado) en verde; las de `packages/contracts` también.
- **Sin verificar:** las **e2e** (`payments-cobros.e2e-spec.ts`) y el **`build`**. Esta sesión no
  puede levantar Postgres; lo decide el CI. No se afirma nada sobre ellas.
- **Sin hacer:** la **auditoría independiente** que el propietario exige antes de integrar esto, por
  ser dinero. Bloqueante para la integración.

## Cola

- **T-522** — la excepción de la fila tachada asume que el tachado vacía `nota` y `referencia` a la
  vez. Lo impone hoy el disparador de la migración; si algún día se tachara solo uno, la comparación
  se relajaría de más. Vigilar si el tachado llega a tener ruta de API.

## PRs

- **#420** (carril `a`) — el código: `apps/api` + documentación en `packages/contracts`.
- **Este PR** (carril `i`) — el rastro: ADR-0036, esta bitácora y `tasks.yaml`. Separado porque
  `docs/**` y `roadmap/**` son del carril `i`: juntarlo con #420 pondría en rojo «Carril y tarea».
