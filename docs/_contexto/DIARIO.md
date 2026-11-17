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
