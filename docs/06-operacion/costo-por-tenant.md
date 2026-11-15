# Costo base y costo por tenant

| Campo | Valor |
|---|---|
| Estado | **Primera tabla, con precios copiados de los ADR y sin verificar hoy.** No hay agencia ni servicio desplegado: ninguna cifra es una factura |
| Fecha | 2026-11-15 |
| Responsable | `analista-datos` (fórmula), `devops` (precios reales al contratar) |
| Cierra | Hallazgo M19 de la [auditoría 2026-11-15](../_auditorias/2026-11-15-auditoria-integral.md), tarea T-210, **en lo que a escribir el costo base se refiere**. Medirlo queda para cuando haya consumo real |
| Precio del producto | **No se decide aquí.** Le toca a `jefe-de-producto`; el nombre y los planes siguen sin decidir ([ESTADO.md](../../ESTADO.md) §4) |

## 1. Regla de lectura

Cada precio lleva una de dos marcas:

- **De ADR:** copiado de [ADR-0013](../03-adr/0013-despliegue-staging-y-produccion.md) (precios de lista
  del 2026-10-20) o de [ADR-0019](../03-adr/0019-despliegue-minimo-un-proceso-sin-redis.md) §4
  (consultados el 2026-11-04). Se pueden usar para estimar, no para cobrar.
- **Por verificar (2026-11-15):** no se consultó la página del proveedor al escribir esto. Hay que
  abrir la página de precios antes de contratar y reemplazar la cifra.

Ningún valor de abajo está medido. Neon, en particular, depende de las horas despierta y del uso real.

## 2. Costo fijo por servicio

### 2.1 Staging actual (lo que declara `render.yaml`)

`render.yaml` declara cuatro servicios en Render, región Ohio, todos con `plan: starter`.

| Servicio | Plan en `render.yaml` | USD/mes | Marca |
|---|---|---|---|
| `viajapro-web-staging` (web) | `starter` | 7 | De ADR-0013 (512 MB); por verificar 2026-11-15 |
| `viajapro-api-staging` (web) | `starter` | 7 | Ídem |
| `viajapro-worker-staging` (worker) | `starter` | 7 | Ídem |
| `viajapro-redis-staging` (Key Value) | `starter`, `noeviction` | 10 | De ADR-0013 (256 MB); por verificar 2026-11-15 |
| Neon (base) | No está en `render.yaml` | ~20 | De ADR-0013: 0,25 CU despierto, porque el barrido de 30 s impide escalar a cero. Estimación |
| **Total staging** | | **~51** | De ADR-0013 y ADR-0019 §4.3 |

Hoy nada de esto está contratado: no hay servicio vivo ([ESTADO.md](../../ESTADO.md) §1).

### 2.2 Producción con la topología de Render (ADR-0013)

Staging más producción: **~195–230 USD/mes** (ADR-0019 §4.3). Lo explican sobre todo el espacio Pro
(25), la web y la API de 2 GB (25 cada una) y el Key Value de 1 GB (20). **Se descartó para esta etapa
por costo** (ADR-0019 §4.1.C).

### 2.3 Producción mínima (ADR-0019: Fly + Neon Launch, modo `unico`)

Es la opción recomendada y todavía **no está montada**: `render.yaml` sigue con la topología de arriba.

| Partida | USD/mes | Marca |
|---|---|---|
| Máquina de la API (1 GB, modo `unico`, sin Redis ni trabajador) | 6,70 | De ADR-0019 §4.3; por verificar 2026-11-15 |
| Máquina de la web (512 MB) | 3,69 | Ídem |
| Neon Launch (50–80 CU-h × 0,106 + 0,35 de almacenamiento + historial) | ~6–9 | De ADR-0019 §4.3. Estimación, no medida |
| Dominio | ~1 | Por verificar (~10–15 USD al año) |
| **Total** | **~18–21** | De ADR-0019 §4.3, con 1 agencia |

Con Neon Free, antes de datos reales: ~11,4 (ADR-0019 §4.3).

### 2.4 Lo que sigue fuera de la tabla

| Partida | Estado |
|---|---|
| Correo (Postmark, ADR-0012) | **Por verificar 2026-11-15.** ADR-0019 dice que su capa gratuita está NO VERIFICADA. Sin cifra |
| Objetos (S3 para media y documentos) | No implementado. Sin cifra |
| Monitor externo de `/salud` (ADR-0019 §5) | Herramienta y precio NO VERIFICADOS. Sin cifra |
| Volcado lógico semanal fuera de Neon ([respaldo-y-restauracion.md](respaldo-y-restauracion.md)) | Destino sin elegir. Sin cifra |
| Respaldo: restauración a 7 días de Neon Launch | Cobro aparte según ADR-0019 §4.2: 0,20 USD/GB-mes. **Por verificar** |

## 3. Costo variable por tenant

### 3.1 IA

No hay hoy ningún código que llame a la API de Claude. Lo que sigue es la estimación del
[diseño de ingesta de catálogo](../09-ia/09-ingesta-de-catalogo-con-ia.md) §6, que está en «Diseño
propuesto», con precios consultados el 2026-10-26 (por verificar 2026-11-15) y **estimado, no medido**.

| Modelo | ID | Entrada | Salida | Uso previsto |
|---|---|---|---|---|
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 2 USD/MTok | 10 USD/MTok | Extracción de catálogo desde texto e imagen |
| Claude Haiku 5.5 | `claude-haiku-5-5` | 0,10 USD/MTok (hasta 100k) | 0,50 USD/MTok | Candidato para texto, si la evaluación lo aprueba |

Costo por importación, según ese documento: **~0,13–0,24 USD** con Sonnet 5.5, techo duro **1,00 USD**.
Tope por agencia y mes propuesto: **5 USD** (IA2), con aviso al 80 %. Tope global de plataforma de
ejemplo: 200 USD al mes. La IA no sustituye al cotizador; solo ingiere catálogo.

### 3.2 WhatsApp

Meta factura al titular del número de negocio, no a ViajaPro, **salvo que el modelo comercial cambie**
(por decidir). Por si cambia: desde 2026-10-01 los mensajes de servicio y las plantillas `UTILITY` en
ventana se cobran por mensaje, con 1.000 mensajes de servicio gratis por número y mes
([verificación](../_auditorias/2026-10-07-precios-de-meta.md); la franquicia es de confianza
media-alta, no verificada en la fuente oficial). Las tarifas por país de esa fuente vienen de
agregadores y discrepan: **por verificar** antes de usarlas.

### 3.3 Lo que casi no varía

Cómputo y base de datos son costo fijo hasta los disparadores de ADR-0019 §8 (por ejemplo, más de 25
agencias activas o una segunda instancia de la API). Neon sí crece algo con el tráfico: ADR-0019 §4.4
estima ~25–30 USD en total con 10 agencias, **estimado**.

## 4. Fórmula

Sea **N** el número de agencias activas en el mes.

```
costo_mensual_total = F + (N − 1) × v_neon + Σ (importaciones_i × c_import) + otros
costo_por_tenant    = costo_mensual_total / N
```

| Símbolo | Qué es | Valor hoy |
|---|---|---|
| **F** | Costo fijo con una agencia: cómputo, dominio y base de Neon | Opción Fly: 6,70 + 3,69 + ~1 + ~6–9 de Neon = **~18–21** (ADR-0019 §4.3) |
| **v_neon** | Variación de Neon por agencia adicional | **Sin medir.** De ADR-0019 §4.4 se infiere ~0,5 a 1 USD por agencia adicional entre 1 y 10: se restan sus totales de 10 y de 1 agencias y se divide entre 9 (cálculo mío, **estimado**) |
| **c_import** | Costo de IA de una importación | ~0,13–0,24 con Sonnet 5.5; techo 1,00 |
| **importaciones_i** | Importaciones de la agencia *i* en el mes | Tope: 5 USD de IA por agencia (~35 importaciones típicas) |
| **otros** | Postmark, S3, monitor, volcado | **Sin cifra** |

La IA de una agencia en un mes está **acotada**: `min(importaciones × c_import, 5 USD)`. Así, el peor
caso por agencia es `F / N + v_neon + 5 + otros / N`, con N grande.

### Ejemplos

La columna «sin IA» es la de ADR-0019 §4.4 (opción Fly + Neon Launch), **estimada**. La IA se suma
aparte: «media» supone 1 USD por agencia al mes (**un supuesto mío, no un dato**) y «tope» es el
máximo propuesto, 5 USD.

| N | Total mensual sin IA | Por tenant sin IA | + IA media | + IA al tope |
|---|---|---|---|---|
| 1 | 18–21 | 18–21 | 19–22 | 23–26 |
| 3 | ~18–21 más lo que añada Neon (ADR-0019 no da el total) | ~6–7 | ~7–8 | ~11–12 |
| 10 | ~25–30 | ~2,5–3 | ~3,5–4 | ~7,5–8 |

Para N = 3 el ADR da solo la cifra por tenant (~6–7), que equivale al total de N = 1 entre tres: ignora lo que Neon crezca.

## 5. Qué hay que hacer para que esto deje de ser una estimación

- [ ] Verificar los precios de Fly, Neon y Render en sus páginas y reemplazar los valores «por verificar» con fecha.
- [ ] Desplegar y medir un mes de Neon real: horas despierta y CU consumidas.
- [ ] Tras la primera importación con IA, sustituir la tabla de §3.1 por el `usage` real (`consumos_ia`).
- [ ] Decidir quién paga la mensajería de WhatsApp (agencia o ViajaPro).
- [ ] Pasar el resultado a `jefe-de-producto`: con costo por tenant ~3–8 USD, el piso del precio es otra pregunta.
