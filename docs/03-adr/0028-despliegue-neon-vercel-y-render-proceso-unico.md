# ADR-0028 — Despliegue: Neon, la web en Vercel y la API en un solo proceso en Render

- **Estado:** Aceptado (2026-11-17) por decisión del propietario, por escrito en la sesión: «Sí,
  prepara Neon, Vercel y Render». Empieza **solo por staging**; producción se monta con la misma
  forma cuando la piloto vaya a usarlo. Las consecuencias de §7.3 (Vercel ve el tráfico en claro) y
  §7.4 (`API_TRUST_PROXY` con dos caminos) tocan datos de las agencias y pasan por
  `auditor-seguridad` las veces que haga falta (R13).
- **Fecha:** 2026-11-17
- **Decide:** el propietario
- **Consultados:** `arquitecto` (redacta), `devops` (prepara `render.yaml`, el workflow y
  `apps/web/vercel.json` en paralelo). Pendiente: `auditor-seguridad` (§7.3 y §7.4)
- **Supersede parcialmente:** [ADR-0013](0013-despliegue-staging-y-produccion.md) y
  [ADR-0019](0019-despliegue-minimo-un-proceso-sin-redis.md), solo en los puntos que enumera §5. Lo
  que no se nombra ahí sigue vigente tal cual.

---

## Contexto

**La fuerza es poner algo en una URL pública ya.** Han pasado cuatro semanas desde ADR-0013 y dos
desde ADR-0019, y nada corre fuera de un portátil. Lo que espera esa URL es concreto: el Paso 2 de
Meta (registrar el webhook), el criterio C3 de la puerta de datos reales (ADR-0019 §6) y la prueba
de la web contra la API desplegada. ADR-0019 eligió Fly, pero sus pasos 8 a 10 (§7) no se
ejecutaron, y `render.yaml` sigue describiendo la topología de cuatro servicios de ADR-0013.

El propietario cerró el proveedor el 2026-11-17: Neon, Vercel y Render. Este ADR no reabre esa
elección; decide **cómo** se reparte el sistema entre los tres sin perder ninguna garantía de
ADR-0013 ni de ADR-0019. El modo `unico` ya está en `main` (`apps/api/src/main-unico.ts`,
`apps/api/src/proceso-unico/`, `MODO_DESPLIEGUE`), así que la pieza que obligaba a cuatro servicios
(Redis, ADR-0019 §1) ya no existe.

Dos hechos que condicionan el diseño:

- **Neon está en `aws-us-east-2` (Ohio)** (ADR-0013, Contexto; ADR-0019 §4.2). Render tiene Ohio
  exacta (ADR-0013, tabla de opciones).
- **La web no habla con la base.** No recibe ninguna cadena de conexión (ADR-0013 §4); todo su
  tráfico de datos va a la API por la reescritura de Next (`apps/web/next.config.mjs`,
  `API_INTERNAL_URL`, ADR-0011 §2). La latencia que importa para la web es web → API, no web → base.

## Opciones consideradas

### A — Todo en Render, cuatro servicios por entorno (ADR-0013)
Web, API, trabajador y Key Value en Ohio, con red privada entre ellos.
- **Gana:** un proveedor, una región, red privada para la reescritura.
- **Cuesta:** ~USD 51/mes solo staging y ~195–230 con producción (ADR-0013, tabla de costos), casi
  todo por el trabajador aparte y el Key Value, que el modo `unico` ya hizo innecesarios.
- **Cierra:** nada nuevo; ya la superó ADR-0019 §2 para producción pequeña.

### B — Fly, modo `unico` (ADR-0019 §4.1 A)
Web y API en dos máquinas Fly, `iad`.
- **Gana:** el cómputo más barato (~USD 18–21/mes con Neon Launch, ADR-0019 §4.3).
- **Cuesta:** no hay Ohio, así que o se recrea Neon en `us-east-1` o se paga latencia API → base
  en cada consulta en serie (ADR-0019 §4.2). `fly.toml`, certificados y tokens a cargo nuestro.
- **Cierra:** nada, pero no es la elección del propietario.

### C — Todo en Vercel (descartada)
- Socket.IO y el proceso continuo (relay, barrido de arranque y de 60 min, colas en proceso) no
  caben en funciones: ADR-0013 D lo comprobó (WebSockets cortados a la duración máxima de la
  función; las imágenes deben abrir HTTP y escalan a cero) y ADR-0019 («Alternativas
  descartadas») lo ratificó. Nada de eso ha cambiado. **Sigue descartada.**

### D — Web en Vercel, API en un solo proceso en Render, Neon (elegida)
- **Gana:** la API queda en Ohio junto a la base, como pedía la fuerza de ADR-0013; Next corre en
  la plataforma de su autor (middleware con *nonce* de CSP y `force-dynamic` funcionan sin imagen
  propia); un solo servicio de Render en vez de cuatro.
- **Cuesta:** dos proveedores de cómputo que vigilar; la reescritura sale de la red privada a
  internet (§7.1); Vercel pasa a ver el tráfico de la aplicación (§7.3); Vercel Pro por asiento.
- **Cierra:** la región de la API. En Render no se cambia la región de un servicio existente
  (ADR-0013, opción A).

## Decisión

**Opción D.** Es lo que decidió el propietario, y de las formas de usar esos tres proveedores es la
única que mantiene el cómputo de la API junto a la base sin volver a los cuatro servicios.

### 1. Base de datos: Neon

- Sigue Neon (ADR-0007), proyecto en `aws-us-east-2`. **Ya no hace falta recrearlo en `us-east-1`**
  (ADR-0019 §4.2 lo proponía solo para acercarlo a Fly `iad`).
- Staging es una rama **`staging` solo esquema** (*schema-only*), nunca copia de producción (ADR-0013,
  Pasos del propietario, 3). Plan Free mientras no haya datos reales; Launch desde el primer dato
  real (ADR-0019 §4.2).
- Las migraciones las aplica **GitHub Actions, job `migrar`**, con `prisma migrate deploy`, el rol
  propietario por conexión directa guardado solo en el *Environment* de GitHub, y la compuerta de
  ADR-0013 §6: se niega a correr si `github.ref` no es `refs/heads/main` o si el SHA no es ancestro de
  `origin/main`. Migraciones de expansión, compatibles con el código anterior.

### 2. Web: Vercel Pro, región `cle1`

- `apps/web` se despliega en **Vercel, plan Pro**. Hobby no sirve: «restricted to non-commercial
  personal use only» (ADR-0013, opción D).
- **Región de las funciones: `cle1` (Cleveland, AWS `us-east-2`)**, no la de omisión `iad1`
  (Washington, `us-east-1`). Lo que la web llama en cada petición es la API en Render Ohio, y Neon
  también está en `us-east-2`; `cle1` es la misma región de AWS que ambos. `iad1` sería aceptable
  (región vecina) pero no hay razón para elegirla.
- **Sin despliegue automático por git**, tampoco de previsualización: el repositorio es público y
  cada PR produciría un despliegue en `*.vercel.app`. El despliegue lo dispara GitHub Actions con un
  **deploy hook de Vercel**, guardado en el *Environment* de GitHub, **después** de migrar y de
  desplegar la API (§3). Así la web nunca va por delante de la API: un contrato nuevo de
  `packages/contracts` llega primero al servidor que lo sirve.
- La web conserva lo que fijó ADR-0013 §4: solo `NEXT_PUBLIC_API_URL` y `API_INTERNAL_URL`, ningún
  secreto. En producción no existen `NEXT_PUBLIC_DEV_TENANT_ID` ni `NEXT_PUBLIC_AUTH_MAQUETA`.

### 3. API: un servicio web en Render, modo `unico`, Ohio

- **Un solo *web service* por entorno**, región `ohio`, con `MODO_DESPLIEGUE=unico` y
  `node dist/main-unico.js`: API HTTP, Socket.IO, webhook de Meta y trabajo asíncrono en un proceso,
  colas sobre Postgres, **sin Redis y sin trabajador aparte** (ADR-0019 §1). Cuatro pools con su
  aserción de rol al arrancar (ADR-0019 §3, punto 6, «R2: varios roles en un proceso»).
- **Chequeos de salud, separados por lo que despiertan:**
  - La sonda continua de Render usa **`/salud`**, que no toca la base. Render sondea «every few
    seconds» sin intervalo configurable: con `/salud/listo` ahí, Neon no se suspendería nunca (el
    mismo problema que ADR-0019 §1.3 resolvió para Fly) y una caída de Neon haría que Render
    reiniciara una API que no tiene la culpa.
  - **`/salud/listo`** (base accesible y rol que no salta RLS) lo consulta **el workflow después de
    cada despliegue de la API**, y es la condición para disparar el hook de la web. Después, como
    mucho una vez por hora (ADR-0019 §5).
- **Orden del despliegue**, con el despliegue automático de Render apagado (ADR-0013 §7):

  ```
  merge en main → CI verde → migrar (rama staging) → deploy hook de la API en Render
    → esperar /salud/listo en https://api.staging.<dominio> → deploy hook de Vercel → /salud de la web
  ```

  Un grupo de `concurrency` sin cancelación serializa los despliegues de un mismo entorno.

### 4. Dominios

Se mantiene el esquema de ADR-0013 §1, con el dominio técnico neutro de ADR-0012:

| Entorno | Web (Vercel) | API, Socket.IO y webhook (Render) | Cookie |
|---|---|---|---|
| Staging | `staging.<dominio>` | `api.staging.<dominio>` | `Domain=staging.<dominio>` |
| Producción (después) | `app.<dominio>` | `api.app.<dominio>` | `Domain=app.<dominio>` |

Mismo dominio padre por entorno, *same-site*: la cookie de Better Auth llega al *handshake* de
Socket.IO (`withCredentials`, `cors.origin` exacto y comprobación de `Origin`). **Nunca se usan
`*.vercel.app` ni `*.onrender.com` para usuarios**: los dos están en la lista de sufijos públicos,
son *cross-site* y Safari descartaría la cookie (ADR-0013 §1, que ya lo decía de `*.onrender.com`).
Ninguno de los dos entra en `cors.origin`. La regla de ADR-0013 («nada de terceros bajo
`*.app.<dominio>`») se extiende a `*.staging.<dominio>`.

## 5. Qué queda superado y qué sigue vigente

### ADR-0013

| Punto | Estado |
|---|---|
| Decisión A (cuatro servicios en Render por entorno) y Topología | **Superadas** (ya lo estaban para producción pequeña por ADR-0019 §2). Rige §3 de este ADR |
| Opción D, frase «La web sola en Vercel tampoco compensa» y el descarte de Vercel del 2026-10-20 en Contexto | **Superados** solo para la web. «Vercel para todo» **sigue descartado** (opción C de aquí) |
| Subdecisión 1: dominio y cookie | **Sigue**, y se extiende: nunca `*.vercel.app` |
| Subdecisión 2: URL del webhook | **Sigue** (staging no se suscribe al número real) |
| Subdecisión 3: Redis | Ya superada por ADR-0019 en modo `unico`; sin cambios |
| Subdecisión 4: secretos por servicio | **Sigue** con los cambios de ADR-0019 §5 (API y Trabajador fundidas, sin `REDIS_URL`). La columna Web vive ahora en las variables de Vercel; el deploy hook de Vercel se suma a GitHub Actions |
| Subdecisión 5: aserción de rol | **Sigue**, por pool (ADR-0019 §3, punto 6) |
| Subdecisión 6: migraciones desde Actions | **Sigue** sin cambios |
| Subdecisión 7: despliegue automático apagado, hooks, Environments solo `main` | **Sigue**, y se extiende a Vercel (sin despliegue por git ni previsualizaciones). Cambia el orden: la web va después de la API |
| Subdecisión 8: arranque del trabajador | Ya superada por ADR-0019 |
| Costo mensual estimado | **Superado** por §6 de este ADR |
| Consecuencia «`req.ip` pasa por la web y por el balanceador de Render» | **Sigue y se agrava** (§7.4) |
| Cuándo revisar: latencia Colombia–Ohio, factura por agencia, región de Neon | **Siguen** |

### ADR-0019

| Punto | Estado |
|---|---|
| §1 (modo `unico`), §2, §3 (garantías), §6 (puerta de datos reales), §8 (disparadores) | **Siguen** sin cambios |
| §1.3, «la sonda de Fly y el monitor externo usan `/salud`» | **Sigue** como principio; la sonda ahora es la de Render |
| §4.1, recomendación A (Fly) | **Superada.** El host es Render para la API y Vercel para la web |
| §4.2, recrear Neon en `us-east-1` | **Superada:** con Render Ohio, Neon se queda en `us-east-2` |
| §4.2, Neon Free hasta datos reales y Launch después | **Sigue** |
| §4.3 y §4.4, costos y economía por agencia de Fly | **Superadas** por §6 de este ADR |
| §4.5, la web en Fly con URL `.internal` | **Superada:** web en Vercel, `API_INTERNAL_URL` pública (§7.1) |
| §5, partes específicas de Fly (`fly secrets`, `flyctl deploy`, token de app de Fly, certificados de Fly) | **Superadas** por los equivalentes de Render y Vercel. El resto de §5 (respaldos, monitor externo, objetivo de recuperación ≤ 1 h, runbook) **sigue** |
| §7, paso 8 (Fly) | **Superado:** pasa a ser Render + Vercel + workflow de §3 |
| Cuándo revisar: «si Fly cambia sus precios» | **Superado.** Los demás disparadores siguen |

## 6. Costo mensual estimado (USD, staging)

| Partida | Fuente | Staging |
|---|---|---|
| Render, API `unico` en Starter 512 MB | ADR-0013 | 7 |
| Vercel Pro | ADR-0013 («USD 20 por asiento») | 20 por asiento |
| Neon Free, si la sonda continua no toca la base | ADR-0019 §4.2 | 0 |
| **Total** | | **~27 con un asiento** |

Frente a ~51 de ADR-0013 solo staging. **Sin verificar:** si 512 MB bastan para el modo `unico`
(ADR-0019 lo dimensionó en 1 GB; el plan intermedio de Render y su precio no están en ningún ADR, el
de 2 GB cuesta 25); si un servicio solo exige el espacio Pro de Render (USD 25 en ADR-0013); cuánto
uso incluido trae Vercel Pro antes de cobrar excedentes; y cuántos asientos hacen falta. Los precios
de ADR-0013 son del 2026-10-20 y no se volvieron a consultar.

Producción, cuando llegue, **sin verificar**: Render 25 (2 GB) + Vercel 20 + Neon Launch ~6–9
(ADR-0019 §4.3) + espacio Render si aplica. Es más caro que Fly (~18–21, ADR-0019) y bastante más
barato que los ~142–177 de ADR-0013. La diferencia con Fly es el precio de la decisión del
propietario, y queda dicho.

## 7. Consecuencias

### Positivas
- Un solo servicio de Render, en Ohio, junto a la base: la latencia API → base es la de ADR-0013.
- Neon se queda donde está; no hay que recrear el proyecto.
- Next en Vercel no necesita imagen propia ni `output: 'standalone'` para la web.
- La web nunca se despliega por delante de la API.

### Negativas

1. **La reescritura va por internet.** `API_INTERNAL_URL` deja de ser una dirección privada y pasa
   a ser `https://api.staging.<dominio>`. Cada petición de la web cruza de Vercel a Render por TLS
   público. Latencia `cle1` → Ohio: **no medida**; debería ser de pocos ms al estar en la misma
   región de AWS, pero hay que medirla en la prueba de humo.
2. **Dos proveedores de cómputo:** dos paneles, dos facturas, dos lugares donde mirar en una caída,
   dos conjuntos de variables. El runbook (ADR-0019 §5) cubre los dos.
3. **Vercel ve el tráfico en claro.** Termina TLS de la web y reenvía las respuestas de la API, que
   llevan PII de pasajeros y mensajes. Es un encargado de tratamiento nuevo (Ley 1581, R10): hace
   falta su DPA y comprobar qué registra por omisión (rutas, cabeceras; **sin verificar**). Ningún
   cuerpo se registra (ADR-0013 §4). **Decide `auditor-seguridad`.**
4. **`API_TRUST_PROXY` hay que medirlo de nuevo.** T-088 (PR #183) lo midió para la reescritura
   dentro de Render. Ahora la API recibe tráfico por **dos caminos con distinto número de saltos**:
   navegador → Vercel → Render → API (HTTP de la web) y navegador → Render → API (Socket.IO y el
   webhook de Meta). Un único número de saltos puede dejar que un cliente del camino corto falsifique
   `X-Forwarded-For` y burle el límite de intentos, o que el límite castigue a Vercel en vez de al
   atacante. Cómo propaga Vercel `X-Forwarded-For` en una reescritura externa está **sin verificar**.
   La prueba de T-088 (dos clientes, dos IP) se repite contra staging antes de abrirlo a nadie; si
   los caminos no cuadran, se resuelve con una cabecera firmada por la web o con un límite por
   camino. **Es bloqueante para producción, no para staging con el número de prueba.**
5. **Los deploy hooks despliegan la punta de la rama, no un SHA** (comportamiento de Vercel y Render
   **sin verificar**). Si entra otro merge entre `migrar` y el hook, se publica código cuya migración
   aún no corrió. Se mitiga con el grupo de `concurrency` de §3 y comprobando, al final, que el SHA
   publicado es el migrado.
6. **Las URL de despliegue `*.vercel.app` siguen existiendo** aunque no se anuncien. Hay que
   protegerlas (protección de despliegues de Vercel, alcance en Pro **sin verificar**): no deben
   servir la aplicación a nadie.
7. Lo que ADR-0019 ya aceptaba sigue igual: una sola instancia de API, sin alta disponibilidad,
   recuperación ≤ 1 h, y el corte de Socket.IO en cada despliegue (ADR-0013, Negativas).

### Qué habría que cambiar para revertir esto
- Volver a la web en Render (la imagen `apps/web/Dockerfile` sigue existiendo) con
  `API_INTERNAL_URL` privada, o mover la API a otro host en `us-east-2`. El código no cambia: son
  contenedores Node estándar y variables de entorno.

## Cuándo revisar esta decisión

- **Cuando se cumpla un disparador de ADR-0019 §8**, sobre todo el que pide una segunda instancia de
  la API: entonces hace falta el modo `escalado` con Redis (Key Value de Render en Ohio, ADR-0013 §3)
  y quizá el trabajador aparte, y este ADR se supersede en §3.
- Si la latencia medida Vercel → Render empeora la p95 de la bandeja por encima del umbral de
  ADR-0013 (> 300 ms percibidos).
- Si `auditor-seguridad` no acepta §7.3: la web vuelve a Render y este ADR se supersede en §2.
- Si la factura de staging pasa de USD 50 al mes, lo que lo dejaría por encima de la opción A.
