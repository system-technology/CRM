# ADR-0035 — Niveles de acceso a reportes: propio y agencia, impuestos por el servidor

- **Estado:** Aceptado (2026-11-21; ver «Aceptación y auditoría» al final de §9)
- **Fecha:** 2026-11-21
- **Decide:** propietario, a propuesta de `arquitecto`
- **Consultados:** el catálogo de `analista-datos`
  (`11-reportes-por-nivel-catalogo.md` de `docs/08-roadmap/`, T-339, PR #392,
  sin integrar al escribir esto). `auditor-seguridad` (lista de §9): hecho el 2026-11-21, ver «Aceptación y auditoría».
  Pendiente, y **no bloquea**: `experto-turismo` (atribución cuando una persona cotiza y otra cierra, T-493)
- **Tarea:** T-340 (Eje F del [roadmap JD Tours](../08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md)).
  Absorbe T-141. Habilita T-341 (permiso), T-342 (alcance en el servidor), T-343 a T-346
- **Amplía:** [ADR-0011](0011-autenticacion-y-tenant-de-sesion.md) (permisos por rol en la sesión) y
  [ADR-0034](0034-pagos-del-viajero-mvp-de-registro-manual.md) §6 (qué cobros ve el asesor). No supersede nada.
- **Base verificada:** `origin/main` en `b807a14`. Solo lectura del código; no se ejecutó base ni API.

---

## Contexto

**Decisión D3 del propietario:** los reportes van por niveles de acceso. El asesor ve lo suyo y el
administrador ve todo. Entre asesores de una misma agencia es un requisito de **seguridad**, no de
presentación: la web no puede ser la que oculta.

Lo que hay en `main` no cumple D3 (hallazgos del catálogo, §6):

| # | Hecho [verificado por el catálogo sobre `912f412`] | Estado |
|---|---|---|
| H1 | `GET /api/v1/reportes/resumen` devuelve el resumen **de toda la agencia** a cualquier miembro. La «Vista Asesor» de la web solo cambia la presentación | Cierre provisional en el PR #395 (exige `conversaciones.ver_todas`), sin integrar |
| H2 | `?asesorId=` en `GET /crm/seguimientos` y `.../pendientes-del-dia` devuelve los de cualquier asesor | Cierre provisional en #395 (sin el permiso, el servidor impone el de la sesión e ignora el parámetro) |
| H3 | Las cifras de «Hoy» no miden lo que dicen (pendientes = sin asignar + sin leer; «por vencer» = 20 más recientes sin mirar vigencia) | Sin corregir |
| H4–H8 | Umbral de muestra 20 frente a 5; `tasks.yaml` desfasado; pantallas de archivos y cotizaciones de toda la agencia; `travel_files` sin asesor; periodo por defecto de 30 días | Cola T-484 |

Ninguno cruza agencias: todo ocurre dentro de un tenant y bajo RLS. Pero son dos huecos de
autorización que contradicen una decisión vigente, y la forma de cerrarlos (un permiso nuevo, una
regla de alcance compartida por todos los puertos de reportes y un `CHECK` de base ampliado) es
estructural: R7.

Las 14 preguntas de §7 del catálogo y las 6 de §9 las contesta el propietario. **Este ADR decide con
los valores por defecto entre corchetes** y dice qué cambia si una respuesta los invierte (§8).

## Opciones consideradas

| | Opción | Por qué no / por qué sí |
|---|---|---|
| A | **Reutilizar `conversaciones.ver_todas`** como llave de los reportes de agencia (lo que hace #395 de forma provisional y sugería el 06 §2.7) | Ata dos políticas distintas: qué chats veo y qué cifras de venta veo. La dueña tendría que elegir entre una coordinadora que reparte chats sin ver ventas y una que ve ventas sin repartir chats. R12: es política de cada agencia. **Descartada como solución final**; sigue como cierre provisional hasta T-342 |
| B | **Decidir el nivel por la clave del rol** (`DUENO` → agencia) | Los roles son tabla por agencia (R12): se renombran y se componen. Un `if rol === 'DUENO'` se rompe con el primer rol personalizado. Descartada |
| C | **Filtrar en la web** según el rol | Es lo que hay hoy y es H1. La API sigue entregando todo. Descartada |
| D | **Tres permisos** (`reportes.ver_propio`, `reportes.ver_equipo`, `reportes.ver_agencia`) | «Propio» no necesita permiso: es el mínimo de cualquier miembro. «Equipo» no tiene dato (no hay tabla de equipos ni sedes). Dos permisos sin uso son superficie sin prueba. Descartada |
| E | **Un permiso, `reportes.ver_agencia`; su ausencia es «propio»; el servidor deriva el alcance de la sesión** | **Elegida** |

## Decisión

### 1. Niveles

| Nivel | Qué filas entran | Cómo lo impone el servidor | Se construye |
|---|---|---|---|
| **Propio** | Las atribuidas al usuario de la sesión según §2 | `ContextoTenant.obtener().usuarioId`. **Nunca** un parámetro del cliente | Sí |
| **Agencia** | Todas las del tenant de la sesión | RLS (`prisma.conTenant`) + `tenant_id` explícito en cada `FROM` y `JOIN`, como ya hace `respuesta-para-reportes.prisma.ts` | Sí |
| **Equipo** | Las de un subconjunto de asesores | — | **No** (pregunta 1, [No]). Queda nombrado. Si una agencia lo pide: tabla `equipos` por agencia con `tenant_id` y RLS, permiso propio y **otro ADR** (T-491) |

No hay nivel entre agencias. Ningún cliente ve agregados de varios tenants (R1).

**El nivel lo da un permiso, no la clave del rol.** Una sola función decide el alcance, en el mismo
sitio que `visibilidadDe` y `asesorDeConsulta`:

```ts
// apps/api/src/shared/autorizacion/alcance-de-reporte.ts (T-342)
type AlcanceDeReporte =
  | { nivel: 'AGENCIA'; asesorId: string | null }   // asesorId: filtro opcional pedido por quien puede
  | { nivel: 'PROPIO'; asesorId: string };           // siempre el usuario de la sesión

function alcanceDeReporte(asesorSolicitado: string | undefined): AlcanceDeReporte
// - con reportes.ver_agencia: AGENCIA, con el asesor solicitado si lo hay (validado contra la agencia).
// - sin él y sin asesor solicitado, o con el propio id: PROPIO con el usuario de la sesión.
// - sin él y con otro asesor: 403 PERMISO_DENEGADO (§4).
```

Todos los puertos de `puertos-de-reportes.ts` reciben un `AlcanceDeReporte`, no un `asesorId` suelto.
Así, un puerto nuevo no puede olvidarse del alcance: no compila sin él.

### 2. Atribución: qué es «propio» en cada dato

**Regla general:** el **trabajo vivo** sigue al responsable actual; el **crédito histórico** se queda
con quien lo ganó. Por eso «Hoy» usa la asignación actual y «Mis cierres» la del momento.

| Dato | «Propio» significa | Columna |
|---|---|---|
| Conversación pendiente | Asignada a mí. La cola sin asignar se muestra **aparte** (pregunta 11, [Sí]) | `conversaciones.asignado_a_id` (la regla de `visibilidad-de-conversaciones.ts`) |
| Tiempo de primera respuesta | Respondida **por mí**: autor del primer saliente humano | `mensajes.autor_id` (`primera_respuesta_en` no guarda autor) |
| Seguimiento | Asignado a mí | `seguimientos.asesor_id` |
| Oportunidad viva | Asignada a mí ahora | `oportunidades.asesor_id` |
| Cierre (ganada o perdida) | Mía en el instante del cambio | `oportunidad_cambios_etapa.asesor_id` |
| Cotización, su aceptación y su venta | **Cotizada por mí** (pregunta 3, [Sí]). No cambia al reasignar la oportunidad | `cotizaciones.creado_por` |
| Archivo de viaje, sus plazos y su cobro | Del asesor **actual** de su oportunidad | `travel_files.oportunidad_id` → `oportunidades.asesor_id` |
| Pago registrado | Registrado por mí. Solo auditoría: **no** es «mi venta» | `pagos.registrado_por` |

**Archivos de viaje sin asesor (H7).** `travel_files` no tiene columna de asesor y `creado_por` es nulo
a propósito (lo abre el consumidor del evento, ADR-0024). Se decide:

1. **No se añade** `travel_files.asesor_id` (ver alternativas). El archivo hereda el responsable de su
   oportunidad.
2. Un archivo **sin oportunidad**, o cuyo asesor ya no está activo o no tiene `archivo.operar`, **no es
   «propio» de nadie**: no entra en ningún reporte propio y sí en los de agencia.
3. En **«Hoy»** se comporta como los avisos de plazo (`destinatariosDelAviso` en
   `notifications/domain/aviso-de-plazo.ts`): lo ve todo usuario con `archivo.operar`, en un bloque
   aparte **«Sin responsable»**, igual que la cola sin asignar de la bandeja. Una sola regla para la
   campana y para «Hoy».

### 3. El permiso `reportes.ver_agencia` (T-341, se describe aquí, no se implementa)

- **Catálogo:** pasa de 14 a **15** permisos. Se añade a `PERMISOS` en
  `packages/contracts/src/identidad.ts` con su comentario, y a la etiqueta legible de la web.
- **Base (ruta protegida, la escribe `datos`):** migración nueva que amplía el `CHECK`
  `roles_permisos_del_catalogo` con `reportes.ver_agencia`, con el mismo patrón que
  `20261121110000_etiquetas_por_agencia` (`NOT VALID` + `VALIDATE` + aserción de que quedó validado).
  No se edita ninguna migración aplicada.
- **Siembra:** `ROLES_SEMBRADOS` (`siembra-de-tenant.ts`) da el permiso a `DUENO`. **No** a `ASESOR`
  («propio» es la **ausencia** del permiso) **ni a `OPERACIONES`** (pregunta 2, [No]).
- **Relleno de agencias existentes:** la misma migración añade el permiso al rol con clave `DUENO` de
  cada agencia, por `tenant_id` y sin tocar roles personalizados. Una agencia que renombró o
  recompuso roles lo asigna desde Ajustes.
- `aislamiento.spec.ts` no cambia: no hay tabla nueva. La auditoría de la migración no recorta
  vueltas (R13), porque toca el catálogo de autorización.

### 4. Qué cambia en los endpoints (T-342)

| Endpoint | Hoy | Con este ADR |
|---|---|---|
| `GET /api/v1/reportes/resumen` | Todo a cualquiera (H1); con #395, 403 sin `conversaciones.ver_todas` | Sin permiso extra: responde **lo propio**. Con `reportes.ver_agencia`: la agencia, con `?asesorId=` opcional. Retira el gate provisional de #395 |
| `GET /crm/seguimientos` y `.../pendientes-del-dia` | `?asesorId=` de cualquiera (H2); con #395 se ignora en silencio sin `conversaciones.ver_todas` | Son **pantallas operativas**, no reportes: siguen gobernadas por `conversaciones.ver_todas` (supervisar trabajo ajeno). Pero sin el permiso, un `asesorId` ajeno responde **403**, no se ignora (ver abajo) |
| Endpoints nuevos de «Hoy» y reportes (T-138, T-139, T-140, M6) | No existen | Nacen recibiendo `AlcanceDeReporte` o, si son listas operativas, la visibilidad de su pantalla |
| Exportar CSV (T-345, T-483) | Se genera en el navegador, sin rastro | **En el servidor**, solo con `reportes.ver_agencia` (pregunta 13, [Sí]) |

**403 y no recorte silencioso.** Pedir un asesor ajeno sin permiso responde `403 PERMISO_DENEGADO`,
igual que `incluirMargen` sin `cotizacion.ver_neto_y_margen` (`margen.ts`). Una pantalla titulada
«Beto» con los datos de Valentina miente, y un cliente de la API que ve el parámetro ignorado aprende
que pedirlo es inocuo. Pedir el **propio** id está permitido. Esto **cambia** el comportamiento
provisional de #395 en seguimientos; el 403 no revela si el asesor existe: es el mismo con un id
inexistente.

**Respuesta con forma por nivel.** El contrato del resumen (`packages/contracts/src/reportes.ts`) pasa
a una **unión discriminada por `alcance`** (`'PROPIO' | 'AGENCIA'`). Las métricas solo de
administración (embudo por cohorte M12, por asesor M14–M17, cobros de la agencia M18) **no existen**
en la rama `PROPIO` del esquema: no van a `null`, no están. El servidor valida la salida con el
esquema, así que una clave de agencia en una respuesta propia falla en la prueba y no en producción.
La respuesta dice el `alcance` y el `asesorId` efectivos, para que la web titule con la verdad.

**Coherencia con las pantallas.** El alcance de un reporte puede ser más estrecho que lo que el usuario
ve en las pantallas, **nunca más amplio**. Los reportes de agencia devuelven agregados. Cualquier
**fila de detalle** con nombre de contacto o enlace a un objeto aplica, además, la regla de visibilidad
de su pantalla (`visibilidadDe` para conversaciones; `conversaciones.ver_todas` para seguimientos
ajenos). Con `reportes.ver_agencia` sin `conversaciones.ver_todas` se ven las cifras de la agencia,
no los chats ajenos.

**Fuera de este ADR, a la cola (T-490):** `GET /crm/tablero`, `/contactos`, `/contactos/:id/ficha`,
las listas de archivos y cotizaciones (H6) muestran toda la agencia a cualquier miembro, y
`POST /crm/oportunidades` acepta el `asesorId` de cualquier asesor. Son pantallas y mutaciones
operativas, no reportes (pregunta 10, [Sí, como hoy]). La regla de coherencia garantiza que los
reportes no amplían lo que esas pantallas muestran.

**Saldo agregado de cobros (M6).** Se calcula con las funciones puras de saldo de `packages/domain`
(`cobro.ts`, en el PR #393 de T-330, sin integrar) archivo por archivo, en la capa de aplicación,
mientras una agencia tenga hasta 500 archivos abiertos. No se duplica la fórmula en SQL. Pasar a SQL
exige una prueba de contrato que compare ambas sobre los mismos datos (T-492, cola).

### 5. Qué cambia en la web (T-343, T-344, T-485)

- Se retira el conmutador «Vista Dueño / Vista Asesor»: la vista la decide la respuesta (`alcance`).
- El menú lleva una sola entrada a `/reportes`. Sin `reportes.ver_agencia` se titula **«Mis números»**;
  con él, «Reportes de la agencia», con filtro de asesor y «Míos».
- Mientras #395 esté integrado y T-342 no: el asesor ve «Esta vista es de administración» (T-485).
- «Hoy» corrige H3: cada cifra mide lo que su rótulo dice, sin porcentajes ni periodo, y con el bloque
  «Sin responsable» de §2.
- Periodo por defecto: **mes calendario** en la zona de la agencia (pregunta 7, [Sí]; corrige H8).
  Comparación con el periodo anterior del mismo largo (pregunta 8, [Sí]).
- Muestra: el porcentaje solo con `n ≥ 20`; por debajo, la fracción «7 de 15» (corrige H4).
- Dinero siempre por moneda, sin total convertido con TRM (pregunta 9, [No]). R8.
- La web **no decide** nada de lo anterior por permiso propio: pinta lo que la API devuelve. Leer el
  permiso en la web es solo para titular y para no ofrecer un enlace que dará 403.

### 6. Qué no se muestra a cada nivel

| Dato | Propio (asesor, operaciones) | Agencia (dueña) |
|---|---|---|
| Cifras de otro asesor, con nombre o deducibles | **No** | Sí |
| Total de la agencia sin nombres | **No** (pregunta 4, [No]): con tres asesores, total − lo mío ≈ lo de los otros | Sí |
| Ranking de asesores | **No** (pregunta 5, [No]) | Sí |
| Neto, margen, costo del mayorista, comisión | Solo con `cotizacion.ver_neto_y_margen` | Solo con `cotizacion.ver_neto_y_margen` |
| PII de viajeros (documento, pasaporte, nacimiento, edades de niños) | **Nunca** | **Nunca**, tampoco en CSV (R10) |
| Texto de mensajes, notas, preferencias | Nunca | Nunca |
| Exportar CSV | No | Sí (sin PII de viajeros ni teléfonos; una fila por moneda; celdas que empiezan por `=`, `+`, `-`, `@`, tabulador o retorno llevan `'` delante) |
| Otra agencia | Nunca | Nunca |

**Margen y alcance son dos ejes que no se mezclan.** El alcance decide **qué filas**;
`cotizacion.ver_neto_y_margen` decide **qué columnas de dinero**. El margen visible es la
intersección: sin el permiso, la API **no calcula ni devuelve** esas claves, en ningún nivel. No hay
«margen propio» (pregunta 6, [No]): el `ASESOR` sembrado no tiene el permiso. Si una agencia se lo da a
un rol sin `reportes.ver_agencia`, ese rol ve el margen **de sus propias cotizaciones**, que es lo mismo
que ya ve en la pantalla de cada cotización: no se abre nada nuevo.

## Seguridad entre agencias

No cambia. El alcance «agencia» es exactamente el tenant de la sesión, con RLS y `tenant_id` en cada
`JOIN`. Todos los puertos con `$queryRaw` llevan un e2e propio de dos agencias, porque la guardia de
consultas sin filtro no ve SQL crudo (06 §5.2). Lo nuevo de este ADR es aislamiento **dentro** de una
agencia, entre asesores.

## Consecuencias

### Positivas

- D3 se cumple en el servidor: lo que un asesor no debe ver no sale de la API.
- Una sola función de alcance (`alcanceDeReporte`) y un contrato con forma por nivel: un endpoint
  nuevo no puede olvidarse del alcance sin que falle la compilación o el esquema.
- La agencia compone roles sin tocar código: el nivel lo da un permiso (R12).
- Campana y «Hoy» usan la misma regla para archivos sin responsable.

### Negativas

- Un permiso más en el `CHECK`: migración protegida, relleno de agencias y auditoría.
- El 403 en seguimientos con `asesorId` ajeno **cambia** lo que entrega #395 (silencio). Una web que
  hoy envíe el parámetro sin permiso empezará a recibir 403 y debe dejar de enviarlo (T-485).
- Calcular M6 por archivo en la aplicación tiene techo de volumen (500 archivos abiertos por agencia).
- `OPERACIONES` sembrado verá «Mis números» casi vacío: su trabajo de agencia está en Archivos y Cobros.
- Las métricas de venta dependen de que el asesor marque `ACEPTADA` a mano: una venta no marcada no
  cuenta para nadie.

### Qué habría que cambiar para revertirlo

Quitar el permiso del `CHECK` (migración nueva) y volver a un alcance único. Los datos no cambian: no
hay columnas ni tablas nuevas.

## Cola (no bloquea; en `roadmap/tasks.yaml`)

- **T-490** Visibilidad por asesor en las pantallas operativas del CRM y `asesorId` ajeno en
  `POST /crm/oportunidades` (pregunta 10).
- **T-491** Nivel «equipo»: solo si una agencia lo pide (pregunta 1). Otro ADR.
- **T-492** Saldo agregado de cobros en SQL con prueba de contrato contra `packages/domain`, cuando
  una agencia pase de 500 archivos abiertos.
- **T-493** `experto-turismo` valida la atribución de §2 en una agencia donde una persona cotiza y
  otra cierra, y la regla «Sin responsable».
- **T-484** (ya registrada) H4 a H8; **T-483** (ya registrada) CSV en el servidor con auditoría;
  filtros guardados por usuario, a la cola hasta que una agencia los pida (pregunta 14, [Sí]).

## 7. Plan de implementación

1. **T-341** (`datos`, ruta protegida): permiso en contratos, `CHECK`, siembra y relleno. Auditoría.
2. **T-342** (`backend`): `alcanceDeReporte`, puertos con `AlcanceDeReporte`, contrato con unión
   discriminada, atribución de M9 por `mensajes.autor_id`, 403 en seguimientos, retirada del gate
   provisional de #395. Si pasa de 3 días: T-342a resumen + seguimientos; T-342b endpoints de T-138 y
   T-139.
3. **T-485 → T-343 / T-344** (`frontend`): «Mis números», retirada del conmutador, H3, periodo, fracción.
4. **T-345** con T-483: CSV en servidor.
5. **T-346** (`qa`): e2e con dos asesores y dos agencias (§9).

## 8. Qué cambia si el propietario contesta distinto

| Pregunta | Si contesta lo contrario | Cambio |
|---|---|---|
| 1 (equipo) | Sí | T-491 se activa: tabla `equipos`, permiso nuevo y ADR propio. Nada de este ADR se rompe |
| 2 (operaciones) | Sí | La siembra y el relleno de T-341 dan `reportes.ver_agencia` también a `OPERACIONES`. Sin margen |
| 3 (venta a quien cotizó) | No | M7, M8 y M14 atribuyen por `oportunidades.asesor_id` actual; `cotizaciones.creado_por` queda para auditoría. Una línea en la tabla §2 y en las consultas |
| 4 y 5 (totales y ranking al asesor) | Sí | Se añaden a la rama `PROPIO` del contrato como claves explícitas, sin nombres en 4 |
| 6 (margen propio) | Sí | Hace falta un permiso nuevo (`cotizacion.ver_margen_propio`) y otro `CHECK`: ADR propio |
| 7, 8, 9, 11, 13, 14 | Lo contrario | Solo web o cola; no tocan la decisión estructural |
| 10 (archivos ajenos) | No | T-490 sube de prioridad; la regla de coherencia ya lo soporta |
| 12 (cierre provisional) | No | #395 no se integra y H1/H2 siguen abiertos hasta T-342 |
| §9 (las 6 de diseño) | — | Informan el diseño de T-343 y T-344; no tocan niveles ni permisos |

## 9. Qué revisa `auditor-seguridad`

1. Que **ningún** puerto de reportes lea `asesorId`, `usuarioId` o `alcance` del cliente sin pasar por
   `alcanceDeReporte`, y que la sesión sea la única fuente de «propio».
2. Que sin `reportes.ver_agencia` un `asesorId` ajeno responda 403 en reportes **y** en seguimientos, y
   que el 403 sea idéntico con un id inexistente o de otra agencia (no es un oráculo de existencia).
3. Que la rama `PROPIO` del contrato no contenga claves de agencia y que el servidor valide la salida.
4. Que el margen no se calcule ni viaje sin `cotizacion.ver_neto_y_margen`, en JSON y en CSV.
5. La migración de T-341: `CHECK` ampliado y validado, relleno solo del rol `DUENO` de cada agencia
   por `tenant_id`, sin `UPDATE` sin filtro, sin tocar roles personalizados.
6. Que cada `$queryRaw` de reportes lleve `tenant_id` en cada `JOIN` y su e2e de dos agencias.
7. Que las filas de detalle de un reporte de agencia respeten `visibilidadDe` (regla de coherencia).
8. CSV: escapado de fórmulas, sin PII de viajeros ni teléfonos, solo con `reportes.ver_agencia`, y
   generado en el servidor.
9. Que la web no sea la única barrera en ningún caso: probar cada caso contra la API, no la pantalla.

### Aceptación y auditoría (T-340, 2026-11-21)

**Por qué este apartado.** Este ADR entró en `main` como «Propuesto» y T-341, T-342 y T-343 se
construyeron encima antes de que nadie revisara la lista de §9. Eso contradice R7 (la decisión se
escribe y se revisa **antes** de implementarse). No se deshace; se regulariza aquí, y la cola de §7 pide
que la próxima decisión estructural no se implemente hasta estar aceptada.

**Quién.** La sesión de arquitectura y auditoría de seguridad, **orquestada por la sesión madre bajo la
autorización expresa del propietario** («tú tienes autorización mía para aprobar y destrabar los temas
pendientes como si fuera yo»). Es una sesión de Claude que lee el código, **no** una pasada del agente
`auditor-seguridad` ni una revisión humana: queda dicho para que nadie la cuente por más de lo que es.
El propietario puede reabrir el estado a «Propuesto» si quiere una segunda lectura.

**Qué se revisó.** El código de `main`, no el texto de este ADR: `shared/autorizacion/alcance-de-reporte.ts`,
`shared/autorizacion/asesor-de-consulta.ts`, `shared/puertos/puertos-de-reportes.ts`,
`modules/analytics/{interface,application}`, los cuatro adaptadores de reportes (quoting, crm, inbox,
payments), `packages/contracts/src/reportes.ts`, la migración `20261121160000_permiso_reportes_ver_agencia`,
la siembra de roles y los e2e `reportes.e2e-spec.ts` y `seguimientos-por-asesor.e2e-spec.ts`. No se
ejecutaron las pruebas en esta sesión (no hay base disponible): se apoya en el CI de `main`, donde `test`
y `aislamiento-tenants` están en verde.

**Veredicto de seguridad:** ningún hallazgo **bloqueante** (§3.1: nada que hoy esté roto o sea falso).
Resultado por punto de §9:

| § 9 | Resultado |
|---|---|
| 1. El alcance sale de la sesión | Cumple. Un solo punto de decisión (`alcanceDeReporte`, llamado solo desde `obtener-resumen.use-case.ts`), y los puertos reciben `AlcanceDeReporte`, no un id suelto |
| 2. 403 sin permiso, sin oráculo | Cumple en reportes y en seguimientos: el 403 se decide sin mirar la base y es idéntico con un id ajeno, inexistente o de otra agencia (probado) |
| 3. La rama `PROPIO` no trae claves de agencia | Cumple. Esquema `strict()` y `ResumenDeReportesPorAlcance.parse` sobre la salida |
| 4. Margen solo con `cotizacion.ver_neto_y_margen` | Cumple en JSON: sin el permiso las sumas no forman parte de la consulta SQL. **CSV: no aplica aún**, no existe exportación en el servidor (T-345, T-483) |
| 5. Migración de T-341 | Cumple: `CHECK` ampliado y validado, relleno solo del rol `DUENO` por `tenant_id`, con aserciones |
| 6. `$queryRaw` con `tenant_id` y e2e de dos agencias | Cumple: `tenant_id` en cada `FROM` y `JOIN`, y un e2e de dos agencias por puerto |
| 7. Filas de detalle y `visibilidadDe` | No aplica hoy: el resumen devuelve solo agregados. Queda como condición de cualquier endpoint futuro con filas |
| 8. CSV | No aplica hoy (no existe). Condición de T-345 / T-483 |
| 9. La web no es la única barrera | Cumple: el servidor impone el alcance sin mirar la web, y los e2e llaman a la API, no a la pantalla |

**Cola derivada (no bloquea):** la guarda de «solo agencia entera» de `porAsesor` y `ventasPorDestino` es
solo de tipos, sin comprobación en ejecución (T-fuga-defensa); el e2e de dos asesores no cubre un rol con
`reportes.ver_agencia` sin `conversaciones.ver_todas` (T-rol-mixto); y T-345 / T-483 deben cumplir 4, 7 y 8
al construirse. Las tareas concretas las registra la sesión madre en `roadmap/tasks.yaml`.

## Cuándo revisar esta decisión

- Cuando una agencia pida supervisión por equipos o sedes (pregunta 1).
- Cuando una agencia pase de 500 archivos abiertos (M6 en SQL).
- Si el propietario contesta 2, 3 o 6 al revés (§8).

## Enlaces

- Catálogo: `11-reportes-por-nivel-catalogo.md` de `docs/08-roadmap/` (PR #392)
- Roadmap de reportes: [`06-roadmap-de-reportes.md`](../08-roadmap/06-roadmap-de-reportes.md)
- Cierre provisional H1/H2: PR #395
- [ADR-0011](0011-autenticacion-y-tenant-de-sesion.md), [ADR-0024](0024-de-cotizacion-aceptada-a-archivo-de-viaje.md),
  [ADR-0034](0034-pagos-del-viajero-mvp-de-registro-manual.md)
