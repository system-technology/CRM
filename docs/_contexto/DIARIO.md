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
