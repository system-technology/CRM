# ARRANQUE — empieza aquí, desde cero contexto

> **Dónde estás:** `traspaso/`. Este archivo y los otros cinco del protocolo viven aquí desde el
> 2026-10-13; antes estaban sueltos en la raíz y eran seis de diez. Lo que se nombra sin carpeta
> —`CLAUDE.md`, `ESTADO.md`, `AGENTS.md`— sigue en la raíz, un nivel por encima.

Si acabas de perder la sesión y no recuerdas nada de este proyecto, este archivo es suficiente.
No hace falta que nadie te cuente nada: **todo lo que importa está escrito.** Lee en este orden
y no te saltes el orden, que está pensado.

---

## 1. Qué eres y dónde estás

Eres **Antigravity**, una de las dos IA que construyen este proyecto. La otra es Claude. Os
repartís así:

| | Quién | Dónde |
|---|---|---|
| **Frontend** — todo `apps/web/` | **Tú** | `D:\Projects\CRM-bandeja`, rama `feat/bandeja-web` |
| Backend, contratos, base de datos | Claude | Otros árboles, otras ramas |
| Integración a `main` | El agente `integrador`, nadie más | — |

**No os pisáis porque trabajáis en carpetas distintas.** Tu rama es tuya; `main` no se toca.

## 2. Lee esto, en este orden

1. **`CLAUDE.md`** — las trece reglas del proyecto. R3 (los contratos mandan) y R11 (`main` es
   intocable) son las que te afectan a diario.
2. **`ESTADO.md`** — dónde está el proyecto entero, qué está bloqueado y por quién.
3. **`REVISION.md`** — lo último que Claude revisó de tu trabajo. Si trae algo rechazado, **eso
   va primero, antes que cualquier tarea nueva.**
4. **`COLA.md`** — tu cola. La primera tarea sin marcar es la tuya.
5. **`DISENO-BANDEJA.md`** y **`docs/01-producto/09-especificacion-visual.json`** — el aspecto
   y el alcance. La referencia visual está en `docs/_assets/diseno/`.

## 3. Lo que no se negocia, nunca

- **Solo tocas `apps/web/`.** Si necesitas algo del backend, lo pides; no lo construyes.
- **Nunca escribes en `main`.** Todo va a `feat/bandeja-web`.
- **No tocas `ESTADO.md`.** Ese archivo lo mantiene Claude y el integrador.
- **Cero tipos redefinidos.** Todo sale de `@viajapro/contracts`. Si falta un campo, **paras y
  lo dices** en `ENTREGA.md`. Ya lo hiciste una vez con las plantillas y estuvo bien.
- **Las cinco compuertas en verde, EJECUTADAS, antes de escribir `ENTREGA.md`.** Una sola orden:

  ```
  pnpm compuertas
  ```

  Corre `build`, `lint`, `typecheck`, `test` y `format:check`, para en la primera roja y te dice
  cuál cayó. **Sin tuberías a propósito**: una orden con `|` o con `;` te hace pedir permiso casi
  siempre, aunque la regla esté en tu lista de permitidos. Con esto basta una regla —`command(pnpm)`—
  y dejas de interrumpir al propietario.

  Mientras iteras puedes usar `pnpm compuertas --rapido`, que se salta `build`. **No sirve para
  firmar una entrega.**
- **Funciona a 375 px.**

> **Por qué `build` va primero y no último.** Los paquetes del monorepo se compilan a `dist`, y un
> `dist` viejo hace que `typecheck` compile contra una versión anterior de los contratos: hemos
> tenido verdes falsos **y rojos falsos** por eso, tres veces esta semana. En el orden natural
> —lint, typecheck, test, build— el error ya ocurrió. `pnpm compuertas` lo pone delante por ti.

## 4. Cómo funciona el traspaso — no hay cartero humano

```
    tú ──► ENTREGA.md ──► push ──► Claude lo ve ──► REVISION.md ──► push ──► tú
```

Al terminar una tarea: la marcas `[x]` en `COLA.md`, escribes `ENTREGA.md` y empujas. Claude lo
detecta solo, lo verifica **ejecutándolo** y te responde en `REVISION.md` con el veredicto y el
encargo siguiente. Tú no esperas a nadie: si `COLA.md` tiene otra tarea sin marcar, sigues.

**`ENTREGA.md` tiene cuatro apartados y los cuatro importan:**
- *Qué construí.*
- *Qué verifiqué EJECUTANDO* — con la salida real, no «pasa todo».
- *Qué NO verifiqué* — este es el que más vale. Una entrega que avisa de su propio hueco es
  útil; una que lo esconde, no.
- *Decisiones que el encargo no especificaba.*

Si algo está en rojo, **dilo en la entrega**. Ya pasó una vez que un informe decía «8/8 en
verde» con dos pruebas rojas, y eso cuesta más que el defecto: si no se puede confiar en el
informe, hay que ejecutarlo todo otra vez y el informe deja de servir para nada.

## 5. Dónde estamos hoy — 2026-10-13, medido, no recordado

`main` está en **v0.17.1**. Tú llevas 58 commits por delante en tu rama, con **ocho pantallas**
construidas: bandeja, pipeline, contactos, catálogo, cotizador, reportes, viajes y
configuración. 104 pruebas en verde.

**Y hay un problema de fondo que es lo primero que tienes que entender.** Arranqué las dos
aplicaciones y abrí `/pipeline`. Se ve como un producto terminado. Pero las tarjetas decían
«Curazao All Inclusive» y «Circuito Europa 15 días» — datos inventados, no los que hay
sembrados en la base. El panel de red: **cero peticiones a la API.**

No es un fallo tuyo. El paso a la API real va detrás de `NEXT_PUBLIC_USE_REAL_CRM`, viene
apagado, y hasta hoy ni siquiera estaba documentado. Pero el efecto sí importa:

> **El producto parece completo y no habla con nada, y nada en la pantalla lo dice.**

Eso en una demostración delante del piloto es una bomba.

**La API existe de verdad**, verificada contra Neon y contra el servidor corriendo:

| Ruta | Qué devuelve |
|---|---|
| `GET /api/v1/crm/tablero` | Las columnas de esa agencia con sus totales |
| `GET /api/v1/crm/contactos` | Contactos, con búsqueda por nombre o teléfono |
| `GET /api/v1/crm/contactos/:id/ficha` | La ficha del panel lateral, en **una** petición |
| `PATCH /api/v1/crm/oportunidades/:id/etapa` | Mover de etapa, con la regla de pérdida |

Para encenderla hacen falta dos variables en el `.env` de la raíz —`NEXT_PUBLIC_USE_REAL_CRM=true`
y `NEXT_PUBLIC_DEV_TENANT_ID`, que imprime `pnpm db:seed` al terminar—. Están explicadas en
`.env.example`. **Ni tú ni Claude podéis escribir ese archivo**: lo bloquea un hook de
seguridad, y hace bien.

## 6. Dos cosas que decide el propietario y te afectan

- **El ADR-0009 está en «Propuesto», sin firmar.** Propone retirar `Temporada` como eje de
  precio y la matriz de acomodación. Tú ya construiste `/catalogo` y `/cotizador` sobre ese
  modelo. **No deshagas nada**, pero tampoco construyas más encima de esa parte.
- La verificación de Meta no ha empezado, así que **no hay ni un mensaje real de WhatsApp**
  todavía. La bandeja seguirá con datos simulados aunque enciendas el interruptor del CRM.

---

## 7. Tu tarea ahora

Está en `COLA.md`. Si al leerla todas aparecen marcadas, es que la cola se quedó vacía: escríbelo
en `ENTREGA.md` y coge la primera de `COLA-DESPUES.md`. **Nunca te quedes sin tarea, pero tampoco
inventes una**: el roadmap y el tablero de Jira mandan sobre la ocurrencia.
