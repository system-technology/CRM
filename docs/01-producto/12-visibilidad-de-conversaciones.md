# Visibilidad y asignación de conversaciones (v1)

**Decidido por:** `dueno-de-producto`, 2026-10-20, en modo desatendido.
**Bloquea:** dar de alta al primer asesor de la agencia piloto. Hoy la bandeja en vivo (v0.36.0) y
la API REST de la bandeja muestran a todo miembro el texto de **todas** las conversaciones de su
agencia, y el permiso `conversaciones.ver_todas` (ADR-0011) no lo aplica nada.

**Qué no es:** aislamiento entre agencias. Eso lo resuelven RLS y el tenant de sesión, y no
cambia. Esto es visibilidad **dentro** de una agencia: política de negocio, no invariante (R12).

## 1. Para quién y por qué

Una agencia de 2 a 5 personas que vende paquetes por WhatsApp, con un solo número. Dos dolores
tiran en direcciones opuestas:

- **La respuesta tardía.** Un mensaje nuevo que nadie ve se pierde: el viajero preguntó a tres
  agencias. Si el asesor solo viera lo asignado, alguien tendría que repartir, y en una agencia de
  tres personas nadie reparte. Por eso la cola común es visible para todos.
- **El asesor que se va.** El dueño no quiere que cada asesor lea la cartera entera de sus
  compañeros. Por eso lo asignado a otro no se ve.

## 2. La regla

| Quién | Ve |
|---|---|
| Miembro **con** `conversaciones.ver_todas` (rol sembrado **dueño**) | Todas las conversaciones de la agencia |
| Miembro **sin** `conversaciones.ver_todas` (roles sembrados **asesor** y **operaciones**) | Las **asignadas a él** + las **sin asignar** (la *cola común*) |

«Ver» una conversación incluye todo lo que cuelga de ella: la fila de la bandeja con su vista
previa (`ultimoMensajeTexto`), los mensajes, las notas internas, la media, los resultados de
búsqueda, los contadores de sin leer y los eventos de tiempo real. **Lo que no se ve no se ve por
ningún camino.**

### Lo configurable, y dónde

La configurabilidad **ya existe**: son los permisos del rol, que son tabla por tenant (ADR-0011).
No se añade un ajuste nuevo.

- **Default:** la regla de arriba, con la semilla de roles tal como está (solo **dueño** tiene
  `ver_todas`).
- **«Todos ven todo»**, lo que quiere una agencia de 2 personas: se añade `conversaciones.ver_todas`
  al rol **asesor**. Hasta que exista la administración de roles (rebanada 4 de ADR-0011), lo hace
  el script de alta.
- **Un supervisor:** un rol propio con `ver_todas`.

**Rechazado para v1: el modo «solo las asignadas»** (sin cola común). Exige que alguien reparta, y
eso es reparto automático o un despachador. Se reconsidera cuando una agencia con más de 5
asesores lo pida, o cuando el piloto muestre conversaciones de la cola común atendidas por dos
asesores a la vez como problema real y repetido.

## 3. Asignación

- **Tomar:** cualquier miembro puede asignarse una conversación sin asignar.
- **Autoasignación al responder:** el primer mensaje saliente (texto o plantilla) que un miembro
  envía en una conversación **sin asignar** se la asigna a él. Responder es tomar. Una nota
  interna, marcar como leída o cambiar el estado **no** asignan.
- Si la conversación **ya** tiene asesor, responder no la reasigna, aunque responda el dueño.
- **Reasignar o soltar:** cualquier miembro puede cambiar la asignación de una conversación **que
  ve**, hacia cualquier miembro activo de su agencia o a «sin asignar». Es el «pásale esta a Laura,
  ella hace Europa». Un asesor sin `ver_todas`, por tanto, puede soltar o traspasar las suyas, y
  asignar las de la cola común; no puede tocar las de otro, porque no las ve.
- **Sin reparto automático en v1.** Se reconsidera con la misma condición que el modo «solo las
  asignadas».

### Cuando cambia el asesor

- El asesor anterior **deja de verla en el acto**, salvo que tenga `ver_todas`. No conserva acceso
  de lectura: la conversación es de la agencia, no del asesor.
- Si se suelta (pasa a sin asignar), vuelve a la cola común y la ven todos.
- Si el cliente vuelve a escribir en una conversación cerrada, la asignación **se conserva**: el
  mismo asesor conoce al cliente.
- **Al dar de baja a un miembro**, sus conversaciones pasan a sin asignar. Sin esto, las
  conversaciones de quien se fue quedarían invisibles para todos los que no son dueño.

## 4. Criterios de aceptación

Fixture común: agencia con **Dueño** (rol dueño), **Ana** y **Beto** (rol asesor, sin
`ver_todas`); conversaciones **C1** asignada a Ana, **C2** asignada a Beto, **C3** sin asignar.

| # | Criterio |
|---|---|
| CA1 | Ana consulta la bandeja con filtro `TODAS` y recibe exactamente C1 y C3. |
| CA2 | El Dueño consulta la bandeja con filtro `TODAS` y recibe C1, C2 y C3. |
| CA3 | Ana pide el detalle, los mensajes, las notas o la media de C2 y recibe **404** `CONVERSACION_NO_ENCONTRADA`, la misma respuesta que para un id inexistente: no confirma que exista. |
| CA4 | Ana busca un texto que solo aparece en un mensaje de C2 y no obtiene resultados. |
| CA5 | Los contadores de sin leer de Ana no suman los mensajes de C2. |
| CA6 | Entra un mensaje en C2: Beto y el Dueño reciben `MENSAJE_NUEVO` por el socket; Ana no recibe **ningún** evento de C2. |
| CA7 | Entra un mensaje en C3: Ana, Beto y el Dueño reciben el evento. |
| CA8 | Ana envía el primer texto en C3: C3 queda asignada a Ana, y Beto deja de verla en REST y deja de recibir sus eventos. |
| CA9 | Ana deja una nota interna en C3 o la marca como leída: C3 sigue sin asignar. |
| CA10 | El Dueño responde en C1: C1 sigue asignada a Ana. |
| CA11 | Ana reasigna C1 a Beto: Ana recibe 404 en su siguiente petición sobre C1, y su bandeja abierta retira la fila en menos de 5 segundos sin recargar. |
| CA12 | Ana intenta asignar C2 (la de Beto) a sí misma y recibe 404. |
| CA13 | Ana suelta C1 (asignación nula): Beto la ve en su bandeja. |
| CA14 | Se intenta asignar una conversación a un usuario de otra agencia o dado de baja: la API la rechaza y la asignación no cambia. |
| CA15 | Se da de baja a Beto: C2 queda sin asignar y Ana la ve. |
| CA16 | Se añade `conversaciones.ver_todas` al rol asesor: Ana ve C2 en su siguiente petición, y su socket recibe los eventos de C2 sin cerrar sesión. Al quitarlo, deja de verla igual. |
| CA17 | Una conversación nueva que abre el webhook entra sin asignar y la ven todos los miembros. |

## 5. Fuera de esta decisión (cola)

| Tema | Por qué no ahora | Dueño |
|---|---|---|
| Visibilidad de **contactos** y **oportunidades** de otro asesor | La ficha del contacto muestra historial unificado: si incluye mensajes, debe respetar esta regla. El resto de la ficha se decide cuando se construya el pipeline | `dueno-de-producto` |
| Reparto automático (rotativo, por destino) | Ver §3 | `dueno-de-producto` |
| Aviso al asesor cuando le asignan una conversación | Útil, no bloquea al piloto | `frontend` |

Términos nuevos en el lenguaje ubicuo: **Cola común** (`UnassignedQueue`) y **Tomar una
conversación** (`ClaimConversation`).
