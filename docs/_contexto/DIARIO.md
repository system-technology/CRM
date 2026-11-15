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

**Pendiente (no darlo por hecho)**
- Del propietario: `CAMPOS_SENSIBLES_KEY` en Render y copia de la clave; `STAGING_DESPLIEGUE`;
  Meta real (T-080); decidir zod 4; ADR-0023/0024.

**Trampas nuevas**
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
