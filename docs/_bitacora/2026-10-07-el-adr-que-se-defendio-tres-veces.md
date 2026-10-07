# 2026-10-07 — El ADR que tuvo que defenderse tres veces

**Participantes:** Claude Opus 5 coordinando, con `arquitecto`, `auditor-seguridad`, `whatsapp`,
`investigador` e `integrador`
**Alcance:** de «empecemos el inbox» a un ADR de mil líneas y **cero líneas de código**, a propósito.

---

## Lo que se hizo

| Versión | Qué entró |
|---|---|
| v0.9.1 | Las cuatro compuertas que nunca pudieron correr |
| — | Cierre documental de v0.9.1, regla de tags, agencia piloto |
| — | ADR-0008 y el contrato verificado de la Cloud API |

Catorce commits en la rama del inbox. Ninguno toca `apps/` ni `packages/`.

## Por qué no se escribió código

El inbox choca con el aislamiento el día que se escribe su primera línea. Meta manda **todos** los
webhooks de **todas** las agencias a **un único endpoint**, firmados con una sola clave de
plataforma. Nuestro aislamiento exige saber de qué agencia es un dato **antes** de poder leerlo.
Para saberlo hay que consultar un mapa; si el mapa está protegido por tenant, hay que saber el
tenant para leerlo.

Huevo y gallina. Y con un atajo evidente —darle al proceso un rol que se salte RLS— que habría
anulado en una tarde el trabajo de toda la semana.

Eso no se resuelve escribiendo una migración y viendo qué pasa.

## Lo que encontraron las tres pasadas

**Primera auditoría: tres críticos.** Todos con la misma firma — *el sistema sigue funcionando y el
aislamiento ya no*.

1. El `REVOKE` del que el ADR se declaraba consciente **se deshace solo**: el aplicador de políticas
   vuelve a conceder permisos sobre todas las tablas en cada migración. Ya había ocurrido dos veces
   en este repositorio. No era un olvido hipotético.
2. La función privilegiada se defendía exigiendo el tenant actual, **que fija el propio rol**. Una
   función `SECURITY DEFINER` no puede distinguir un valor puesto por un token verificado de uno
   puesto por una inyección SQL. Reimplementaba la *forma* de RLS sin su *garantía*: el motor compara
   contra la fila; la función comparaba contra un valor del atacante.
3. El alta verificaba de qué tenant era la sesión, pero no de quién era el número. Se podía reclamar
   **el número de otra agencia para el tenant propio**: ADR-0003 §5 otra vez, con otro nombre de
   columna.

**Reverificación: una regresión introducida por la propia corrección.** Dos arreglos correctos por
separado —encolar por `change`, y usar el hash del cuerpo como identificador del trabajo— que
**juntos** hacían que, si Meta agrupaba tres agencias en un envío, la cola descartara dos por
duplicadas y los mensajes de dos agencias no existieran nunca. Ninguna de las dos decisiones era
revisable en aislamiento.

**Verificación final: el mismo crítico en el otro eje.** El mecanismo protegía a los roles que
alguien recordó listar; un rol creado mañana nacería desprotegido y ninguna prueba preguntaría por
él.

## Tres cosas que enseñan más que el resultado

**El arquitecto encontró un error dentro de su propia prueba.** Al escribir la aserción del
`search_path` descubrió que **aprobaba exactamente la implementación que su propio apartado
rechazaba por insegura**: comprobaba que el valor estuviera presente, no cuál era. Escribir la
prueba de verdad delató a la especificación.

**La tabla que llevaba la cuenta de las excepciones no se declaraba a sí misma.** El mecanismo que
reemplazó al primer crítico era su propio vehículo — y el siguiente despliegue habría concedido por
su cuenta lo que una inyección hubiera escrito ahí.

**La documentación de Meta recomienda el fallo.** Su guía de onboarding dice literalmente que
captures los identificadores que llegan al navegador del cliente y los uses para dar de alta. Es
razonable para quien integra su propio WhatsApp e inseguro para un SaaS multi-tenant, donde quien
manda la petición es un cliente más. Quedó escrito como **desviación deliberada**, porque cualquiera
que siga el tutorial reintroduciría el fallo creyendo que acierta.

## Lo que el dinero cambió

Meta **cobra los mensajes de servicio desde el 2026-10-01**, seis días antes de esta sesión.
Confirmado en fuente primaria, en una página aparte: la página general de precios y el changelog
oficial siguen sin reflejarlo. **Tres páginas oficiales de Meta se contradicen a la vez.**

Importa porque la inmensa mayoría del tráfico de un CRM de agencias **son** mensajes de servicio.
Con tres asesores y veinte conversaciones diarias, una agencia agota la franquicia en la primera
semana del mes. El costo variable deja de ser ruido y pasa a ser una línea del *unit economics*.

Llegó a tiempo: el modelo de cobro todavía no está decidido.

Lección operativa, ya recogida: **la página de precios y el changelog de Meta no son fuente
suficiente** para la revisión trimestral que exige el ADR-0002.

## El límite de lo que se aprobó

El auditor lo escribió sin suavizarlo, y la cabecera del ADR remite ahí antes que al diseño:

> **Apruebo un diseño; no certifico un sistema.**

Tres afirmaciones de seguridad no tienen aserción de base de datos —arranque del proceso, alta de
extremo a extremo, ensayo de rotación de la clave— y las tres respaldan un crítico. Son las que más
fácil se quedan sin hacer, porque no caen en el archivo donde están las otras dieciocho.

Quedó escrito **antes** de implementar. Dicho después, habría sido una excusa.

## Qué aprendimos

**Un documento que se revisa tres veces no es lentitud: es dónde cuestan baratos los errores.** Los
cuatro fallos de esta sesión —tres críticos, una regresión y el crítico repetido en otro eje— habrían
costado, cada uno, una migración y un incidente con datos de clientes reales de por medio. Ninguno se
habría visto en una revisión de código: tres son propiedades de la configuración de permisos, y la
regresión solo aparecía mirando dos decisiones correctas a la vez.

**Y el valor de un revisor está en devolver, no en aprobar.** El `integrador` rechazó tres ramas esta
sesión. Una de ellas destapó que v0.9.0 se había etiquetado declarando compuertas que nunca se
ejecutaron. Lo que encontró no estaba en la rama que revisaba, sino debajo.
