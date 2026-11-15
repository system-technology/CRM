# Respaldo y restauración

| Campo | Valor |
|---|---|
| Estado | **Propuesta. Pendiente de ensayo.** Nada de esto se ha ejecutado ni probado |
| Fecha | 2026-11-15 |
| Responsable | `devops` (procedimiento); propietario (cuenta del proveedor y plan contratado) |
| Cierra | Hallazgo A13 de la [auditoría 2026-11-15](../_auditorias/2026-11-15-auditoria-integral.md), tarea T-205. **Sigue abierta** hasta que el ensayo se haga y quede en la bitácora |
| Se apoya en | [ADR-0007](../03-adr/0007-postgres-gestionado-neon.md), [ADR-0019](../03-adr/0019-despliegue-minimo-un-proceso-sin-redis.md) §4.2 y §5, [política RS1–RS5](../05-seguridad/10-retencion-supresion-y-respaldo.md) |

## 1. Por qué existe este documento

La base de datos es la única fuente de verdad: con ADR-0019 hasta la cola de envíos vive en Postgres.
Si se pierde o se corrompe, se pierde la agencia. Hoy no hay agencia real ni servicio desplegado, y por
eso no se ha ensayado nada. Este documento fija **qué prometemos** y **qué hay que probar** antes de
que entre el primer dato real.

## 2. Qué proveedor hay

**Neon** (PostgreSQL gestionado), decidido en ADR-0007 y confirmado para producción en ADR-0019 §4.2.
`render.yaml` no declara la base: Neon es un servicio aparte, y su región actual es `aws-us-east-2`
(ADR-0013, ADR-0019 §4.2). Redis (Key Value de Render en la topología actual) **no se respalda**: solo
guarda trabajos transitorios, y la verdad durable está en Postgres (ADR-0010).

Qué ofrece Neon, según lo que recoge ADR-0019 §4.2 (precios y límites **por verificar** contra la
documentación oficial de Neon el 2026-11-15; no se consultó la página hoy):

| Plan | Restauración | Respaldos programados | Notas |
|---|---|---|---|
| Free | Instantánea de 6 h, hasta 1 GB de cambios | No | 1 instantánea manual. **No sirve** para datos reales |
| Launch | Hasta 7 días | No se afirma ninguno aparte de la restauración | 100 instantáneas manuales; sin mínimo mensual |

La decisión escrita es: **Neon Launch desde el primer dato real** (ADR-0019 §8). Una ventana de 6 h no
es un plan de respaldo.

## 3. Objetivos propuestos (RPO y RTO)

| Objetivo | Valor propuesto | De dónde sale | Estado |
|---|---|---|---|
| **RPO** (datos que se pueden perder) | ≤ 5 minutos con la restauración a un instante | ADR-0019 §5 dice «segundos»; aquí se promete más holgado porque nadie lo ha medido | **Por medir en el ensayo** |
| **RTO** (tiempo hasta volver a operar) | ≤ 1 hora en horario laboral | ADR-0019 §5: «recuperación en ≤ 1 h» | **Por medir en el ensayo** |
| Retención de la restauración | 7 días (plan Launch) | ADR-0019 §4.2 | **Sin fijar:** hoy no hay proyecto Launch |
| Copia secundaria | Volcado lógico semanal, cifrado con clave pública **antes** de salir de Neon | ADR-0019 §5 | **No existe.** Falta elegir destino (tarea de `devops`) |

Dos aclaraciones para no prometer de más:

- **No es alta disponibilidad.** Si cae el host, se redespliega a mano (ADR-0019 §5).
- **La supresión de un titular no llega a la ventana de restauración.** Un dato suprimido sigue en
  el historial hasta que caduca la ventana (política SU5). Se informa así a la agencia.

## 4. Qué se respalda y qué no

| Qué | Dónde vive | Cómo se recupera |
|---|---|---|
| Datos de negocio, directorio, recepciones, envíos pendientes | Postgres (Neon) | Restauración a un instante |
| Roles de aplicación y sus contraseñas | Cluster de Neon | **Por verificar en el ensayo** si la restauración los conserva; si no, `pnpm db:setup` y `rol:crear` los recrean y hay que actualizar los secretos |
| Trabajos de cola | Postgres (modo `unico`) o Redis (modo `escalado`) | En `unico`, con la base. En `escalado`, el barrido de arranque reconstruye lo pendiente desde Postgres |
| Claves y secretos (`ENCRYPTION_MASTER_KEY`, `WEBHOOK_PAYLOAD_KEY`, pimienta…) | Paneles del proveedor de cómputo | **Copia propia del propietario, fuera del proveedor** (S6). Un respaldo sin su clave no sirve; ver [rotacion-de-claves.md](rotacion-de-claves.md) |
| Media y documentos de viajeros (S3) | No implementado | Fuera de alcance hasta que exista |

## 5. Procedimiento de restauración (a un instante)

> Escrito sin ejecutar. Los nombres de botones y comandos de Neon son **por verificar** en el ensayo;
> lo que no cambia es el orden y las comprobaciones.

Cuándo: corrupción de datos, borrado por error, migración que salió mal. **Antes de empezar, el
propietario decide el instante objetivo** (el último momento bueno conocido) y lo anota con hora UTC.

1. **Declarar el incidente.** Anotar la hora de inicio (es el comienzo del RTO) y avisar a la agencia
   si hay conversaciones en curso. Seguir [09-respuesta-a-incidentes.md](../05-seguridad/09-respuesta-a-incidentes.md).
2. **Congelar las escrituras.** Detener la API (modo `unico`) o la API y el trabajador (modo
   `escalado`). Meta reintenta los webhooks que no recibió; lo ya aceptado está en Postgres.
3. **Restaurar a una rama aparte, no encima.** En el panel de Neon, crear una rama del proyecto de
   producción en el instante objetivo. Dejar la rama dañada intacta: es evidencia y es el plan B.
4. **Comprobar la rama restaurada sin tocar la aplicación.** Con un rol de solo lectura:
   - cuenta de filas de `mensajes`, `conversaciones`, `cotizaciones` y `contactos` frente a lo esperado;
   - la última fila de `mensajes` tiene una hora anterior al instante objetivo y posterior al último respaldo conocido;
   - `SELECT` en `_prisma_migrations`: la última migración coincide con la de `main`.
5. **Apuntar la aplicación a la rama restaurada.** Cambiar `DATABASE_APP_URL`, `DATABASE_ALTAS_URL`,
   `DATABASE_IDENTIDAD_URL` y `DATABASE_WEBHOOK_URL` en el panel del proveedor de cómputo. Si los roles no
   existen en la rama, recrearlos (`rol:crear`) y actualizar las cuatro contraseñas.
6. **Arrancar y comprobar.** `/salud/listo` responde 200 (comprueba base y que el rol no salte RLS). La
   API **aborta si el rol no es el que espera** (R2): un fallo aquí es una protección, no un error por
   silenciar.
7. **Prueba de humo.** Iniciar sesión, abrir la bandeja, enviar un webhook firmado de prueba
   (`scripts/firmar-webhook-whatsapp.mjs`) y ver que llega una conversación. Correr la prueba de
   aislamiento (`pnpm db:aislamiento`) contra la rama restaurada.
8. **Reconciliar lo perdido.** Todo lo ocurrido entre el instante objetivo y la caída se perdió en la
   base. Meta reintenta los webhooks recientes (el plazo exacto de reintento está **por verificar**);
   lo enviado por asesores en ese hueco hay que revisarlo a mano.
9. **Cerrar.** Registrar RTO y RPO medidos en `docs/_bitacora/AAAA-MM-DD-restauracion.md` (RS3) y rotar
   las contraseñas de los roles si la rama dañada quedó expuesta.

## 6. Checklist del ensayo previo a la primera agencia

El ensayo se hace **una vez antes del primer dato real** y después cada trimestre (política RS3; ADR-0019
§5 propone mensual, y manda el criterio más estricto mientras no se decida). Se hace sobre datos
sintéticos y **nunca** se restaura una copia de producción fuera de producción (RS4).

- [ ] El proyecto de Neon está en el plan Launch y la ventana de restauración es de 7 días (captura del panel, sin credenciales).
- [ ] Se decidió si se recrea el proyecto en `aws-us-east-1` antes de tener datos (ADR-0019 §4.2): después cuesta mucho.
- [ ] Hay una base con datos sintéticos de varias agencias: conversaciones, cotizaciones, contactos.
- [ ] Se **borra a propósito** una tabla de prueba y se anota la hora UTC exacta.
- [ ] Se restaura a un instante 2 minutos anterior, siguiendo el §5 paso por paso, **sin atajos que el procedimiento no tenga**.
- [ ] Se midió el RTO (reloj de pared, de «declarar» a «prueba de humo verde») y el RPO (filas perdidas).
- [ ] El RTO medido es ≤ 1 h y el RPO ≤ 5 min; si no, se corrige el objetivo o el procedimiento, no la medida.
- [ ] Se comprobó si los roles de aplicación sobreviven a la restauración, y el §4 se corrigió con el resultado.
- [ ] `pnpm db:aislamiento` pasa contra la rama restaurada.
- [ ] Se verificó que el rol propietario **no** se entregó a ningún servicio de cómputo (ADR-0013).
- [ ] La copia de las claves fuera del proveedor existe y **se abrió una vez** con éxito (S6).
- [ ] Se eligió el destino del volcado lógico semanal cifrado (nunca como artefacto de Actions: el repositorio es público) y se hizo uno.
- [ ] Hay una entrada en `docs/_bitacora/` con fecha, RTO, RPO y lo que falló.
- [ ] Se actualizó este documento: se quitó «pendiente de ensayo» y se anotó la fecha del ensayo.

## 7. Lo que no se pudo verificar al escribir esto

- Precios, límites de ventana y características actuales de Neon: se copiaron de ADR-0019 §4.2, que
  los tomó de la documentación oficial en octubre de 2026. Verificar antes de contratar.
- Si la restauración de Neon conserva roles y contraseñas, y cuánto tarda con una base real.
- El plazo en el que Meta reintenta un webhook que no recibió respuesta.
- Que exista un token de despliegue limitado por app en el proveedor de cómputo (ADR-0019 §5, NO VERIFICADO).
