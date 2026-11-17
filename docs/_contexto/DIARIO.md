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
