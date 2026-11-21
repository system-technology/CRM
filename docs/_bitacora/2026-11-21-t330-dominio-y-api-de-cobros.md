# 2026-11-21 — T-330: dominio y API de cobros del viajero

**Participantes:** `backend` (código de T-330), `documentador` (este registro; regla R14 del propietario: todo cambio se documenta, lo hecho y lo que se va a hacer).
**Duración / alcance:** T-330 en curso en la rama `a/T-330-dominio-y-api-de-cobros`. Este documento se escribió mientras el código aún no estaba integrado; abarca lo que ya está en `main` (T-328 y T-329), lo que T-330 debe entregar y lo que no se pudo verificar.

## Qué se hace

**Ya en `main`:**
- T-328: [ADR-0034](../03-adr/0034-pagos-del-viajero-mvp-de-registro-manual.md) (Propuesto), PR #378.
- T-329: migración `20261121140000_pagos_del_viajero_libro_de_cobro`, PR #382. Crea el enum `tipo_movimiento_de_cobro`; las tablas `pagos`, `plazos_de_cobro` y `parametros_de_cobro`; los disparadores `pagos_validar_alta`, `pagos_inmutables`, `pagos_sin_truncate` y `travel_files_venta_inmutable`; la clave `UNIQUE (id, tenant_id, moneda_iso)` en `travel_files`; y los permisos `cobro.ver`, `cobro.registrar` y `cobro.corregir`. Descripción en el [modelo de datos](../02-arquitectura/03-modelo-de-datos.md).

**T-330, en curso (sin integrar):**
- Dominio puro: `cobro.ts` (nuevo, en el paquete `domain`) con saldo, situación, estado de cobro y fecha límite, sobre `Money` (`bigint`, sin redondeo).
- Contratos: `cobros.ts` (nuevo, en el paquete `contracts`).
- Módulo `payments` en la API, con el puerto `PuertoArchivoParaCobro` hacia `booking` (el módulo declara el puerto; no importa a `booking`, R4).
- Las seis rutas del ADR §8, idempotencia en el orden del §4 y los eventos `payments.pago_registrado` y `payments.pago_reversado` por outbox, con solo ids.
- Reglas que el código debe cumplir: tipo permitido según el estado del archivo; lo pagado y el total sin negativos; `registrado_por` de la sesión; `registrado_en` nunca del cliente; idempotencia `200` (mismo contenido) o `409` (distinto); sumas como `bigint`; permisos `cobro.*`; filtro Luhn en `nota` y `referencia`.
- Esta sesión de documentación actualizó el diccionario (Devolución, Reverso, Ajuste del total, Estado de cobro, Fecha límite de cobro, Saldo, Saldo a favor, aclaración de «Abono»), el modelo de datos, el contexto `payments`, el eje C del roadmap y `ESTADO.md`.

## Decisiones tomadas

| Decisión | Razón | Dónde quedó registrada |
|---|---|---|
| Libro de movimientos que solo crece; saldo derivado, nunca columna | Un saldo editable no deja historial ni autor | ADR-0034 (Decisión, opción B) |
| `payments` lee el archivo por un puerto propio y `booking` no se entera | R4; el estado de cobro lo calcula `payments` al leer | ADR-0034 §1 |
| Eventos `pago_registrado` y `pago_reversado` sin consumidor; `PaymentReceived` reservado a una pasarela | Cuestan un `INSERT` y son el contrato de T-333 | ADR-0034 §7; [contextos delimitados](../02-arquitectura/02-contextos-delimitados.md) |
| Las pantallas se verifican en celular, tablet y escritorio (aclaración del propietario) | El CRM se usa desde las tres familias de ancho | [Roadmap JD Tours](../08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md), eje C |
| «Abono» es lo que la agencia paga al mayorista; el viajero «registra un pago» | Evitar dos significados para una palabra | ADR-0034 §9; [lenguaje ubicuo](../01-producto/02-lenguaje-ubicuo.md) |

## Qué quedó pendiente

- [ ] Integrar T-330 (ver «Pendiente de rellenar al cerrar T-330»).
- [ ] T-331, T-332 y T-333, en ese orden; las dos primeras con verificación en tres anchos.
- [ ] Respuesta del dueño a las siete preguntas de cobros (roadmap §4). Mientras tanto rigen los supuestos.
- [ ] Aceptar ADR-0034 (hoy Propuesto) cuando se cierre la auditoría que el propio ADR pide.
- [ ] Cola del ADR (T-419 a T-424): TRM por pago, medios por agencia, cifrado de nota y referencia, primer consumidor de los eventos.
- [ ] El mapa Mermaid de `02-contextos-delimitados.md` aún dibuja `TravelFileConfirmed` → `payments` y `PaymentReceived` → `booking`. El texto del contexto aclara que no se usan en el MVP; el diagrama se corrige cuando se decida el flujo de pasarela.

## Qué aprendimos

- **Verificado** (leído en la migración y el ADR): la base impide movimientos cruzados entre agencias, en otra moneda, editados, borrados, reversos dobles o de reverso, y un total de archivo que cambie. `tenants.id` queda inmutable por diseño.
- **Sin verificar:** los e2e contra Postgres real y la carrera registrar-cancelar solo se validan en el CI. **Nada de T-330 se ejecutó contra una base local.** Tampoco la migración (la validó el CI de #382).
- **Supuestos del propio ADR sin verificar con el dueño:** `OPERACIONES` solo ve cobros; la penalidad no supera lo pagado; pagos libres con una sola fecha límite; el plazo legal de conservación del soporte contable (con el contador).
- La carrera registrar-cancelar no la resuelve la base: el disparador no mira el estado del archivo. Lo resuelve la API con el candado por archivo y debe probarse con dos conexiones.
- Los documentos que citan archivos de T-330 los nombran sin ruta completa mientras no existan, para no romper el job `enlaces-de-documentacion`.

## Pendiente de rellenar al cerrar T-330

Lo completa quien integre. No hay resultados todavía.

- SHA y número del PR de T-330: _pendiente_
- Resultado del CI (checks verdes sobre total): _pendiente_
- Resultado de `aislamiento-tenants` y de los e2e de cobros contra Postgres: _pendiente_
- Veredicto de la auditoría (`auditor-seguridad` / `auditor-codigo`) y hallazgos que pasaron a la cola: _pendiente_
- Estado final de las rutas y los eventos (qué quedó en `main`, qué se recortó): _pendiente_
- Actualizar `ESTADO.md`: mover la fila de T-330 de «a medias» a «en `main`» con su evidencia: _pendiente_

## Estado al relevo de la sesión de cobros (2026-11-21, tarde)

La sesión que llevó los cobros se releva (sesiones cortas, decisión del propietario). Lo que solo estaba en su
conversación, escrito aquí para quien siga.

**Qué está hecho e integrado:** T-328 (ADR-0034, #378), T-329 (migración `20261121140000`, #382), el PR web previo
de permisos (#383) y su limpieza (#387).

**PR abiertos de cobros (verificar el estado con `gh`, no con este texto):**

| PR | Qué es | Estado |
|---|---|---|
| #393 | T-330, solo código: dominio puro, contratos y módulo `payments` | Sin auto-merge. La auditoría de seguridad dio B1 (una penalidad vigente podía quedar sin pagar tras devolver o reversar un pago): corregido, con C1 (límite de espera del candado) y C2 (ids en minúsculas). Falta ver el CI de la última cabeza y el repaso de la auditoría |
| #390 | Documentación de cobros (este PR) | En la fila de documentación de la sesión madre; al integrarse #388, actualizar con `main` y resolver `ESTADO.md` a mano conservando las dos filas |
| #386 | Cierre de T-328 y T-329 en `tasks.yaml` y su cola (T-472 a T-479) | Sin auto-merge, en la misma fila |

**Lo siguiente, en orden:**

1. Cuando #393 pase la auditoría y el CI (`test` con el e2e de cobros contra Postgres real), integrarlo por la sesión madre y, en un PR `i/` de cierre, marcar T-330 como hecha, rellenar «Pendiente de rellenar al cerrar T-330» y actualizar `ESTADO.md`.
2. **T-331** (pantalla del archivo con el cobro, carril `b/`): registrar un pago y ver el saldo; depende de T-330 y T-316. Se verifica en celular, tablet y escritorio. Sin auto-merge en `apps/web`.
3. T-332 (vista «quién pagó y quién debe») y T-333 («Hoy» y la campana avisan cobros vencidos).

**Cola de la auditoría de T-330 por registrar en `tasks.yaml`** (con ids libres tras `git fetch` y mirar los PR de
documentación abiertos; ya chocaron dos veces):

- **Luhn:** el filtro no quita `/`, `_`, `,` ni reconoce dígitos Unicode (`backend`).
- **Reverso idempotente:** un reverso idempotente con otro motivo responde 200; anotarlo en la documentación de la API de cobros (`backend`).
- **Guardia de fronteras:** `payments` y `booking` fuera del mapa `DUENOS` de `scripts/verificar-fronteras.mjs`, ruta protegida (`devops`).
- **Cobros cancelados y parámetros:** vista de archivos cancelados con «pagado sin devolver» (`dueno-de-producto` y `frontend`); un `GET /cobros/parametros` si el diseño de ajustes lo pide (`backend`).

**Trampas que no estaban en los documentos:**

- Código (`a/`) y documentos (`i/`) no pueden ir en el mismo PR: `Carril y tarea` queda en rojo y `override-lane` solo lo decide el propietario.
- Un permiso nuevo del contrato exige su etiqueta en la web (el mapa es `Record<Permiso, …>`): se resolvió con un PR web previo, no con `override-lane`.
- No hay Postgres local: ni migraciones ni e2e se pueden ejecutar fuera del CI, y no se debe intentar levantarlo. Un log grande del CI se lee guardando la salida en archivo y filtrándola con una expresión regular.
- `commitlint` rechaza el tipo `wip` y los asuntos con mayúsculas; el hook de pre-commit corre `eslint` y no se evita con `--no-verify`.
