# 2026-10-07 — El día que nos pusimos un freno

**Participantes:** Claude Opus 5 coordinando, con `arquitecto`, `auditor-seguridad`, `datos`,
`whatsapp`, `investigador` e `integrador`
**Alcance:** el esquema del inbox, el canal de WhatsApp vivo, y una regla nueva nacida de una
pregunta incómoda del propietario.

---

## Lo que se entregó

| Qué | Estado |
|---|---|
| **Canal de WhatsApp** | **Vivo.** App de Meta creada, número de prueba, mensaje recibido en un teléfono real |
| **Esquema del inbox** | 4 tablas globales, 5 roles, 7 funciones, **30/30 aserciones contra Neon** |
| **ADR-0008** | Aceptado por el propietario tras tres pasadas de auditoría |
| **R13** | La regla de parada. Ver abajo |

## La pregunta que cambió el día

A media tarde, el propietario escribió:

> «Siento muchos stopper y no sé si somos nosotros mismos los que los estamos generando.»

La respuesta honesta era **sí, en parte**. El perfil del día lo dice solo: **veintitantos commits y
ni una funcionalidad nueva** desde el cotizador, con una agencia piloto esperando y el canal de
WhatsApp vivo sin una sola línea que recibiera un mensaje.

Los hallazgos eran reales. El proceso, no.

Tres errores de coordinación, todos míos:

- **Encadenar tres rondas de revisión del ADR y dos de la implementación.** Un agente que se manda a
  revisar *va a encontrar algo*: ese es su encargo. Revisar revisiones tiene rendimientos
  decrecientes y nadie puso límite.
- **Dejar que el ADR creciera a mil líneas** para una funcionalidad con cero usuarios.
- **Mezclar dos categorías de hallazgo.** «Las pruebas no corren en CI» es hoy. «La partición de 2028
  nacería con permisos de más» es real y **no es ahora**. Se trataron igual.

De ahí salió **R13** y la §3.1 de `CLAUDE.md`: una sola vuelta de revisión salvo en aislamiento entre
tenants, y el criterio para separar lo que detiene de lo que se anota es el **tiempo verbal**. Lo que
está roto hoy bloquea; lo que empieza por «el día que…» va a la cola con dueño.

Y una frase que faltaba en el método: **el coste de no entregar también es un riesgo y hay que
contarlo.**

Se escribió en los tres sitios —`CLAUDE.md`, `AGENTS.md` y la definición del `integrador`— por la
lección de esa misma mañana: la regla hay que ponerla donde se obedece, no solo donde se lee.

## Lo que encontraron las auditorías del esquema

**La compuerta de aislamiento nunca había corrido.** En CI el job definía una sola cadena de
conexión y la prueba caía al rol propietario por un `??` de respaldo. Ese rol es superusuario, y la
única comprobación que lo vigilaba preguntaba si podía saltarse RLS — cosa que un superusuario
responde que no, porque ni lo necesita. Las 25 aserciones las había ejecutado una persona, a mano.

**Una aserción que se ponía verde activamente.** La que verifica qué rol puede ejecutar qué función
construía su expectativa filtrándola **por el mismo conjunto que auditaba**. Si un rol desaparecía de
la lista vigilada, desaparecía también del lado esperado: 25 de 25 en verde, aislamiento perdido.
Bastaba un `ALTER ROLE ... CREATEDB` para provocarlo.

**La carrera que creíamos cerrada no lo estaba.** Se había cerrado entre dos sentencias; la real es
entre dos transacciones. Bajo `READ COMMITTED` el `NOT EXISTS` no ve el cambio sin confirmar del otro
trabajador, así que ninguno de los dos anula el contenido — que sobreviviría 30 días en vez de
minutos, en una tabla sin RLS.

**Funciones `STRICT` en caminos de escritura.** Un argumento nulo devuelve `NULL` sin ejecutar el
cuerpo: el webhook habría respondido 200 sin guardar nada, y Meta no reintenta. Pérdida de mensajes
de todas las agencias **sin una sola excepción en los registros**.

## Las dos lecciones que valen más que los hallazgos

**Una prueba puede fallar por el orden en que corre, no por lo que comprueba.** La aserción nueva
pasó en verde con el defecto inyectado, porque otra declarada antes reaplica las políticas y
**curaba la degradación antes de que nadie preguntara**. Solo se vio porque el verde no cuadraba con
la mutación.

Es una familia distinta de la que ya conocíamos —comprobar presencia en vez de valor— y tiene forma
propia: *cualquier aserción declarada después de una que repare el sujeto auditado está enmascarada.*

**El respaldo cómodo es el agujero.** Aparece tres veces hoy, idéntico:

| Dónde | El respaldo |
|---|---|
| La prueba de aislamiento | `DATABASE_APP_URL ?? DATABASE_URL` → caía al rol propietario |
| El script de roles | `if (!esLocal && !esCI)` → `CI=true` existe en todo runner |
| La contraseña de desarrollo | `?? 'desarrollo-local-sin-valor'` → publicada en el repositorio |

Los tres se escribieron para que algo «funcionara igual». Los tres desactivaban la protección.

## Lo que Meta nos enseñó

**Su guía oficial de onboarding recomienda el patrón inseguro:** capturar los identificadores que
llegan al navegador del cliente y usarlos para dar de alta. Razonable para quien integra su propio
WhatsApp; en un SaaS multi-tenant permite reclamar el número de otra agencia. Quedó escrito como
desviación deliberada, porque cualquiera que siga el tutorial lo reintroduciría creyendo que acierta.

**Y cobra los mensajes de servicio desde el 2026-10-01**, confirmado en fuente primaria —mientras su
propia página general de precios y su changelog siguen diciendo lo contrario. Tres páginas oficiales
contradiciéndose a la vez. Moraleja operativa: ni la página de precios ni el changelog son fuente
suficiente para la revisión trimestral que exige el ADR-0002.

## Qué aprendimos

**El rigor tiene un sitio y hay que decir cuál es.** El aislamiento entre agencias lo merece entero:
una fuga ahí no se arregla después, mata el producto. Todo lo demás, no — y aplicarle el mismo rasero
no es prudencia, es no haber decidido.

Lo que hizo falta para verlo no fue un agente: fue que el propietario preguntara si no nos estaríamos
poniendo los frenos solos.
