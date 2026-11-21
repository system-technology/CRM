# DIARIO — memoria versionada del proyecto (lo más reciente primero)

> **Para qué sirve.** `CONTEXTO.md` guarda lo estable (quién decide, trampas, cómo se integra).
> Este diario guarda **lo que cambia**: decisiones, hitos y la cola viva. Se lee al iniciar cada
> sesión (hook `contexto-persistente.mjs`) y es lo que sobrevive a compactar, a un clon nuevo y a un
> Codespace. La capa rápida es `CHECKPOINT.local.md` (ignorada por git, sin PR); aquí se consolida.
>
> **Reglas.** Entradas cortas y fechadas, la más nueva arriba. Cada una separa **Verificado**
> (comprobado con `gh`/`git`/navegador) de **Supuesto**. Sin secretos. Si una entrada queda falsa,
> se añade otra que la corrige; no se reescribe la historia. Se consolida por lote en la carril
> `i/` (rama `i/T-000-…`, alcance `hilo`).

---

## 2026-11-21 (cierre del lote de mediodía) — Dinero mal pintado, una compuerta de permisos y una mutación que midió el aislamiento

**Corrige y completa la entrada de abajo**, que se quedó corta: decía «integrados #427 y #428, abierto #430», y después entraron cuatro más.

**Verificado** (con `gh`/`git`, mismo turno): `main` pasa de `a177ce83` a **`d755ea69`**. **Siete PR integrados**, todos en serie y con squash a mano: **#427** (T-510), **#428** (T-528), **#430** (rastro), **#429** (T-520, T-521), **#433** (T-543, T-544), **#434** (T-548 y cierres) y **#432** (T-537, T-529). **#431 cerrado por sustitución.**

**Lo que más valió del lote no fue una funcionalidad: fue un defecto de R8 vivo.** `formatearDeltaDinero` formateaba unidades mínimas sin partirlas por los decimales, así que **toda moneda con decimales se pintaba cien veces de más**, con unos «,00» que le daban aire de exactitud. En COP acertaba por casualidad, porque allí la unidad mínima es el peso. Lo avisó de propina la sesión de T-520/T-521, lo verificó la madre leyendo el fuente, y lo arregló otra sesión con aritmética de `BigInt`. Es exactamente el error que `CLAUDE.md` dice que «ya llegó a la pantalla una vez» — seguía ahí.

**El criterio que ordenó el lote: una prueba que nadie ha visto fallar no es evidencia.** Se aplicó tres veces y las tres dieron algo distinto:
- **T-520**: con la tabla de monedas actual (0/2/2/2), un recorrido a secas **habría pasado en verde con el bug puesto**. La sesión añadió KWD durante la ejecución y vio la prueba ponerse roja. Evidencia.
- **T-543**: la sesión trajo el fallo literal con el código viejo — `expected '+ $ 125.050,00 USD' to be '+ $ 1.250,50 USD'`. Evidencia.
- **T-528**: ni su sesión ni la auditoría mutaron la e2e de aislamiento. **Hueco reconocido, no defecto**: es T-547.

**La mutación de T-529 y por qué su resultado no es el que parece.** Tras la auditoría se pidió **una vuelta más, solo por aislamiento entre agencias** (§3.1: el único sitio donde no se recorta), porque el e2e del endpoint nuevo no cruzaba agencias. La sesión fue más allá y **midió**: quitó el filtro de `tenant_id` y lanzó el CI. **`test` salió VERDE.** La lectura fácil —«la prueba no discrimina»— es **falsa**: significa que **RLS sola sigue cubriendo esa ruta**. Se derriba una capa y la otra aguanta; es R2 funcionando, y ahora está medido en vez de leído. Lo que **no** demuestra, y la propia sesión se negó a venderlo así: que la aserción cace una fuga, porque no hubo fuga que cazar.

**T-537, el hallazgo que casi bloquea #428, cerrado en el mismo día en que se abrió.** `porCobrar` se omite sin `cobro.ver`, y la omisión es real: el puerto **ni se invoca**, así que el dato nunca se lee de la base. Al auditarlo, lo que más se miró fue si el cambio de fixture aflojaba alguna prueba —habría sido lo peor que podía traer el PR—: no lo hace, y la discriminación **se añade**.

**Dos compuertas rotas, descubiertas por mirar un rojo en vez de encogerse de hombros.** **T-542**: el job «Marcar la tarea como hecha» falla tras *cada* merge y no lo veía nadie, porque corre después del merge y no está entre los checks obligatorios. **T-548**: una e2e de ingreso falla **2 de cada 3 veces**; el locator resuelve 24 veces sobre el mismo valor viejo, lo que apunta a que la fila nunca se revalida — si es eso, el defecto está en la web y la prueba tiene razón en fallar. Subida a P1. Ninguna de las dos la habría encontrado nadie leyendo código.

**Coste, que también es un resultado.** Cinco sesiones hijas: 164, 291, 161, 134 y **324 mil tokens** (esta última, **25,51 USD**). La más barata (0,80 USD) fue la de encargo más acotado: dos tareas del mismo fichero, con el defecto ya verificado y el criterio escrito. **Ninguna sesión ve su propio consumo**, así que el tope de 150 mil no es una norma que se cumpla sola: es trabajo de la madre en cada vuelta.

**Supuesto** (no verificado): que las e2e en paralelo aguanten sin 40P01; es la apuesta de T-510 y lo dirá el CI.

**Pendiente del propietario, nuevo:** queda publicada la rama `a/T-529-mutacion-aislamiento` **con el filtro de tenant retirado a propósito**. Sin PR y con `main` protegida no puede entrar sola, pero el repositorio es público. **El proxy deniega los borrados (403)** a las sesiones; está en la bandeja como punto 9.

**Cola que deja el lote:** T-537 a T-552 (dieciséis), de las que siguen abiertas T-538 a T-542, T-544 a T-552. **Siguiente id libre: T-553.**

---

## 2026-11-21 (cuarto lote) — Una apuesta medida en las pruebas, el alcance entre asesores y una compuerta que llevaba rota

**Verificado** (con `gh`/`git`, mismo turno): `main` pasa de `a177ce83` a **`aa38bdf9`**. Integrados en serie y a mano con squash: **#427** (**T-510 `done`**) y **#428** (**T-528 `done`**). Abierto queda **#430**, el rastro documental de este lote.

**T-510 — lo que se demostró y lo que no.** El 40P01 de `invitaciones` queda cerrado con log real del CI: un `TRUNCATE` lanzado desde el paquete `database` contra la limpieza de las e2e de la api; **dos paquetes**, y lo cerró #408. El de `historial-de-etapas` **no se demostró**: queda atribuido por mecanismo. El PR retira además la ejecución en serie que metió #415, que costaba ~65 s de mediana por PR sin evidencia detrás. **Matiz que añadió la madre al integrar, y que el PR no decía:** las 32 corridas limpias que cubren el criterio de «cinco seguidas» se midieron con la configuración **en serie**, justo la que el PR retira; en paralelo la evidencia es n=2 aquí más n=17 históricos. Es una apuesta medida, no una certeza, y la vuelta atrás es una línea (`fileParallelism: false`).

**T-528 — auditoría independiente, sin bloqueantes.** Es alcance entre asesores, así que llevó auditoría propia (R13). El aislamiento está bien hecho: el `asesorId` que llega del cliente pasa siempre por `alcanceDeReporte()` y sin `reportes.ver_agencia` responde **403**, no un recorte en silencio. El acierto estructural del PR es que la firma del puerto **no tiene valor por defecto**: olvidar el filtro ya no compila, y olvidarlo era devolver toda la agencia.

**El hallazgo que estuvo cerca de bloquear, y cómo se decidió.** El saldo por cobrar se sirve **sin exigir `cobro.ver`** mientras las pantallas de cobro sí lo exigen, lo que contradice el ADR-0035 §4 («nunca más amplio»). Se clasificó como cola —no bloqueante— **después de verificar** que no existe ningún endpoint para componer roles a medida, de modo que hoy ninguna agencia puede alcanzar ese estado. Queda como **T-537 (P1)** con la condición escrita: **el día que ese endpoint exista, deja de ser cola.** La lección de método es que la frontera entre «hoy roto» y «el día que…» (§3.1) se decide comprobando, no razonando.

**Hallazgo nuevo, T-542 (P1): una compuerta que llevaba tiempo sin correr.** El job «Marcar la tarea como hecha» **falla tras cada merge** (corrida 44904456823). No lo veía nadie porque corre *después* del merge y no está entre los 14 checks obligatorios. Dos causas distintas: **18 tareas** con `type`/`effort` fuera del enum de `tools/roadmap-mcp/roadmap.mjs` (mecánico) y **20 tareas `in_progress`** cuando el validador exige una (no mecánico: es criterio de producto, tarea del `dueno-de-producto`). **Mientras siga roto, cerrar una tarea es un acto manual y `roadmap/tasks.yaml` miente en cuanto alguien se olvida.** La madre no lo arregló a propósito: triar 20 tareas es justo el trabajo que no le toca.

**Operación.** Se corrigió una afirmación falsa del tablero: decía que la madre no puede crear su tarea programada porque el clasificador lo deniega. **Sí puede.** Ahora hay **una sola**, `trig_01Cq7TrGZ9uGFc9uAmqQEDtr`, apuntando directamente a la madre, en vez del relevo en dos saltos que despertaba a la sesión saliente de 688 mil tokens solo para reenviar un mensaje. La vieja ya no existía al ir a borrarla; **quién la borró no está verificado** y se anota como incógnita.

**Supuesto** (no verificado): que la configuración en paralelo de las e2e aguante sin 40P01 a medio plazo. Es la apuesta de T-510 y se sabrá por el CI.

**Coste.** Las dos sesiones hijas se archivaron tras entregar: T-510 en 164 mil tokens, **T-528 en 291 mil y 14,29 USD**. Ninguna de las dos avisa de su propio consumo: el tope de 150 mil **lo tiene que mirar la madre**, sesión por sesión.

**Cola que deja el lote:** T-537 (P1), T-538, T-539, T-540, T-541 y T-542 (P1). **Siguiente id libre: T-543.**

---

## 2026-11-21 (tercer lote) — Cobros en pantalla, catálogo de permisos y el coste de las pruebas en serie

**Verificado** (con `gh`/`git`, mismo turno): `main` en **`e16f5499`**, cero PR abiertos. Integrados en serie y a mano con squash: **#414** (relevo de la orquestadora y aviso al despertar en el tablero), **#416** (**T-505 `done`**: una prueba compara el `CHECK` `roles_permisos_del_catalogo` con `PERMISOS` en los dos sentidos; comprobado en el log del CI que corre contra Postgres real y que no es vacua), **#415** (T-510) y **#410** (**T-331 `done`**: registrar un pago y ver el saldo en el archivo de viaje).

**Lo que de verdad importó:** #410 llegó con los 14 checks en verde y **no era integrable**. La auditoría independiente —obligatoria por ser dinero en pantalla (R13)— encontró tres bloqueantes reales: el saldo a favor se pintaba **en negativo** bajo la etiqueta «Saldo a favor» y la confirmación decía **siempre** «Falta por cobrar»; la clave de idempotencia vivía en el diálogo, así que cerrarlo y reabrirlo tras un fallo de red **cobraba dos veces** al viajero; y un aviso afirmaba que la nota no se guarda cuando se guarda en claro en el historial inmutable. **Ningún check los habría visto**, porque la e2e evita el camino de sobrepago a propósito. Corregidos los tres con prueba de regresión. Cola abierta: **T-515..T-521**; el siguiente id libre es **T-522**.

**Hallazgo del día:** el `navegador` rojo de #410 **no era un bug**. La semilla vale $ 550.000 y la prueba pagaba $ 1.500.000 fijos; el servidor lo rechazó por sobrepago y el diálogo se quedó abierto *como debía*. Dos lecciones que valen más que el arreglo: una prueba de dinero no lleva cifras fijas, y un fallo de e2e debe leer el mensaje de la pantalla en vez de decir solo «seguía abierto». De paso quedó verificado el camino de sobrepago entero contra la API real.

**Supuesto / sin verificar:** **T-510 sigue `in_progress`** — exige cinco corridas de CI seguidas sin rojo y van **cero**, y los deadlocks 40P01 no se reprodujeron ni se cerraron. **Ninguna sesión puede levantar Postgres en local**: todo lo de «API real» lo validó el CI y lo visual salió de modo demostración. Nada desplegado.

**Medido, que nadie lo había medido:** la ejecución en serie de las e2e de `apps/api` sube el job `test` de **3m11s a 4m26s**, un 40% más en cada PR.

**Compuerta que no estaba apretada:** el tope de 150 mil tokens por sesión **no se cumple solo** — ninguna sesión recibe aviso de su consumo. La hija de T-331 acabó en **354 mil tokens y 31 USD**, y lo hizo notar ella misma. La madre tiene que consultar `get_session` → `context_usage` en cada vuelta del ciclo. Dato de coste comparado, del mismo turno: las dos sesiones Sonnet entregaron trabajo bueno por **0,74 y 0,67 USD**.

**Bloqueo del propietario (punto 8f):** tras el relevo, el despertar de 2 h sigue apuntando a la madre anterior. `create_trigger`, `update_trigger` y `send_message` a la madre anterior fueron denegados y **ninguno se rodeó**. Mitigación: aviso al despertar en la cabecera del tablero, en `main` y en la rama `claude/repository-status-d4ug6p`. Detalle: [bitácora](../_bitacora/2026-11-21-tercer-lote-cobros-permisos-y-pruebas.md).

**Trampa nueva:** el `scope` de commitlint es lista cerrada y **los nombres de los agentes no están en ella** (`datos`→`db`, `qa`→`test`, `backend`→`api`). Mató #411, #412 y un primer intento del tablero. Como `--force-with-lease` está denegado, obliga a recrear la rama. En [el tablero, §7](TABLERO-DEL-ORQUESTADOR.md).

## 2026-11-21 (segundo lote) — Alcance de vistas, permiso de reportes y pruebas sin carrera

Integrados #404 y #405 (ingreso con correo o usuario; sustituyen a #402 y #362), #406 (T-485), #407 (T-341, permiso `reportes.ver_agencia`, catálogo de 14 a 15) y #408 (T-503, las pruebas de la api esperan a las de la base). `main` en `44d8673`, cero PR abiertos. La llave del alcance de las vistas está aislada en `apps/web/src/lib/alcance-de-vista.ts`: T-342 solo cambia esa función. Cola nueva T-505 a T-511; resto de T-503 en T-510. Limitación que pesa: las sesiones no levantan Postgres en local, así que lo «probado en navegador» es contra API simulada. Detalle: [bitácora](../_bitacora/2026-11-21-segundo-lote-reportes-cobros-y-pruebas.md).

## 2026-11-21 (madrugada) — Lote de integración nocturno

**Verificado** (con `gh`/`git`): integrados #388, #358, #397, #393, #398, #401, #400 y #395; `main` en `c74b44d`. #401 sustituyó a #384, #386, #389, #390, #392, #399 y #396. Auditoría independiente de #358 y de #393 sin bloqueantes; la de #395 dejó un hallazgo en `completar` seguimiento.
**Abierto:** #402 (sustituto de #362), a la espera de «Carril y tarea» y de `override-lane` (propietario). #362 se cierra al integrar #402.
**Cola registrada:** T-494..T-504, más criterios nuevos en T-361 y T-490. Lo urgente es **T-503 (P1)**: tres pruebas de base comparten estado y fallan al azar (FK de etiquetas, deadlocks 40P01).
**Supuesto / sin verificar:** #402 a 390 px contra la API real; nada desplegado; la clave de la demo se da por perdida.
**Trampas nuevas:** en [el tablero, §7](TABLERO-DEL-ORQUESTADOR.md).

---

## 2026-11-21 — Ola 0 en marcha: navegación móvil, etiquetas, base de pagos y operación desatendida

**Decisiones del propietario**
- Operación desatendida hasta terminar el CRM (no solo el MVP): [roadmap maestro](../08-roadmap/09-roadmap-maestro-y-operacion-desatendida.md) (olas 0 a 4) y una tarea programada que despierta a la sesión madre cada dos horas. El orquestador queda autorizado a aprobar e integrar (también rutas protegidas, con auditoría hecha y CI verde). No alcanza a paneles, claves, `override-lane`, ni a nada del propietario: está en [`PENDIENTES-DEL-PROPIETARIO.md`](PENDIENTES-DEL-PROPIETARIO.md).
- Navegación: menú D1 a D4 (D3 reemplazada por reportes por niveles de acceso), barra móvil variante B (Hoy · Conversaciones · Cotizar · Archivos de viaje · Más, lupa fija), ADR-0032 aceptado, ADR-0031 (ingreso por apodo) aceptado.
- **El CRM se usa desde celular, tablet y navegador de escritorio** (aclarado hoy): la auditoría responsiva cubre las tres familias de ancho. Pendiente ampliar el criterio de salida 9 del roadmap de JD Tours, que aún dice «móvil 390 px».
- Sesión dedicada a analizar y rediseñar la interfaz y la experiencia de usuario (Fase 1 análisis sin código; Fase 2 con OK del orquestador).
- ADR-0034 (pagos del viajero, registro manual): integrado como *Propuesto* y tratado como aceptado tras dos revisiones (seguridad y turismo). Decididos: solo el dueño devuelve, ajusta, penaliza y reversa (`cobro.corregir`); el asesor solo registra el pago; plazo de cobro por agencia (30 por defecto); medios de pago ampliados; orden de la idempotencia escrito.

**Verificado** (con `gh`, CI en verde en cada PR)
- Integrados en `main`: guarda de segunda agencia (#363), barra móvil (#368), cotizar completo desde el celular (#369), la URL como estado (#371), paleta con la misma fuente que cada pantalla (#374), etiquetas por agencia: migración con RLS (#372), API (#379) y chips en la bandeja (#381), ADR-0034 (#378), libro de cobro `pagos` con permisos `cobro.*` (#382) y las etiquetas de esos permisos en la web (#383), más los PR de docs de cada lote.
- #382: `aislamiento-tenants` verde; fue la primera ejecución real de la migración `20261121140000`.
- Auditorías de seguridad sin bloqueantes en #363, #372, #379 y #382 (una de la sesión de trabajo y una independiente del orquestador en cada una; las de #372 y #382 fueron por lectura de código, la confirmación la dio el CI).

**Pendiente**
- Abiertos al escribir esto: #358 y #362 (ingreso por apodo), esperando `override-lane` del propietario; #385 (T-322), #387 (quita una unión temporal de tipos) y PR de docs.
- Cola nueva: T-330 (API de pagos, con las reglas por estado y la carrera registrar-pago contra cancelar-archivo), T-339 a T-346 (reportes por nivel), T-322 y los puntos menores de cada auditoría en `roadmap/tasks.yaml`.
- Propietario: secretos de Render y `DIRECT_URL`, proyecto de Vercel, `override-lane`, `navegador` como check obligatorio (contenido en el commit `27412e7`), autonomía de la sesión de cobros, decisión de coexistencia (ADR-0033) y pasarela.
- **Sin verificar:** que `AP14` salga omitida en `test` y corra en `aislamiento-tenants` (una pasada verde no descarta la intermitencia); la pantalla de etiquetas y de cotizar contra la API real fuera del CI; nada de esto está desplegado.

**Trampas nuevas**
- Con `strict` en la protección de `main`, cada integración deja `behind` a los demás PR: web y rutas protegidas se integran de una en una, con «ventana» pedida al orquestador, y los PR de docs con auto-merge los atrasan (se les quita el auto-merge mientras dura la ventana).
- `AP14` vacía `tenants`: no puede correr junto a los e2e de la API; se omite cuando `npm_lifecycle_event` es `test` (si reaparece roja, la salida es sacar `aislamiento.spec` del job `test`, y toca `ci.yml`).
- «Carril y tarea» rojo cuando un PR mezcla carriles; la etiqueta `override-lane` la pone solo el propietario. Se evita partiendo el cambio (caso de `permisos.ts`: unión temporal de tipos y luego limpieza).
- Un auditor puede leer el SQL pero no ejecutarlo: «integrable» por lectura no sustituye al job `aislamiento-tenants`.

---

## 2026-11-20 (tarde) — T-268 integrada: base del registro de agencias

**Verificado** (con `gh`)
- PR #323 integrado (`0f3a707`), 15 checks en verde. La migración `20261120140000` aplicó en Postgres 16 y `aislamiento.spec.ts` pasó 158/158 (bloque R-1 a R-10, incluidas S1 y las altas simultáneas).
- Auditoría de seguridad en dos pasadas, sin fugas entre agencias. Bloqueantes corregidos: B1 (orden del literal de `excepciones_rls`), B2 (otra sesión había integrado `perfiles_de_agencia`; T-268 pasó a extenderla y reemplazar su disparador) y B3 (tipos sin calificar en `crear_agencia` frente a `pg_temp`, con aserción en la migración y prueba R-10).

**Pendiente**
- Cola: T-306 (mismo patrón de `pg_temp` en otras 15 funciones y `REVOKE TEMPORARY`), T-308 (`createrole_self_grant` en Neon antes del primer despliegue), T-309 (cifrado del NIT), T-310 (prefijo `fixture-`), T-311 (alinear ADR-0030 §3.3), T-312 (tope por hora atómico).
- Siguen T-269 y T-273; el registro no abre hasta tener API (T-270) y web.
- Propietario: pidió revisar la navegación de la web («no me cuadra»); auditoría de navegación en curso, su informe irá a la carpeta de auditorías.

**Trampas nuevas**
- Dos sesiones pueden crear la misma tabla en migraciones distintas: antes de empezar una migración, `git fetch` y leer las migraciones nuevas de `main`.
- El orden del literal de `excepciones_rls` es el de `ORDER BY tabla, rol` (`acc` va antes que `ace`).
- Los ids de tarea también chocan entre sesiones (T-307): comprobar el máximo en `main` antes de numerar.

---

## 2026-11-20 — Web creíble, registro de agencias decidido, MCP y despliegue en espera, y `docs/` ordenada

**Decisiones del propietario**
- ADR-0030 (registro autoservicio) aceptado con P1–P7: 14 días de prueba; durante el piloto, registro con código de acceso; textos legales por abogado y el propietario; solo Colombia y COP; 5 miembros, 1 canal, sin IA; la plataforma conecta a mano el WhatsApp de las agencias piloto; avisos a su correo por variable de entorno.
- Skills `diseno-web` (propia) y `frontend-design` (Anthropic, Apache 2.0, base de la anterior) más el MCP de 21st.dev. MCP de Neon, Render y Vercel para que la sesión de despliegue termine la demo; las claves viven en el entorno, nunca en el repo.
- Reorganizar `docs/` sin dañar lo que hay: primero un comprobador de enlaces, luego mover solo lo de riesgo bajo. Sin agrupar la bitácora por año (rompería el hook de arranque).
- Autorización vigente (2026-11-17): aprobar e integrar PR, incluidas rutas protegidas, tras auditoría y CI en verde. No alcanza paneles de Neon, Render, Vercel y 21st.dev, claves, WhatsApp real desde celular, ni borrar ramas ajenas.

**Verificado** (con `gh`/`git`)
- Integrados con CI en verde: #301–#303 (despachador, historial de estados, reserva atada a su archivo), #304–#308 (skills, credibilidad de la demo, solicitud de viaje, MCP), #309 (propuesta al viajero, sesión aparte), #310 y #312 (ADR-0030 y arreglo de H6), #314 (sistema visual y enlaces), #315 (tope de 10 fallos del código por correo, en Postgres), #316–#319 (reorganización de `docs/`).
- `main` en `9662e04`; 155 tareas `done`; 47 migraciones.
- La sesión de despliegue confirmó que los MCP de Neon, Render, Vercel y 21st conectan; en Neon existe `viajapro-staging` con 32 de 47 migraciones y faltan 3 roles; **no existe** servicio en Render ni proyecto en Vercel.

**Supuesto, sin verificar**
- Nada de ViajaPro está desplegado. La opción C (long-polling a Render a través de Vercel) está sin probar.
- Reservas, campana y las pantallas nuevas no se han visto contra la API real en un navegador.
- Las pruebas de base de T-300 corren solo en el CI.

**Pendiente**
- Propietario: decisiones a la sesión de despliegue (contraseñas de rol, `API_TRUST_PROXY`), secretos del entorno y de GitHub Actions, `CAMPOS_SENSIBLES_KEY` con copia fuera de Render, rotar la clave de 21st.dev pegada en el chat, mensaje real de WhatsApp desde celular, T-080, textos legales con abogado.
- Cola: T-268 (migración del registro, ruta protegida), T-269/T-273, T-281 (precondición para abrir el registro sin código), T-283, T-301 y T-303; salidas en el cotizador (punto 6 de la auditoría UX); encabezado de conversación en móvil; referencias muertas a los documentos FLUJO y CICLO (que ya no existen) en comentarios de `.github/` y `scripts/` (T-304).

**Trampas nuevas**
- mover la carpeta de traspaso a `docs/_traspasos` anida la carpeta si el destino ya existe: comprobar con `ls`.
- Alcance de commit `datos` no existe (usar `db`); `ia` tampoco (usar `mcp`); el asunto no puede empezar en mayúscula.
- Tras un squash, la rama de trabajo se rehace desde `origin/main`; no hay force-push.

---

## 2026-11-17 (noche) — Permisos del archivo, avisos de plazo y campana

**Verificado (gh/git, CI en verde en cada PR)**
- #295 (1c71e0f): `archivo.ver` / `archivo.operar` (migración 20261118100000); la auditoría pidió
  `archivo.ver` también en las mutaciones (devuelven el detalle con menores): corregido en el PR.
- #296 (64ad344): vigilancia de los dos plazos (T-244). Corregido en el PR: la edición del asesor ya
  no pisa una marca de aviso recién ganada (R5), lote 50, filtro afinado, prueba de outbox cruzado.
- #297 (15a2587): permisos en la web de Reservas (T-252) + `DESPACHO_BARRIDO=inerte` en las e2e:
  el barrido de arranque de otro archivo e2e entregaba eventos de fixtures ajenos.
- #298 (79e5536): notificaciones en la aplicación (T-254, migración 20261118110000, tabla sin
  columnas de texto, RLS y FK compuestas). Sin `archivo.ver` no se listan.
- #299 (51f59d4): campana con los avisos (T-255). El CI cazó un EXPLAIN inestable en
  `historial-de-estados-cotizacion.spec.ts` (estadísticas viejas): ANALYZE antes del EXPLAIN.
- Cola nueva: T-253 (función de descubrimiento de plazos), T-256 (FK reserva-archivo en
  notificaciones), parte externa de T-254 (WhatsApp/correo con plantilla y opt-in).

**Decisiones por delegación**
- Aprobé las migraciones 20261118100000 y 20261118110000 (ruta protegida) tras auditoría sin
  bloqueantes y CI en verde.
- Destinatario del aviso: el asesor de la oportunidad si puede operar archivos; si no, todos los que
  tienen `archivo.operar`.

**Supuesto / sin probar**
- Nada desplegado. Ni Reservas ni la campana se han visto contra la API real en un navegador.

---

## 2026-11-17 (tarde) — Archivo de viaje de punta a punta y demo sin dominio

**Verificado (gh/git, CI en verde en cada PR)**
- #289 (5ec0b37): opción C, la demo sin dominio. La web en `*.vercel.app` reescribe `/api/v1` y el
  socket (long-polling) a Render. Variables: Vercel sin `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL` =
  Render; Render `WEB_PUBLIC_URL` = vercel, `API_PUBLIC_URL` = Render, `API_TRUST_PROXY=1`.
- #290 (75f396a): `CotizacionAceptada` por outbox + despachador por consumidor en `AppModule`
  (descubre agencias con `tenants_con_eventos_por_entregar`, entrega bajo `conTenant`, idempotente por
  `entregas_de_eventos`, abandona a los 10 intentos) → abre el TravelFile con número de file.
- #291 (31b8eb1): el cotizador congela el mayorista por línea y la TRM declarada en la versión.
  El CI cazó un orden esperado mal escrito en el e2e, no un defecto.
- #292 (2167a2a): API `/api/v1/archivos` (estados de reserva, pasajeros, cancelación) y neto solo con
  permiso (T-242, T-248). T-241 done.
- #293 (68c3c38): pantalla Reservas en `/viajes` con datos reales (T-243).
- Auditorías de seguridad de #290 y #292: **sin bloqueantes**; los huecos de prueba de aislamiento
  de #290 se cerraron en el mismo PR. Cola: T-247, T-249, T-250, T-251, T-252.

**Decisión por delegación**
- Mutaciones de reservas con `cotizacion.escribir` mientras no existan `archivo.ver` /
  `archivo.operar` (T-249, migración de `datos`). Efecto: OPERACIONES aún no opera reservas.

**Supuesto / sin probar**
- Nada desplegado todavía (el propietario configura los paneles). La pantalla Reservas no se ha visto
  contra la API real en navegador. La opción C no se ha probado contra Vercel real.
- Los agentes en worktree no pueden levantar Postgres local (permiso denegado); el e2e lo valida el CI.

---

## 2026-11-17 — Auditoría competitiva, despliegue elegido y decisiones delegadas

**Decisiones del propietario (literales)**
- «Sí, prepara Neon, Vercel y Render»: staging en Neon + web en Vercel + API en un solo proceso en
  Render (modo único, sin Redis). ADR-0028, integrado en #283.
- «tu tienes autorizacion mia para aprobar y destrabar los temas pendientes como si fuera yo».
  Alcance aplicado: aprobar e integrar PR de Dependabot en verde, cerrar los que no conviene,
  registrar decisiones de producto. NO alcanza lo que requiere sus manos o cuentas: paneles de
  Neon/Vercel/Render, claves, mensaje real desde un celular, demos de la competencia.

**Decisiones tomadas por delegación (2026-11-17)**
- D1: **el foco sigue siendo la agencia minorista que revende (S1)**. Se tomó primero «S3 entra»
  leyendo las pasadías con fecha del catálogo como salidas propias; era un error: el propietario
  ya había dicho que la agencia piloto «revende, no opera» (`docs/01-producto/11-dictamen-del-
  catalogo-real.md`) y esas fechas son del tarifario del mayorista. El cupo sigue informativo
  (ADR-0009). El cupo propio queda diseñado como ADR-0029 **Propuesto**, para cuando llegue una
  agencia que opere salidas propias.
- D2: ViajaPro exporta al ERP y no emite factura electrónica. ADR-0023 sigue Propuesto: juicio
  fiscal pendiente del contador del propietario; fuentes DIAN sin verificar.
- D3: la pasarela de pagos local se elige en la Fase 2, tras investigar costos.
- D5: Neon + Vercel + Render (ADR-0028).
- ADR-0024 (archivo de viaje, time limit, TRM congelada) se adopta como dirección de la Fase 1:
  es justo lo que necesita quien revende (el time limit del mayorista es su riesgo diario).

**Verificado (gh/git)**
- Auditoría competitiva en `docs/_auditorias/2026-11-16-*` (#281); página publicada para el
  propietario. Veredicto: ~40 % de lo imprescindible para S1+S3.
- Integrados: #283 (ADR-0028, `render.yaml` de un servicio, `apps/web/vercel.json`,
  `deploy-staging.yml`, guía `docs/07-ingenieria/despliegue-neon-vercel-render.md`), y los
  Dependabot #265, #257, #255 y #13 (aprobados por delegación).
- Cerrados con comentario: #259 (Prisma 7), #261 (Nest 12), #262 (pnpm 12) → T-238; #260
  (@types/node 26, el proyecto es Node 22); #282 (su cambio va en #283).
- Cola nueva: T-238 (saltos mayores y zod 4), T-239 (lo que ADR-0028 deja abierto antes de
  producción).

**Supuesto (no verificado)**
- Nada desplegado todavía: la configuración no se ha ejecutado contra Neon, Vercel ni Render.
- Precios de la competencia y costos de hosting sin verificar en páginas oficiales.

**Pendiente del propietario**
- Seguir la guía de despliegue (dominio, Neon, Render, Vercel, GitHub, DNS) y guardar copia de
  `CAMPOS_SENSIBLES_KEY` fuera de Render.
- Mensaje real desde un celular (T-080); demos de competidores (D4); contador para ADR-0023.

**Trampas nuevas**
- Los PR de Dependabot exigen la revisión del propietario del código (CODEOWNERS): con la
  delegación se aprueban desde la sesión, que actúa con su cuenta.
- La sonda continua de Render debe ser `/salud` (no toca la base): con `/salud/listo` Neon nunca
  se suspende y un corte de Neon reinicia la API.

## 2026-11-15 — Auditoría integral, MVP en navegador y cifrado de PII

**Decisiones del propietario**
- Corregir toda la auditoría integral y después seguir el roadmap hasta un MVP demostrable.
- Modo de trabajo: «intégralo cuando esté en verde y sigue» (merge de PR propios con CI en verde).
- Autorizó resolver los pendientes, incluida la aceptación de ADR que no dependan de decisiones suyas.

**Verificado (gh/git)**
- Auditoría integral 2026-11-15 (`docs/_auditorias/2026-11-15-auditoria-integral.md`) y plan
  (`docs/08-roadmap/02-plan-correccion-auditoria-2026-11-15.md`); cola T-175..T-227.
- Integrados en `main`: #256 (37 correcciones), #263 (suite de navegador T-196, observabilidad
  T-203, T-190/T-221/T-222), #264 (cifrado de PII en reposo, ADR-0015, T-212, con auditoría de
  seguridad). El job `navegador` del CI ejecuta el flujo H1–H6 contra la API real.
- La suite de navegador encontró defectos reales que ninguna prueba unitaria veía: el modal de
  guardado ignoraba título y contacto (cotización a nombre de otro cliente) y guardar con la API
  real usaba la acomodación de la maqueta. Corregidos.
- ADR-0018, 0019, 0022 y 0025 aceptados; 0023 y 0024 propuestos.

**Cierre del lote (añadido; `main` en `5c6e247`)**

Verificado (gh/git):
- Integrados #266 (`02d1e07`: demo cifrada T-225; la suite de navegador T-196 responde desde la
  bandeja y envía cotización contra Graph falsa), #267 (`8b4c070`: deps T-220, audit de producción
  3 críticas/15 altas a 0/1, T-224, T-226a, T-227, ADR-0022 y 0025, hooks del cerebro), #268
  (`46e88a6`: `medir_cola_de_salida` con dueño NOLOGIN `viajapro_metricas` y `motivos_de_perdida`;
  auditoría de seguridad: integrable; migraciones en verde en el CI) y #269 (`5c6e247`: vista previa
  honesta, consultas desde hoy, T-228).
- Defecto real hallado por la suite: la bandeja nunca ofrecía cotizaciones con la API real (la ficha
  de CRM las trae vacías por R4); ahora las pide a `quoting`.
- Vitest 4 rompió 40 e2e: `import(variable)` relativo se resuelve contra la raíz de Vite; usar
  `new URL(ruta, import.meta.url).href`.
- Cola nueva: T-229 (API/UI de motivos), T-230 (endurecer función y disparador), T-231 (ADR-0008/R2
  con el rol nuevo). T-228 `done`. T-214 y T-226 (b, c) siguen `in_progress`.
- Entrada: `docs/_bitacora/2026-11-15-mvp-en-navegador-y-cierre-de-auditoria.md`.

Supuesto (no verificado): nada está desplegado; WhatsApp solo se probó contra una Graph falsa; las
fuentes de la DIAN del ADR-0023 no se verificaron.

**Segundo cierre (añadido; `main` en `e46ee11`)**

Verificado (gh/git; todos con el CI en verde, 13-14 checks):
- #270 (`73d8f80`): ESTADO, bitácora y diario del primer cierre.
- #271 (`2252fd0`): T-229 motivos de pérdida por agencia: contrato, API, pantalla y migración
  `20261115190000` (el disparador respeta el `motivo_perdida_id` escrito). Regla: todo lo guardado
  como OTRO, también un motivo propio, exige nota (el contrato `Oportunidad` lo rechaza sin ella).
- #272 (`e52e78b`): T-230/T-232 (migración `20261115200000`: VP001 al asignar un motivo
  desactivado, CHECK de que OTRO exige nota, pruebas de superficie y restauración de contexto) y
  T-231 (ADR-0026 + R2).
- #273 (`26aa5d1`): T-226 (b) abortar al arrancar si hay `*_clave_version` sin clave; T-233
  (migración `20261115210000`, solo comprobaciones).
- #274 (`e46ee11`): T-234, la comprobación corre en `onModuleInit` de la raíz y todo lo que toma
  trabajo arranca en `onApplicationBootstrap`.
- Cada lote que tocó aislamiento o cifrado pasó por `auditor-seguridad` (integrable en todos);
  lo que no se corrigió en la vuelta fue a la cola (T-232..T-235).
- Cola de código restante: T-235 (P3), T-226 (c) (solo con una clave real que rotar).

**Revisión de PR abiertos (añadido 2026-11-16; `main` en `a7fb3d5`)**

Verificado (gh/git):
- #276 (`8e12896`) rescata del #29 `CAMPOS_SENSIBLES_KEY_PREVIOUS` en `render.yaml` y la guía de
  staging; #29 y #107 cerrados con comentario (obsoletos).
- #234 rehecho sobre main en #277 (`e4eb9b3`): rol `viajapro_ajustes` con permisos de columna,
  función `actualizar_zona_horaria_de_la_agencia`, ADR-0027 y R2; #234 cerrado. Endpoint en #278
  (`db8c875`, `usuarios.administrar`) y pantalla en #279 (`a7fb3d5`).
- Dependabot en verde (#265, #257, #255, #13): no se pueden integrar sin la revisión del
  propietario (CODEOWNERS: «Waiting on code owner review»). Los saltos mayores (#259 Prisma 7,
  #261 Nest 12, #262 pnpm 12, #260 @types/node 26) están en rojo y esperan su decisión.
- Cola: T-237 (Z5 con NULL, comentarios de `policies/002`, 403 por HTTP).

**Pendiente (no darlo por hecho)**
- Del propietario: aprobar los cuatro Dependabot en verde y decidir los saltos mayores; `CAMPOS_SENSIBLES_KEY` en Render y copia de la clave; `STAGING_DESPLIEGUE`;
  Meta real (T-080); decidir zod 4; ADR-0023/0024.

**Trampas nuevas**
- Los PR de Dependabot exigen la revisión del propietario del código; los del propio dueño no.
- `expectedHeadSha` del merge exige el SHA completo y real: no reconstruirlo a partir de un prefijo.
- Tras un squash-merge, la rama remota diverge de `main`: el force-push lo deniega el
  clasificador. Se hace `git merge origin/<rama>` (contenido idéntico) y push normal.
- Commitlint: el alcance `datos` no existe; para la base es `db`.
- Un commit que falla en lint-staged restaura el árbol: con agentes trabajando en paralelo puede
  borrar su trabajo. Pasar lint antes de commitear y nunca usar `git stash` con agentes activos.
- Desde el cifrado, la búsqueda de la bandeja solo mira nombre y teléfono, y la semilla SQL no
  puede escribir texto: la demo se siembra con `demo:sembrar-cifrada`.
- Un saliente pasa a ENVIADO con el webhook de estado `sent` de Meta, no con la respuesta de la
  Graph: las pruebas con Graph falsa deben simularlo.
- Postgres no arranca en las sesiones en la nube: migraciones, e2e y aislamiento solo se
  verifican en el CI.

---

## 2026-11-05 — Campaña funcional en Codespaces y cerebro persistente

**Decisiones del propietario**
- Sin gasto de alojamiento hasta que el flujo de punta a punta funcione; se prueba en Codespaces
  (`pnpm dev:nube`, puertos 3000 y 3333 públicos mientras se prueba).
- Antigravity no está habilitado: un agente `frontend` de Claude hace su papel (carril `b/`).
- Congelado hasta cerrar H1–H6: multiidioma (T-152..T-172) y reportes avanzados. Primero la campaña
  funcional T-126; riesgo de mercado añadido; revisión externa de RLS antes de datos reales.
- La primera demo a JD Tours la ve **el dueño** (agencia pequeña): vista gerencial además de bandeja
  y cotizador. La verificación de negocio con Meta (T-080) la lleva el propietario.
- PRs grandes por carril y tanda (lotes); migraciones y aislamiento van aparte.
- Contexto persistente en archivos, no en la memoria del modelo. Estructura y marco de trabajo en `MARCO.md` (se inyecta al iniciar).

**Verificado**
- H-2 (la API devolvía cuerpo JSON vacío salvo en importaciones) → PR #248, en `main`.
- H-1 (la raíz abría sin login y con datos inventados) → PR #249, dentro del lote #250.
- Pendiente de integrar al 2026-11-05: #250 (lote web 1), #244 (retrospectiva), #234 (función de zona
  horaria, migración). #245 (hallazgos) ya entró. El PR #251 (`cerrar-tarea`) se integró y dejó
  T-126 como `done` **por error**.

**Pendiente (no darlo por hecho)**
- Corregir T-126 a `in_progress` con un PR de documentos (usar `T-000` en el nombre de la rama).
- Registrar H-1..H-4 en `docs/_bitacora/hallazgos-funcionales-2026-11-05.md` y H-3 (hidratación
  en `/ingresar`) y H-4 (`/login` da 404) en `roadmap/tasks.yaml`.
- Tras integrar #250: `git pull` y reiniciar `pnpm dev:nube` en el Codespace; retomar el recorrido
  login → bandeja → WhatsApp → contacto/oportunidad → cotizar → enviar → reportes.
- Después de #234: backend implementa `PATCH /api/v1/agencia/ajustes`.
- Fijar Node 22.20 en `.devcontainer` (ruta protegida).

**Trampas nuevas**
- Una rama con `T-126` en el nombre dispara `cerrar-tarea` al integrarse y cierra la tarea. Usar `T-000`.
- La mezcla de carriles en un PR la rechaza el check «Carril y tarea».
- Alcance `bitacora` no existe en commitlint; usar `hilo`.
- Registrar el middleware de Nest con un nombre `jsonParser` hace que Nest omita su parser global.

## 2026-11-21 · T-343: la web lee `alcance`
Se retira el conmutador Vista Dueño/Asesor; la vista la decide la respuesta de la API. «Mis números» (390 px, tarjetas) para quien solo ve lo suyo. Decisión: **no se filtran listas de agencia en el cliente** para fingir «lo tuyo»; cotizaciones abiertas y cobros por cobrar del asesor quedan para la API (T-528). Detalle: [bitácora](../_bitacora/2026-11-21-mis-numeros-y-retirada-del-conmutador.md).
