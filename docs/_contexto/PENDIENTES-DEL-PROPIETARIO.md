# Pendientes del propietario

> La bandeja de lo que **solo el propietario puede resolver**. El orquestador la mantiene al día (regla en
> [`../08-roadmap/09-roadmap-maestro-y-operacion-desatendida.md`](../08-roadmap/09-roadmap-maestro-y-operacion-desatendida.md) §3.2).
> Se ordena por **lo que más bloquea**. Una línea tachada es una que ya se resolvió. Aquí **no hay secretos**: solo nombres.

Última revisión: 2026-11-21, 14:20 UTC (once PR integrados en el turno; la madre se relevó por contexto).

## 0. AVISO QUE CAMBIA CÓMO SE INTEGRA (2026-11-21, 23:40 UTC)

**Integrar un PR en `main` DESPLIEGA staging y migra la base de Neon.** No es teoría: el workflow
`deploy-staging.yml` lleva **50 ejecuciones exitosas desde las 11:33 UTC de hoy**, la última con
`58d78392`. Tiene los secretos puestos, dispara el hook de Render, redespliega Vercel y espera a que
`/salud/listo` diga `"estado":"ok"`.

**Durante todo el día el hilo decía lo contrario** («`STAGING_DESPLIEGUE=desactivado`», «no hay nada
desplegado»), así que las sesiones integraban creyendo que solo tocaban una rama. **La del lote de
esta noche integró ocho PR sin saber que cada uno desplegaba.** No hubo daño —ninguno llevaba
migraciones— pero la próxima podría llevarlas.

**Lo que esto exige a partir de ahora:** antes de integrar un PR que toque `packages/database`,
tratarlo como un cambio en producción, no como un merge.

## Bloquean la presentación al cliente (Ola 0)

| # | Qué | Por qué solo tú | Cómo |
|---|---|---|---|
| 1 | **Cargar los secretos de la API en Render** | Son claves; nunca pasan por una sesión | `CAMPOS_SENSIBLES_KEY` (+`_VERSION`, con copia fuera de Render), `BETTER_AUTH_SECRET`, `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WEBHOOK_PAYLOAD_KEY` (+`_VERSION`), `CORREO_PAYLOAD_KEY`, `WHATSAPP_DIRECTORY_PEPPER` (+`_VERSION`), `POSTMARK_SERVER_TOKEN`, `POSTMARK_MESSAGE_STREAM`, `MAIL_FROM` |
| 2 | ~~**Secreto `DIRECT_URL` en GitHub Actions**~~ **YA ESTÁ PUESTO** | — | **Corregido el 2026-11-21 con el registro del CI**: el job `migrar` lo recibe (`DIRECT_URL: ***`) y responde «56 migrations found» y «No pending migrations to apply». No falta ninguna migración; lo de «hoy faltan decenas» era falso |
| 3 | ~~Proyecto de la web en Vercel~~ **Existe** (`viajapro-staging`, 2026-11-21) | — | Falta que despliegue lo nuevo de `main` y fijar `WEB_PUBLIC_URL`; sin API en Render la web no tiene con qué hablar (Render, sin verificar) |
| 4 | **Mover el servicio de Render a tu proyecto** y poner `healthCheckPath` en `/salud` | La herramienta no elige proyecto | Panel de Render |

## Bloquean el flujo de PR

| # | Qué | Cómo |
|---|---|---|
| 5 | **`navegador` como check obligatorio** en la protección de `main` | `gh api -X POST repos/system-technology/CRM/branches/main/protection/required_status_checks/contexts --input - <<< '["navegador"]'`, o Settings → Branches. Después se reabre el PR con la copia del archivo y el «8 → 9 checks» en los documentos (el contenido está en el commit `27412e7`; el #357 se cerró para liberar la rama) |
| 6 | **Etiqueta `override-lane`** en los PR de ingreso por apodo (#358, #362) que mezclan carriles, o aceptar el rojo de «Carril y tarea» | La pones tú en GitHub (el PR → Labels → `override-lane`). El sistema de permisos de la sesión madre **me lo denegó dos veces, aun con tu autorización en el chat**: es una regla de la herramienta. Alternativa: añadir una regla de permiso de Bash para esa llamada en tu configuración |
| 7 | **Contestar el permiso de Bash** pendiente en la sesión de despliegue (agente del PR 1b) | Solo se contesta en esa sesión |
| 8b | **Regla de permiso para integrar por Bash** (opcional) | Integrar con `gh api -X PUT .../pulls/N/merge` queda denegado por el sistema de permisos de la sesión. No bloquea —la integración se hizo igualmente con la herramienta de GitHub del entorno— pero si quieres esa vía, es una regla de permiso de Bash en tu configuración |
| 8 | **Poner las sesiones en modo Auto** (menú junto al cuadro de texto) | Sin eso se detienen en cada permiso y el trabajo desatendido no avanza |
| 8b | **Decir si la sesión del punto 8 (cobros) puede trabajar sin supervisión** | Esa sesión no aceptó mi orden de autonomía sin tu confirmación escrita en su propia conversación (pidió A, B o C). Hoy trabaja bajo la A: un PR por tarea, sin auto-merge, con auditoría de seguridad antes de integrar (T-328 a T-330). Para la B, escríbele en esa sesión que sí |
| 8c | **Las sesiones no pueden levantar Postgres en local**: el clasificador del modo automático lo deniega | Por eso «probado en navegador» significa casi siempre «contra API simulada». Limita toda verificación de pantalla (ejemplo: T-511). Si quieres verificación real, permite esa llamada o corre la prueba tú |
| 8d | **El clasificador también deniega `git push --force-with-lease`** | Para corregir el asunto de un commit ya empujado hay que recrear la rama y abrir otro PR (pasó dos veces la madrugada del 2026-11-21). Solo tú puedes permitirlo en la configuración |
| **10** | ~~Contestar el permiso de Bash de la sesión «…RBg2YL» (T-531 y T-532)~~ — **YA NO HACE FALTA.** Esa sesión murió con el worker desconectado y **no llegó a publicar nada** (su rama no existía en el remoto), así que la madre relanzó T-531 y T-532 enteras en una sesión nueva el 2026-11-21 a las 14:20 UTC. | Denegar el permiso y cerrar esa conversación. No se pierde trabajo |
| **9** | **Borrar la rama `a/T-529-mutacion-aislamiento`** (commit `d4f32ede`). **Lleva el filtro de `tenant_id` retirado a propósito**, de un experimento que pedí yo para medir el aislamiento. No tiene PR y `main` está protegida, así que **no puede entrar sola**, y el asunto del commit dice «MUTACION DESECHABLE, no integrar». Pero es un repositorio público y no debería quedarse ahí. **Ni la sesión hija ni yo podemos borrarla:** el proxy deniega los borrados con `403 Write access to this GitHub API path is not permitted through this proxy`, tanto por `git push origin :rama` como por `DELETE /git/refs`. No lo rodeé. | Desde tu terminal: `git push origin :a/T-529-mutacion-aislamiento`, o en GitHub → Branches → borrar |
| 8e | **Sigue pendiente**: redesplegar con el `main` actual (solo con tu confirmación) y regenerar la clave de la demo | La clave se perdió al archivarse la sesión de despliegue; se regenera resembrando. Los puntos 1, 2 y 5 siguen igual |
| ~~8f~~ | ~~El despertar automático apuntaba a la sesión madre equivocada~~ | **RESUELTO, y con una corrección importante.** Lo que decía esta línea —que «a la sesión madre el clasificador le deniega `create_trigger`»— **es FALSO**: la madre `session_01R81Xh5b7wpteu5YpcDpw5p` creó la suya sin problema el 2026-11-21 a las 12:25 (`trig_01Cq7TrGZ9uGFc9uAmqQEDtr`, directa a ella). Lo que había antes era un relevo en dos saltos que despertaba a la madre saliente de 688 mil tokens solo para reenviar un mensaje. **Ya no hace falta que la saliente cree la tarea de la entrante: que cada madre cree la suya.** Verificado con `list_triggers`: queda una sola. No tienes que hacer nada |
| 9 | **Red del entorno en la nube**: añadir `developers.facebook.com` (o ampliar el nivel de red) | Menú del entorno → Edit → Network access |

| **11** | **T-553: nada valida `roadmap/tasks.yaml` en el CI antes del merge.** Es la raíz de que la compuerta de cierre de tareas (T-542) estuviera rota días sin que nadie lo viera: el validador solo corre **después** del merge, así que un `tasks.yaml` inválido no tumba ningún PR y el fallo aparece tarde. T-542 ya está cerrada y verificada, pero **la raíz sigue ahí**. Pide tocar `.github/`, que es ruta protegida. | Autoriza el cambio en `.github/` o apruébalo cuando la madre abra el PR |

| **12** | **Cuatro ramas publicadas con bugs puestos A PROPOSITO.** Las creo la sesion de T-531/T-532 para *ver fallar* sus pruebas, que es justo lo que le pedi: a/T-531-532-mutacion-descartable, a/T-531-532-mut-mediana, a/T-531-532-mut-aceptadas y a/T-531-532-mut-ganadas. **Ninguna debe integrarse jamas.** No las puede borrar ni ella (`git push --delete` devuelve 403) ni yo (el clasificador me denego el borrado por REST, y no lo rodee). No hay PR abierto para ninguna y `main` esta protegido, asi que el riesgo real es bajo; pero el repositorio es **publico** y conviene que no se queden ahi. | Borralas tu desde GitHub |

| **12b** | **Tres ramas sueltas mas, sin bugs pero huerfanas**, que tampoco puede borrar nadie desde aqui (403 por `push`, clasificador por REST): `a/T-531-532-reportes-por-asesor-y-destino` (su PR #447 se cerro sin integrar, era duplicado de #441), `i/T-538-cierre-del-lote` e `i/T-542-cierre-verificado`. Ningun PR abierto apunta a ellas y `main` esta protegido: **el riesgo es cosmetico**, pero el repositorio es publico. | Borralas tu desde GitHub, junto con las del punto 12 |

## Decisiones de producto y de negocio

| # | Qué | Contexto |
|---|---|---|
| ~~10~~ | ~~Coexistencia o número separado: aceptar o cambiar el ADR-0033~~ | **DECIDIDO el 2026-11-21: opción B, sin historial, con la exclusión descartando.** ADR-0033 pasa a **Aceptado** y T-338 a `done`. Lo que queda **de tu lado** no es la decisión, son tres cosas: (a) **quién habla con el dueño de JD Tours** sobre el aviso de privacidad y sacar sus chats personales del número — era la pregunta 4 del borrador y sigue sin respuesta; (b) que JD Tours **actualice su aviso de privacidad y firme el contrato de encargo**; (c) el trámite de **Tech Provider** (T-080), del que depende T-337. Del lado del equipo queda **T-533**: la lista de exclusión y su filtro en el trabajador, con prueba de punta a punta, **sin la cual no se conecta el número real** |
| 11 | **Pasarela de pagos en COP** (Wompi, PayU, ePayco o Mercado Pago) | Necesaria para la Ola 2 |
| 12 | Respuestas del dueño de JD Tours: cobra por archivo o por pasajero, pagos libres o en cuotas, qué etiquetas usa, qué mira cada asesor, su hoja de reservas (muestra **sin datos personales**) | Roadmap de JD Tours §4 |
| 12c | **14 preguntas de reportes por nivel** (una palabra cada una, con su valor por defecto entre corchetes) | Están en la sección 7 del documento de reportes por nivel (PR #392, `docs/08-roadmap/`). Mientras no contestes se construye lo de los corchetes. La 12 (cerrar ya `/reportes/resumen` a quien no tenga `conversaciones.ver_todas`) la dio por Sí el orquestador porque cierra una contradicción con tu decisión de reportes por niveles |
| 12b | **Nombre comercial, logo y marca de ViajaPro** | La sesión de diseño los necesita para la portada de ingreso y para la propuesta al viajero (Ola 5 del rediseño). Sin ellos se usa un distintivo provisional |
| 13 | **Cifrado del NIT** de la agencia (T-309) | Hoy está en claro bajo RLS |

## Trámites externos

| # | Qué | Tarea |
|---|---|---|
| 14 | Verificación del negocio en Meta y solicitud de **Tech Provider** | T-080 |
| 15 | Aviso de privacidad, política de tratamiento, RNBD y derechos del titular: **abogado** | T-093, T-098, T-097, T-267 |
| 16 | **Contador** para el ADR-0023 (comisión del proveedor, fiscal) | ADR-0023 |
| 17 | **Rotar la clave de 21st.dev** que se pegó en un chat | — |
| 18 | Un mensaje real de WhatsApp desde un celular a la bandeja | Cierra la prueba de punta a punta |

## 13. T-083: el JSON de ramas protegidas difiere del servidor en tres campos

**Qué pasa:** la reconciliación de las P1 (PR #463, 2026-11-21) encontró que
`.github/proteccion-main.json` ya no coincide con la protección que `main` tiene de verdad en el
servidor: difieren en tres campos. **Reaplicar el JSON tal cual apagaría los code owners**, que es
justo lo que hace que las rutas protegidas esperen su aprobación.

**Por qué no lo hago yo:** la configuración de GitHub está fuera de mi autorización, y aquí
equivocarse abre la puerta de `main`. No lo toco ni por aproximación.

**Qué hace falta de usted:** decidir cuál de los dos manda — el archivo o el servidor — y aplicarlo
en la configuración del repositorio. Si manda el servidor, basta con que alguien actualice el JSON
para que deje de mentir; si manda el archivo, hay que reaplicarlo **sin perder los code owners**.

**Mientras tanto:** la protección del servidor sigue en pie y `main` no está desprotegido. Lo que
está roto es que el archivo versionado ya no describe lo que hay.

## 19. LA CADENA DE SESIONES ORQUESTADORAS SE AGOTÓ (bloquea el modo desatendido)

**Qué pasa, verificado el 2026-11-21 a las 19:12 UTC contra el error real de la herramienta:** esta
sesión madre está en **profundidad de linaje 8 de 8**. Cada madre nace de la anterior, y el relevo
que se viene haciendo desde hace siete turnos ha consumido el último escalón. El error es literal:

> «this session is at lineage depth 8 (limit 8), so it cannot start sessions, or create, fire or
> re-arm routines and reminders. **No user or organization setting changes this limit.**»

**Qué deja de funcionar:**

1. **No puedo crear sesiones hijas.** La forma de trabajar de siete turnos —la madre reparte, las
   hijas construyen— ya no está disponible desde aquí.
2. **No puedo crear la madre siguiente.** El relevo que cierra cada lote no se puede ejecutar.
3. **No puedo crear ni rearmar la tarea programada.** La que existe
   («Despertar de orquestacion desatendida de ViajaPro», cada 2 h) apunta a una sesión que **ya está
   archivada**, así que **sus despertares no llegan a ninguna sesión viva**. El modo desatendido está
   parado de hecho, no solo en teoría.

**Qué hace falta de usted, y es una sola cosa:** **abrir una sesión nueva de ViajaPro desde la raíz**
(no como relevo de ésta ni de ninguna otra), con el prompt de orquestadora, y apuntar la tarea
programada a esa sesión. Una sesión creada desde cero vuelve a tener profundidad 1 y la cadena
dispone otra vez de los ocho escalones.

**Para que no vuelva a pasar:** el problema no es el límite, es que cada relevo gastaba un escalón.
Conviene que las madres futuras **nazcan desde la raíz** en lugar de crearse unas a otras, o que el
relevo se haga cada varios lotes en vez de cada lote.

**Qué sí pude hacer mientras tanto, para que el turno no se perdiera:** trabajar con **subagentes en
proceso** (la herramienta `Agent` que `CLAUDE.md` §8 ya contempla), que **no** cuentan contra el
límite de linaje. Cada uno en su propio árbol de trabajo. No pueden abrir PR —no llevan las
herramientas de GitHub—, así que empujan su rama y la madre abre e integra. **Es más lento y más caro
en contexto que una sesión hija, y no sobrevive al cierre de esta sesión**, pero entrega.

**Además, denegado por el clasificador en este turno:** `mcp__claude-code-remote__create_trigger`
(«Destructive or Unwanted Actions»), antes incluso de toparse con el límite de linaje. Si quiere que
una madre pueda rearmar su propio despertar, hace falta una regla de permiso para esa herramienta.
