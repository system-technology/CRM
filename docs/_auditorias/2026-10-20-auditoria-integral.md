# Auditoría integral — 2026-10-20

**Perímetro:** Completa, revisión estática del monorepo en `docs/informe-auditoria-externa` (`4342d80`). Se revisaron seguridad/aislamiento, calidad y fronteras, dominio, cobertura, operación y documentación. No se ejecutaron pruebas ni se verificaron sistemas desplegados.

**Archivos revisados:** código de API, web y paquetes; esquema y migraciones; CI y configuración de operación; ADR vigentes, `ESTADO.md` y documentación de producto/seguridad. El informe externo preparado el mismo día se usó como contexto, no como evidencia sustituta del código.

**Hallazgos:** 1 alto, 4 medios.

## Veredicto

**No está listo para clientes reales.** Aún no hay despliegue y faltan verificaciones de Meta y Postmark; además hay datos que pueden incluir PII sensible almacenados en claro y dos caminos de cotización que no aplican por completo las condiciones comerciales registradas. La revisión estática no encontró un bypass evidente de tenant en los flujos examinados, pero no reemplaza pruebas de aislamiento ni una auditoría legal.

## Hallazgos

### [ALTO] PII sensible persiste sin cifrado en campos de contacto y mensajes

- **Dónde:** `packages/database/prisma/schema.prisma:1039-1047` y `:1488-1497`.
- **Qué pasa:** el esquema reconoce que `Contacto.preferencias` puede contener alergias y que `Mensaje.texto` puede incluir pasaportes, fechas de nacimiento de menores y alergias; ambos campos se almacenan como texto ordinario sin cifrado por columna.
- **Escenario:** una exposición de la base, un respaldo o un acceso de lectura a esos registros revela esos datos. El cifrado temporal del payload entrante no protege la copia persistida en `mensajes`.
- **Corrección:** acordar y documentar la política de minimización, cifrado y acceso antes de producción; el cambio requiere decisión de arquitectura y revisión de seguridad.
- **Dueño:** `arquitecto` + `auditor-seguridad`.
- **Verificación:** CONFIRMADO por esquema y migración; exposición material plausible, no se simuló una filtración.

### [MEDIO] El cálculo de tarifas omite restricciones por edad y uso de silla

- **Dónde:** `apps/api/src/modules/quoting/domain/seleccion-de-tarifas.ts:57-64,74-84`.
- **Qué pasa:** `edadMinima`, `edadMaxima` y `ocupaSilla` hacen que se solicite composición, pero el cálculo recibe solo conteos de adultos/niños/infantes y `pasajerosQueCubre` filtra únicamente por `tipoPasajero`.
- **Escenario:** para una tarifa infantil aplicable solo entre ciertas edades, todos los pasajeros CHD se cuentan igual; tampoco se separa un infante que ocupa silla de uno que no. El precio puede no corresponder a la condición publicada por el mayorista.
- **Corrección:** representar las edades y el uso de silla por pasajero en la entrada de cotización, o impedir cotizar automáticamente tarifas cuya condición no se puede evaluar.
- **Dueño:** `backend` + `experto-turismo`.
- **Verificación:** CONFIRMADO por el tipo de entrada y la función de selección; no se ejecutaron pruebas.

### [MEDIO] La ruta antigua de cotización conserva otra regla de resolución

- **Dónde:** `apps/api/src/modules/quoting/interface/catalogo.controller.ts:47-53`; `apps/api/src/modules/quoting/application/cotizar-paquete.use-case.ts:57`.
- **Qué pasa:** `POST /api/v1/paquetes/cotizar` sigue expuesto y consulta el modelo antiguo de temporadas con `findFirst`, mientras la ruta nueva de salidas resuelve vigencias y rechaza empates.
- **Escenario:** al existir rangos solapados que empatan, la ruta antigua puede escoger un precio en silencio y la nueva señalar error; dos cotizaciones del mismo producto pueden divergir según endpoint.
- **Corrección:** retirar la ruta antigua o hacer que delegue en el mismo resolvedor de vigencias, tras confirmar el uso de compatibilidad.
- **Dueño:** `backend`.
- **Verificación:** CONFIRMADO por rutas y casos de uso; no se reprodujo con una base.

### [MEDIO] `/salud/listo` informa degradación con HTTP 200

- **Dónde:** `apps/api/src/salud.controller.ts:26-38`; requisito en `docs/03-adr/0013-despliegue-staging-y-produccion.md:135`.
- **Qué pasa:** el cuerpo devuelve `estado: 'degradado'` si el rol puede omitir RLS, pero el controlador no cambia el código HTTP.
- **Escenario:** un balanceador que solo evalúa códigos 2xx considera listo el proceso aunque el endpoint indique que el aislamiento no está forzado. La guardia de arranque reduce el riesgo, pero el contrato del health check no cumple lo documentado.
- **Corrección:** responder con estado no exitoso cuando falle el aislamiento y mantener el detalle diagnóstico en el cuerpo.
- **Dueño:** `backend` + `devops`.
- **Verificación:** CONFIRMADO por implementación; no se conectó un balanceador.

### [MEDIO] `ESTADO.md` contradice el avance que consigna en sus propias tablas

- **Dónde:** `ESTADO.md:19-38,53` frente a tareas 5, 6 y 12 de la cola.
- **Qué pasa:** la portada afirma que no existen inbox, persistencia de cotizaciones ni autenticación, y que la bandeja está en construcción; más abajo indica que la bandeja se integró en v0.24–v0.28, las cotizaciones persistidas en v0.22–v0.23 y autenticación en v0.33–v0.35. La cabecera también dice que hay ocho ADR aceptados aunque ya existe ADR-0013 aceptado.
- **Escenario:** alguien que siga la fuente de estado declarada por el proyecto prioriza trabajo ya integrado o informa una capacidad como inexistente.
- **Corrección:** sincronizar portada, tablas y cola con `main` y señalar las tareas pendientes reales.
- **Dueño:** `documentador`.
- **Verificación:** CONFIRMADO por contradicción textual interna y registros de integración.

## Qué se revisó y salió limpio

- **Seguridad y aislamiento:** en los flujos examinados, el middleware deriva el tenant de la sesión verificada; la cabecera de desarrollo se limita a `APP_ENV=local` sin sesión; `conTenant` fija contexto en transacción; el webhook valida HMAC sobre el cuerpo crudo y sella el payload temporal. No se encontró un bypass evidente en esta revisión estática. No se repitió la suite RLS.
- **Fronteras:** no se encontraron importaciones directas entre `inbox`, `crm` y `quoting` en las áreas inspeccionadas; las dependencias revisadas pasan por puertos.
- **Aislamiento/CI:** el workflow define PostgreSQL y Redis efímeros, corre migraciones y pruebas y tiene un job separado de aislamiento. No se verificó el estado remoto del CI en esta sesión.
- **Cobertura:** hay pruebas unitarias y e2e en varios flujos de API, pero no se ejecutaron. Sigue faltando automatización del flujo completo de navegador a cotización y verificación de tiempo real en navegador real.

## Deuda aceptada conscientemente / límites de salida

| Deuda o límite | Por qué no bloquea esta auditoría | Cuándo se revisa |
|---|---|---|
| No hay despliegue en staging ni producción; Meta y Postmark no se verificaron en vivo | Es estado conocido del proyecto y delimita que no puede exponerse aún a clientes; no es un defecto introducido en el código revisado | Antes del piloto real; dueño `devops` / propietario |
| No hay procedimiento completo de retención/supresión de PII ni revisión legal | Requiere decisión operativa/legal y debe resolverse antes de producción | Antes de producción; dueño propietario + `documentador` |
| Pruebas BullMQ pueden omitirse si falta `REDIS_URL` | El CI actual configura Redis; la posible omisión accidental ya está descrita en la cola del estado | Próxima revisión de CI; dueño `qa` |
| Observabilidad de producción y smoke tests de despliegue pendientes | Staging aún no está configurado; el riesgo se materializa al desplegar | Antes del primer staging; dueño `devops` |
