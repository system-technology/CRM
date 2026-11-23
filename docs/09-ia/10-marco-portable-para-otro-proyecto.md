# Marco de trabajo con agentes de IA — versión portable

> **Para quién es este documento.** Para una IA (Antigravity, u otra) que va a **implementar este
> marco en un repositorio distinto**, desde cero. No es documentación de ViajaPro: es la parte del
> marco que **sobrevive al cambio de proyecto**, separada de la que no.
>
> **Quién lo escribe y con qué autoridad.** Se extrae de ViajaPro, un SaaS multi-tenant
> desarrollado casi enteramente por agentes entre octubre y noviembre de 2026: ~680 commits en 20
> días, 537 PR, 15 compuertas de CI. El marco se ganó a base de errores concretos, y abajo se citan
> esos errores con fecha. **Lo que no se pudo comprobar aquí va marcado como no comprobado.**

---

## 0. Antes de implementar: lo que hay que confirmar

Este documento asume lo siguiente. **Si algo no se cumple, hay que decirlo antes de empezar**, no
adaptarlo en silencio:

| Supuesto | Si no se cumple |
|---|---|
| El código vive en **GitHub**, con PR y CI | Las secciones 4.3 y 4.4 hay que rehacerlas para GitLab/otro |
| Hay **una persona** que decide y aprueba («el propietario») | Con un equipo, la sección 4.3 cambia: varios aprobadores |
| Los agentes tienen **shell y acceso a `git`/`gh`** | Sin shell no hay barandillas locales; queda solo el CI |
| La rama principal **se puede proteger** (plan que lo permita) | Sin protección de servidor el marco entero es voluntario |

**Regla de oro de este traspaso:** implementa en el orden de la sección 4. Cada paso se verifica
antes de pasar al siguiente, y el criterio de verificación está escrito. Un paso «hecho» sin su
comprobación no está hecho.

---

## 1. El problema que este marco resuelve

No es «organizar el trabajo». Es uno más específico y más peligroso:

> **Los agentes producen más rápido de lo que nadie puede revisar, y mienten sin querer.**

No mienten por diseño: heredan un estado escrito, no lo comprueban, y lo repiten con la misma
confianza con que repiten lo que sí verificaron. Nada en la salida distingue una cosa de la otra.

Dos casos reales de ViajaPro, por si suenan abstractos:

- **2026-11-21.** El estado del proyecto afirmaba «no hay nada desplegado» y «ninguna agencia lo ha
  visto». Llevaba **tres turnos** repitiéndose. Las dos cosas eran falsas: había un servicio vivo y
  un cliente entrando. *Un estado heredado envejece hacia el pesimismo igual que hacia el
  optimismo, y las dos formas mienten.*
- **2026-11-21.** Un traspaso decía en mayúsculas «el cierre automático NO cierra nada, lo comprobé
  CINCO veces». La observación era cierta y el diagnóstico falso. **Nadie había abierto el log**: al
  abrirlo, el fallo estaba en una línea. *Contar las veces que algo falla no es diagnosticarlo.*

Todo lo que sigue existe para una de dos cosas: **que no se pueda afirmar sin comprobar**, o **que
no se pueda hacer mal lo que ya está decidido**.

---

## 2. Veredicto honesto: qué copiar y qué no

Esto es lo más importante del documento. **Copiar el marco entero sería un error.**

### Cópialo — demostró su valor

| Pieza | Por qué |
|---|---|
| **Separar «verificado» de «supuesto»** en toda afirmación | Es la regla más barata y la que más errores atrapó. Si solo implementas una, que sea esta |
| **Autor ≠ aprobador** (apps con identidad propia) | Sin esto, quien escribe se aprueba a sí mismo. Ver §4.3 |
| **Barandillas con lógica pura y pruebas** | Un guardián sin pruebas produce falsos positivos, y un guardián que bloquea lo legítimo acaba desactivado |
| **La regla de parada** (bloqueante vs. cola) | Impide la espiral de auditar auditorías. Ver §4.5 |
| **Que cada regla tenga mecanismo** | Ver §3, principio 1. Es la lección más cara de todas |

### No lo copies — aquí sobró

| Pieza | Qué pasó de verdad |
|---|---|
| **Ocho artefactos de memoria** (estado, diario, checkpoint, marco, contexto, bitácora, cola, tablero) | Demasiados para una persona. El archivo de estado **se quedó 18 días obsoleto**, el diario tuvo que **corregirse a sí mismo** dos veces en un día. **Empieza con dos**: uno vivo y uno histórico |
| **Una cola de 612 tareas** (267 cerradas, 345 abiertas) | Crece más rápido de lo que se cierra. Eso no es un plan, es una lista de deseos. **Pon un tope duro**: si entra una, sale una |
| **Un ciclo autónomo desatendido** | Se detuvo dos veces: una por cuota agotada, otra porque la cadena de sesiones tenía un límite de profundidad que **nadie estaba contando**. No lo intentes hasta que lo manual funcione |
| **Una capa de ~20 agentes especializados** | Útil en un dominio grande; en un proyecto chico es ceremonia. **Empieza con tres**: quien construye, quien revisa, quien integra |

### La crítica de fondo, que también es honesta

El marco optimiza **la veracidad del proceso** extraordinariamente bien, y **no obliga a entregar
valor al cliente**. En ViajaPro esto es medible: ~680 commits en 20 días, 15 compuertas verdes, y
las tareas de máxima prioridad que siguen abiertas **no son de código** — esperan un despliegue, un
trámite o una decisión del propietario. Se puede estar impecablemente honesto sobre no avanzar.

**Si implementas esto, añade lo que a ViajaPro le faltó:** una métrica de resultado, no de proceso.
Una sola, visible, revisada cada semana. «¿Qué puede hacer hoy un usuario real que no podía hacer la
semana pasada?» Si la respuesta es «nada» tres semanas seguidas, el marco está funcionando y el
proyecto no.

---

## 3. Los seis principios

Implementa los mecanismos de la §4 con estos principios en la cabeza. Cada uno nació de un error.

1. **Una regla sin mecanismo es decoración.** *Error que lo enseñó (2026-11-23): el marco exigía
   por escrito abrir los PR con una app de servicio. Nadie lo hacía. Seis PR quedaron
   permanentemente inaprobables.* Si escribes una regla y no puedes nombrar qué la impide incumplir,
   no has escrito una regla.
2. **Una compuerta que no bloquea es peor que ninguna.** *Error: una compuerta de seguridad corría
   en cada PR, se pintaba en rojo y **no estaba en los checks requeridos**. Avisaba y no impedía
   nada, generando confianza falsa durante días.* Verifica que cada compuerta **rechace** de verdad.
3. **Verificado y supuesto se separan siempre.** En respuestas, en commits, en documentos. «Está
   listo», «el CI está verde», «quedó integrado» solo con evidencia del mismo turno. Si no se
   comprobó, se escribe **«sin verificar»**.
4. **Prometer es ejecutar en el mismo turno, o apuntarlo.** Nunca «empiezo ahora» sin la llamada que
   empieza. Lo prometido y no hecho va a una lista explícita.
5. **Falla cerrado, nunca en silencio.** *Error: una barandilla no entendía las rutas de Windows,
   caía a un respaldo y miraba la rama equivocada. **Un respaldo silencioso delante de una
   comprobación de seguridad la apaga sin avisar.*** Si un guardián no puede decidir, bloquea.
6. **Corrige con una entrada nueva; no reescribas la historia.** Cuando algo escrito resulta falso,
   se añade la corrección y **se deja el error a la vista**. El error enseña más que la frase
   corregida.

---

## 4. Implementación, en orden

### 4.1 — Dos archivos de memoria (no ocho)

Crea exactamente estos dos. Resiste la tentación de añadir más hasta que estos se queden cortos.

**`ESTADO.md`** — *qué pasa ahora.* Versionado. Se reescribe entero; no acumula.

```markdown
# ESTADO

| Campo | Valor |
|---|---|
| Última actualización | <fecha> — <qué la motivó> |
| Verificado contra | <commit> · <cómo se comprobó> |
| Siguiente hito | <una sola cosa> |

## Verificado
<lo comprobado este turno, con el comando o la URL que lo comprueba>

## Supuesto
<lo que se cree pero no se comprobó, marcado así>

## Prometido y NO hecho
<lista explícita; vacía es una respuesta válida>

## Bloqueado, y por quién
<qué espera, de quién; si espera a una persona, dilo>
```

**`DIARIO.md`** — *qué se decidió y qué se aprendió.* Versionado, **append-only**, lo más nuevo
arriba. Una entrada por lote de trabajo, no por commit. Cada entrada separa verificado de supuesto.
**Una entrada falsa no se borra: se corrige con otra debajo** (principio 6).

> **Criterio de verificación de este paso:** los dos archivos existen, y `ESTADO.md` tiene las
> cuatro secciones. Si falta «Prometido y NO hecho», el paso no está hecho — es la sección que
> cuesta y la que sirve.

### 4.2 — Carriles: un PR no mezcla dominios

Define 2-4 **carriles** por dominio, con prefijo de rama, y la regla de que **un PR vive en un solo
carril**. En ViajaPro: `a/` backend y datos, `b/` frontend, `i/` documentación e infraestructura.

Por qué importa de verdad: no es orden estético, es que **un PR que toca todo no se puede revisar**,
y un agente lo toca todo con una facilidad que una persona no tiene.

Añade un check de CI que lea los ficheros del PR y falle si cruzan carriles, **con una salida
explícita** (una etiqueta tipo `override-lane` que solo ponga quien integra) — porque habrá casos
legítimos y una compuerta sin escape se termina desactivando entera.

Y lo que va **siempre en PR aparte**, sin excepción: migraciones de base de datos, cambios de
permisos o aislamiento, y secretos.

> **Criterio de verificación:** abre un PR a propósito que cruce dos carriles. Debe fallar. Ponle la
> etiqueta de escape. Debe pasar. **Si no probaste las dos, no sabes si funciona.**

### 4.3 — La pieza clave: autor ≠ aprobador

**Esto es lo que más valor tiene de todo el documento, y lo que más fácil se implementa mal.**

El problema: si el agente abre los PR con la cuenta de la persona que debe aprobarlos, **GitHub no
deja aprobar el PR propio**. Un PR que requiera aprobación queda inaprobable para siempre. No es
incómodo: es un bloqueo total, y se descubre tarde.

**La solución, en tres partes:**

**(a) Una GitHub App por carril.** Cada una con su identidad. Los agentes actúan a través de ellas,
nunca con la cuenta de la persona. Crea las apps, instálalas en el repositorio, guarda las claves
privadas **fuera del repositorio** (p. ej. `~/.claves-<proyecto>/`), y los App ID en un JSON
versionado (no son secretos).

**(b) Un único punto de entrada que no filtre el token.** Un script que obtenga el token de la app
en un proceso hijo, lo use, y **nunca lo imprima ni lo deje en el entorno**. Debe **fallar si no
consigue el token: jamás caer a la cuenta de la persona** (principio 5). Recorta además lo que una
sesión puede hacer: nada de `auth`, `secret`, `variable`, borrar el repositorio, ni tocar la
protección de rama.

```
  node scripts/app.mjs <carril> gh pr create --title "…" --body-file …
  node scripts/app.mjs <carril> push
```

**(c) Una compuerta de CI para las rutas sensibles.** Define una lista de rutas que exigen revisión
humana (migraciones, permisos, CI, scripts, dependencias, decisiones de arquitectura). Un PR que las
toque necesita la aprobación de la persona **sobre el commit actual**; los demás pasan sin
enterarse.

Tres detalles que cuestan caro si se omiten:

- Dispárala con `pull_request_target` y **checkout de la rama base**, nunca del PR. Si no, un PR
  puede reescribir la compuerta que lo juzga.
- **Añádela a los checks requeridos de la protección de rama.** Si no, pinta rojo y no bloquea nada
  (principio 2). *Esto exactamente pasó en ViajaPro.*
- Que **avise explícitamente** cuando el autor es la persona que debe aprobar, diciendo qué hacer:
  es el fallo que más desconcierta.

**(d) Y la barandilla local, que es la que de verdad lo evita.** Las tres partes anteriores detectan
el problema **después** de crear el PR. Un hook local que intercepte el shell y **bloquee**
`gh pr create` y `gh pr merge` fuera del script de la app lo evita **antes**. El camino correcto
empieza por `node`, no por `gh`, así que distinguirlos es trivial.

> **Criterio de verificación, y es el paso que más se finge:**
> 1. Abre un PR con la app → el autor debe ser el bot, no tu cuenta.
> 2. Haz que toque una ruta sensible → la compuerta debe pedir aprobación.
> 3. Apruébalo con la cuenta de la persona → debe ponerse en verde.
> 4. Intenta `gh pr create` a secas → el hook debe **bloquear**, no advertir.
>
> **Los cuatro, o el paso no está hecho.**

### 4.4 — Barandillas locales: lógica pura y con pruebas

Las barandillas que corren en la máquina del agente (hooks) deben tener la **decisión separada del
efecto**: una función pura que recibe el comando y devuelve un veredicto, y un hook delgado que lee
el estado real y aplica.

**No es preferencia de estilo. Es la diferencia entre poder probarlo y no.** En ViajaPro, la primera
versión de la guarda de rama produjo **tres falsos positivos en un día**, todos de la misma causa:
trataba como comando lo que era prosa.

1. `git push origin --delete otra-rama` estando en la rama principal → **no escribe en ella**, y se
   bloqueaba.
2. `git commit -m "... no se integra a main ..."` → la palabra **en el mensaje** disparaba la guarda.
3. `grep "git push origin main"` → el patrón **de búsqueda** la disparaba.

La corrección: **tokenizar respetando comillas**, partir por separadores del shell, descartar los
cuerpos de heredoc, y analizar solo los segmentos cuya **cabeza** es el programa. *Una cadena entre
comillas es un argumento, nunca un subcomando.*

Y en el archivo de la barandilla, **escribe esa historia**. ViajaPro la tiene en la cabecera, y es lo
que impide que el siguiente agente «simplifique» la función de vuelta al error.

> **Criterio de verificación:** la batería de pruebas incluye **los falsos positivos** de arriba,
> no solo los casos que deben bloquear. Una batería que solo prueba lo que bloquea garantiza un
> guardián insufrible.

### 4.5 — La regla de parada

Escrita en ViajaPro después de **un día entero sin entregar nada**: veintitantos commits, tres
rondas de revisión de un documento que creció a mil líneas, dos auditorías de su implementación, y
cero funcionalidad nueva. **Los hallazgos eran reales. El proceso, no.**

Dos categorías, y hay que separarlas en voz alta:

| | Qué es | Qué se hace |
|---|---|---|
| **Bloqueante** | Algo que **hoy** está roto o es falso: una compuerta que no corre, una afirmación que el sistema no cumple, una fuga de datos posible | Se corrige antes de integrar |
| **Cola** | Algo que empieza por «el día que…», «si alguien mañana…», «cuando haya volumen…» | Va a la cola con dueño. **No bloquea** |

Ambos se escriben. **Solo uno detiene la entrega.**

- **Una vuelta de revisión**, y se integra. Lo que no se corrigió en esa vuelta va a la cola.
- **No se auditan auditorías.** Si una segunda pasada solo encuentra cosas de la columna derecha, la
  primera ya cumplió.
- **Dónde no se recorta nunca:** lo que, si falla, no se arregla después. En un SaaS multi-tenant es
  el aislamiento entre clientes. En tu proyecto, identifícalo y escríbelo — **ahí sí van las vueltas
  que hagan falta**.
- **El coste de no entregar también es un riesgo, y hay que contarlo.**

### 4.6 — El arranque de cada sesión

Un hook de inicio que inyecte `ESTADO.md` y las últimas entradas de `DIARIO.md`. Y un protocolo de
cinco minutos, que es donde el marco se gana o se pierde:

1. Leer lo inyectado. **No volver a preguntar lo ya decidido.**
2. **Verificar antes de hablar:** PR abiertos, últimas corridas de CI, qué hay desplegado. Con
   comandos, no de memoria.
3. Responder en **cinco líneas**: qué está verificado, qué se prometió y no se hizo, qué se hace
   primero. **Sin recapitular la historia.**
4. **Ejecutar «Prometido y NO hecho» antes de abrir trabajo nuevo.**

> **Criterio de verificación:** arranca una sesión nueva y mira si el agente **comprueba** antes de
> afirmar. Si su primera respuesta repite el estado escrito sin un solo comando, el protocolo no
> está implementado — está decorando.

---

## 5. Orden de implementación y presupuesto

| # | Paso | Esfuerzo | Se puede omitir |
|---|---|---|---|
| 1 | §4.1 Dos archivos de memoria | 1 h | No. Es la base |
| 2 | §4.6 Hook de arranque y protocolo | 2 h | No. Sin esto los archivos se ignoran |
| 3 | §4.5 Regla de parada (escribirla) | 30 min | No. Es gratis y evita el día perdido |
| 4 | §4.3 Autor ≠ aprobador | 4-6 h | **No, si hay rutas sensibles.** Es lo más valioso |
| 5 | §4.4 Barandillas con pruebas | 3-4 h | Sí al principio, si el equipo es pequeño |
| 6 | §4.2 Carriles | 2 h | Sí, hasta que los PR empiecen a ser ilegibles |

**No implementes del 4 en adelante sin haber verificado del 1 al 3.** Es el orden en que ViajaPro
*debería* haberlo hecho; lo hizo al revés y por eso la §4.3 llegó tarde y con seis PR muertos.

---

## 6. Lo que este documento NO afirma

Honestidad sobre sus propios límites, que es la regla 3 aplicada a sí mismo:

- **No está probado en otro proyecto.** Todo lo de aquí funcionó en **un** repositorio, con **un**
  propietario, con agentes de Claude. Que funcione en otro contexto es **supuesto, no verificado**.
- **No sustituye la revisión humana.** Las compuertas atrapan lo mecánico. El error de diseño, el
  requisito mal entendido y la decisión mala pasan todas las compuertas en verde.
- **No garantiza entregar.** Ver §2: en ViajaPro el marco funciona y el producto sigue sin tocar a
  un cliente real. Si implementas esto sin una métrica de resultado, habrás construido un proceso
  honesto alrededor de un proyecto detenido.

---

## 7. Qué devolver al terminar

Un informe con, para cada paso de la §4:

- **Hecho / No hecho / Hecho parcialmente** — con el criterio de verificación **ejecutado**, y su
  salida pegada. No «se implementó la compuerta», sino «abrí el PR de prueba y falló así: `…`».
- **Lo que no se pudo hacer, y por qué.** Preferible a un «hecho» que no resiste una comprobación.
- **Dónde este documento se equivocó** al chocar con el repositorio real. Esa parte es la más útil:
  significa que el marco viajó y aprendió algo.
