# 2026-10-10 — El día que medir dejó en evidencia a compilar

Cuatro defectos salieron hoy, y **ninguno** lo habría encontrado una compuerta. Los cuatro
aparecieron al mandar una petición de verdad contra un proceso de verdad.

## Lo que pasó

**1. Una bandeja en la que no llegaba ni un evento.** Antigravity entregó el tiempo real con
`lint`, `typecheck`, `build` y `format:check` en verde. Su emisor armaba el identificador así:

```ts
'00000000-0000-4000-8000-' + Date.now().toString(16).slice(-12)
```

`Date.now().toString(16)` mide once caracteres y el último grupo de un UUID necesita doce.
`slice` no rellena. Cada mensaje salía por su propio `safeParse` como «descartado en silencio».
La entrega afirmaba haber implementado dos reglas de producto que **solo se disparan con ese
evento**: no se pudieron haber visto funcionar ni una vez.

Lo irónico es que el descarte silencioso está **bien** implementado —el contrato lo exige— y es
justo lo que escondió el defecto.

**2. Nest construyó un controlador con cero dependencias y no dijo nada.** El `POST` del webhook
respondía 500 a todo. `this.registrar` llegaba `undefined`. No hubo error de arranque, no hubo
aviso: Nest decidió que ese constructor no pedía nada. Un `@Inject` explícito lo resolvió, pero
lo que importa es la clase de fallo — **el mismo silencio es posible en cualquier otro módulo**.

**3. La clave de cifrado medía 48 bytes.** El generador la escribe en hexadecimal y el código la
leía como base64. 500 a todo, otra vez.

**4. Un `.env.bak` con las credenciales anteriores, sin ignorar.** Lo dejó mi propio script de
rotación, en los tres worktrees. `.gitignore` nombraba `.env`, `.env.local` y `.env.*.local`: un
patrón por extensión deja fuera lo que no se nombró. Un `git add -A` lo habría subido.

## Lo que aprendimos, que no es nuevo pero cada vez duele más

**Las compuertas verifican que el código es válido, no que hace algo.** Los cuatro defectos
convivían con las cuatro compuertas en verde. Lo único que distingue «compila» de «funciona» es
una aserción que se pone roja cuando el comportamiento desaparece — y por eso cada corrección de
hoy llevó su prueba, comprobada por mutación: se rompe el código a propósito y se mira que la
prueba caiga.

**Y una del método, no del código: la revisión hay que escribirla donde el otro mira.** Rechacé
la entrega de tiempo real en `REVISION.md` diciendo «esto antes que nada nuevo». Antigravity
construyó encima cuatro funcionalidades más sin tocarlo, porque su ciclo lee `COLA.md`. No fue
desobediencia: fue que puse el aviso en la puerta equivocada. Los bloqueantes viven ahora en la
cola, arriba, con la regla escrita de que bloquean lo demás.

## Qué quedó en pie

El webhook recibe. Verificado contra Neon con `POST` firmados: el primero guarda la recepción
cifrada con dos `change` pendientes, el segundo responde «ya estaba guardada» —que solo puede
saberlo si el primero escribió— y una firma ajena da 403 sin tocar la base. El identificador es
el `sha256` del cuerpo crudo, así que el reintento de Meta cae en la fila que ya existe: la
idempotencia de R5 no es una comprobación añadida, es la forma de la clave.

90 pruebas en `apps/api`. `ESTADO.md` dejó de mentir en ocho puntos. El tablero de Jira tiene 38
tickets en dos sprints.

## Lo que sigue dependiendo de una persona

El modo desatendido está detenido en la compuerta, y es correcto que lo esté: el integrador no
acepta de segunda mano un cambio a la configuración que define lo que los agentes pueden hacer
sin preguntar. Y menos uno que metía `git clean -xdf` en la lista de permitidos, que es `rm -rf`
por otra puerta, con tres `.env` recién rotados en el árbol.
