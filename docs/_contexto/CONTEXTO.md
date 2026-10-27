# CONTEXTO — memoria de trabajo para retomar sin perder nada

> **Para qué sirve.** Una sesión de IA se compacta y olvida. Este archivo es lo primero que se lee al
> retomar: **quién decide qué, qué se ha hecho, qué está corriendo, qué está pendiente y qué trampas hay**.
> Se actualiza al cerrar cada tramo de trabajo (cada vez que cambie algo de lo que aquí se dice).
> No contiene secretos: ni valores de `.env`, ni tokens, ni claves. Si un dato es secreto, aquí solo
> se dice dónde vive.
>
> **Orden de autoridad** (CLAUDE.md §9): `ESTADO.md` (dónde estamos) > ADR (por qué) > bitácora (qué pasó) >
> `roadmap/tasks.yaml` (qué sigue). Este archivo **no los sustituye**: los resume y enlaza, y guarda lo que
> no cabe en ellos (el entorno vivo, las trampas, el modo de trabajo).
>
> Última actualización: **2026-10-27 (madrugada)**. El propietario está AUSENTE: se trabaja desatendido dentro de los límites de §12.

---

## 1. Quién es quién y cómo se trabaja

- **Propietario:** usa la cuenta de GitHub `Alfavear` (administrador de la organización `system-technology`). Habla
  español. Decide producto, precio, razón social, y es quien hace lo que exige su cuenta (Meta, pagos, Render).
- **Lo que pide, siempre:** velocidad y **resultados reales**: «un CRM funcional, no una maqueta», **dinámico para
  cualquier agencia de turismo** (el catálogo nunca puede ser una limitación). Respuestas francas, cortas y en
  español; si algo falló, decir qué y por qué.
- **Autorizaciones dadas por el propietario en esta sesión** (2026-10-26): trabajar y destrabar el proyecto;
  acceso al `.env` y ajustarlo; **aprobar y mergear PRs en su nombre**; borrar ramas inútiles; «permiso total».
  OJO: el clasificador de permisos de Claude Code **no se anula por el chat** (ver §9, trampas).
- **Quién escribe código:** los agentes de `.claude/agents/` (Claude) y **Antigravity** (frontend). El ciclo
  autónomo de **OpenCode está detenido** (fichero `D:\Projects\sesiones\STOP`): la cuota de OpenCode Go se agotó
  y cada ciclo tardaba 25–30 min. Entregó 3 PRs de backend (#21, #23, #25). Su infraestructura sigue en el repo.
- **Claude (esta sesión) es orquestador y validador**: define tareas, delega en agentes, revisa lo que entra,
  integra PRs, y hace él mismo lo que nadie más puede (configuración, GitHub, scripts de herramienta).

## 2. Producto y decisiones vigentes

- **ViajaPro:** SaaS multi-tenant, CRM vertical para agencias de turismo, WhatsApp Cloud API nativo, Colombia (COP).
- **Agencia piloto candidata: JD Tours Cartagena** (https://jdtourscartagena.com): 19 excursiones de un día por
  persona en COP, precio de lista y promo, «impuesto de muelle no incluido». Su WhatsApp es el +57 302 423 2965
  (pendiente decidir cómo migrarlo a la API: ver §6). También hay un catálogo real sembrado de **André's Tours**
  (34 productos, 8 grupos de salida; `docs/01-producto/10-catalogo-real-de-referencia.json`).
- **Norte de producto: HubSpot** (decisión del propietario): inventario verificado en
  `docs/_investigacion/2026-10-26-hubspot.md`; roadmap en `docs/08-roadmap/02-roadmap-producto-v3.md`
  (F1 piloto utilizable, F2 mejor que HubSpot para turismo, F3 automatización, F4 escala). Ventaja vertical:
  cotización por pasajeros, salidas y cupos, netos y margen, archivo de viaje, WhatsApp desde el plan base, COP.
- **ADR-0017 (aceptado por el propietario): catálogo gestionable por la agencia, por CUATRO canales** (pantalla,
  plantillas CSV/Excel, API pública con claves por agencia, IA que solo PROPONE). Un solo núcleo de validación y
  aplicación transaccional e idempotente. `promo_vencida` (ocultar | tachar) es **política por agencia**
  (por defecto ocultar). «Desde» se calcula solo sobre tarifas base y por moneda. Los horarios van en
  `opciones_de_salida`. Backlog: `docs/_backlog/catalogo-gestionable-tareas.yaml` (T-032 a T-050).
  M3 (claves de API, rol `viajapro_claves`) y la IA siguen bloqueadas por seguridad.
- **ADR-0018 (propuesto): envío saliente de WhatsApp.** **ADR-0016:** el ciclo autónomo (propuesto; no dice aún que
  está detenido: un ADR aceptado no se edita, se supersede).
- **Decisiones del propietario aún abiertas:** quién paga a Meta (recomendado: cada agencia), cobro por agencia
  o por asesor (recomendado: por agencia en tramos), prueba de 30 días sin plan gratis, si JD Tours opera sus
  salidas o las revende, razón social dueña de la app de Meta, **PR #29 (cifrado, migración irreversible)**.

## 3. Estado técnico (verificado hoy)

- **Repo público:** `system-technology/CRM`, rama `main` con **protección de servidor** (PR + 8 checks + rama al día +
  administradores incluidos + conversaciones resueltas; `require_code_owner_reviews` con CODEOWNERS en rutas
  sensibles, hoy sin efecto cuando autor y propietario son la misma cuenta). Auto-merge y borrado de rama al
  integrar activos. Escaneo de secretos con push protection.
- **CI (10 jobs):** `secretos` (binario gitleaks, no la acción: pide licencia en organizaciones), `typecheck`, `lint`,
  `test`, `build`, `aislamiento-tenants`, `fronteras-entre-modulos`, `convencion-de-commits`, `politica-de-rama`,
  `imagenes-de-despliegue`; «Carril y tarea» no es obligatorio.
- **Real (backend):** cotizador con versiones y estados, CRM (contactos, oportunidades, pipeline), identidad
  (Better Auth, invitaciones, código por correo), recepción de WhatsApp (webhook firmado → almacenamiento cifrado
  sin RLS → cola), **envío saliente de WhatsApp** (PR #44, probado solo contra una Graph API falsa), correo por
  Postmark (adaptador), aislamiento entre agencias por RLS con suite de 79 aserciones.
- **Migraciones:** 24 en el repo y **24 aplicadas a Neon** (M1 `20261026120000_permiso_catalogo_administrar` y M2
  `20261026120100_catalogo_extendido_formatos_y_opciones_de_salida` se aplicaron el 2026-10-26 con `pnpm db:migrate:deploy`).
  **Neon (rama de desarrollo, 100 % datos sintéticos) contiene dos agencias:** `agencia-demo` (37 paquetes, 13 contactos, 7 etapas, canal de
  WhatsApp de prueba registrado) y **`jd-tours-cartagena`** (19 excursiones, 17 con precio, 4 opciones de salida, 2 «Consultar»), sembradas con
  `pnpm db:seed` y `seed:agencia-json`. Identidades con contraseña de desarrollo (`IDENTIDAD_DEV_PASSWORD` del `.env`): `ana@`, `carlos@`, `dueno@`
  `agenciademo.test` y **`dueno-jdtours@agenciademo.test`** (la demo de JD Tours).
- **Web:** pantallas reales en código, pero **bloque 1 (modo real por defecto, PR #47) y bloque 2 (cotizador de excursiones, PR #52)
  de Antigravity** están integrados. La web aún no se ha verificado de punta a
  punta contra la API real en navegador.
- **NO existe aún:** Redis/trabajador local (los mensajes recibidos no se convierten en conversaciones),
  despliegue en Render, verificación del negocio en Meta, catálogo gestionable, pagos, automatizaciones, móvil.

## 4. Entorno vivo en la máquina del propietario (Windows 11, `D:\Projects\`)

| Qué | Dónde / cómo |
|---|---|
| Checkout principal | `D:\Projects\CRM` (rama `main`; los PRs se hacen desde ramas nuevas) |
| Antigravity | `D:\Projects\CRM-bandeja` (rama de trabajo; **no tocar**, tiene cambios sin guardar). Prompt: `docs/09-ia/08-prompt-antigravity.md`, skill `.agent/skills/ux-crm-turismo/SKILL.md`, cola `T-016..T-031` en `roadmap/tasks.yaml` |
| API de desarrollo | `pnpm --filter @viajapro/api dev` → `http://localhost:3333` (conectada a **Neon** con `viajapro_app` y `viajapro_identidad` verificados). Log en `%TEMP%\api3.log` |
| Web de desarrollo | `pnpm --filter @viajapro/web dev` → `http://localhost:3000` (con `NEXT_PUBLIC_API_URL=http://localhost:3333`) |
| Túnel a Meta | `D:\Projects\_tools\cloudflared\cloudflared-windows-amd64.exe tunnel --url http://localhost:3333` (hash verificado). **URL temporal** (la última: `https://sub-ratio-sharon-coupled.trycloudflare.com`); si se reinicia cambia y hay que repegarla en Meta. Mientras esté abierto, la API local es pública: cerrarlo al terminar |
| Ciclo de OpenCode | `D:\Projects\CRM-ciclo` (clon del supervisor), estado en `D:\Projects\sesiones\` (**parado** con `STOP`) |
| Referencia | `D:\Projects\_referencia\ALTARDIARIO` (repo público `system-technology/ALTARDIARIO` del que se portó el ciclo) |
| PostgreSQL 18 local | instalado y corriendo en 5432, **sin credenciales conocidas**; no se usa |
| No hay | Docker, Redis, Mailpit |
| Restos por borrar (Windows: rutas largas) | carpetas `D:\Projects\CRM-api`, `CRM-gate`, `CRM-inbox` y `.claude\worktrees\agent-*`: contienen copias viejas de `.env`; borrar con `Remove-Item -LiteralPath '\\?\<ruta>' -Recurse -Force` |

`node scripts/estado-de-arboles.mjs` informa qué árboles de trabajo están atrasados respecto a `main`.

## 5. `.env` (nunca se copia aquí ningún valor)

- Vive en `D:\Projects\CRM\.env` (ignorado por git). El propietario **autorizó** acceso al archivo; aun así: no imprimir valores.
- **Presentes:** `DIRECT_URL` (rol propietario de Neon), `DATABASE_APP_URL`, `_ALTAS_`, `_WEBHOOK_`, **`DATABASE_IDENTIDAD_URL`**
  (generada con `scripts/rotar-roles-y-actualizar-env.ps1` el 2026-10-26; respaldo en `%LOCALAPPDATA%\viajaproespaldos-env`),
  `BETTER_AUTH_SECRET`, `CORREO_PAYLOAD_KEY`, `IDENTIDAD_DEV_PASSWORD`, `WEBHOOK_PAYLOAD_KEY`, `WHATSAPP_DIRECTORY_PEPPER`,
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (propio, 64 caracteres) y las de Meta de la app de prueba: `META_APP_ID`, `META_APP_SECRET`,
  `META_PHONE_NUMBER_ID_PRUEBA`, `META_WABA_ID_PRUEBA`, `META_SYSTEM_USER_TOKEN` (**el temporal dura 24 h**; el permanente se crea como usuario del sistema).
- Modo local sin Redis: `COLA_CHANGES=inerte`, `COLA_CORREO=memoria`, `BUS_DE_EVENTOS=memoria`, `LIMITADOR_OTP=memoria`.
  Con `COLA_CHANGES=inerte` los mensajes recibidos **se guardan pero no se procesan**.
- Nombre canónico del número de prueba: **`META_PHONE_NUMBER_ID_PRUEBA`** (no `META_TEST_PHONE_NUMBER_ID`).

## 6. WhatsApp / Meta

- App de prueba de Meta **creada hoy** (la anterior ya no existía en la cuenta). Webhook configurado y verificado:
  URL `<túnel>/webhooks/whatsapp` (**sin `/api/v1`**), campo `messages` suscrito.
- **Probado el 2026-10-26 17:34:** el mensaje de ejemplo del botón «Probar» de Meta llegó, la firma se validó con el App Secret
  y se guardó cifrado («Recepción guardada con 1 change pendiente»). **No se ha probado un mensaje real desde un celular.**
- Aviso de Meta: con la app sin publicar, solo se entregan webhooks de prueba del panel; para datos reales hay que publicar la
  app (exige URL de política de privacidad) y, para producción, **verificación del negocio** (RUT/NIT, cámara de comercio) y
  **Tech Provider** + revisión de permisos (`whatsapp_business_management`, `whatsapp_business_messaging`).
- Pendiente para ver conversaciones: **Redis + trabajador** y ejecutar `canal:registrar-prueba` (registra el número de prueba en
  la agencia demo). Pendiente decidir: cómo se migra el número real de JD Tours (si hoy está en la app WhatsApp Business hay
  reglas; existe el modo coexistencia).

## 7. GitHub, identidades y cómo se integra

- **GitHub Apps reutilizadas de AltarDiario** (provisional, riesgo aceptado): `altardiario-integradora` (id 5449524),
  `-plataforma` = backend (5449581), `-producto` = frontend (5449590); claves en `~/.altardiario-keys/`. Variable de repo
  `INTEGRADORA_APP_ID` y secreto `INTEGRADORA_APP_KEY` ya puestos. Ver `scripts/gh-apps.json`. Sin permiso de workflows.
- **Workflows:** `cerrar-tarea` (al integrar una rama `a|b|i/T-xxx-…` abre un PR que marca la tarea `done`), `mantener-ramas`
  (actualiza PRs atrasados; a veces llega antes de que GitHub recalcule), `ownership`, `deploy-staging` (verde sin hacer nada
  mientras falten los secretos del Environment `staging`).
- **Procedimiento de integración:** la protección es «rama al día», así que **cada integración deja atrasados a los demás PRs**.
  Se hace **de uno en uno**: `gh api -X PUT repos/system-technology/CRM/pulls/N/update-branch`, esperar el CI, `gh pr merge N --merge`.
  Un bucle en segundo plano lo automatiza. `update-branch` por la API falla si `main` cambió workflows (falta el scope
  `workflow` del token): en ese caso fusionar `origin/main` en local y empujar.
- **Rutas con aprobación del propietario** (CODEOWNERS / `humanRequired` de `ownership.json`): migraciones, políticas RLS, `schema.prisma`,
  cifrado, `docs/03-adr/`, `render.yaml`, `infra/`, `.github/`, `.claude/`, `.opencode/`, `scripts/`, `tools/`, `.env*`, dependencias,
  `CLAUDE.md`, `AGENTS.md`. El propietario delegó su aprobación en Claude.
- **Convenciones que hacen fallar el CI si se olvidan:** commits convencionales con **scope de `commitlint.config.mjs`** y
  **asunto en minúscula** (el hook de commit lo exige y el job `convencion-de-commits` revisa **todos** los commits del PR);
  prettier sobre los ficheros tocados (`format:check`); `pnpm install --frozen-lockfile` y `pnpm exec turbo run build --filter=@viajapro/contracts --filter=@viajapro/domain` **antes** de probar la API (si no, falsos rojos por `dist` viejo).

## 8. Agentes usados y cómo se les encarga trabajo

- Se lanzan con `Agent` y `isolation: "worktree"`; los que no tienen shell (arquitecto, investigador, auditores, jefe de producto)
  **no pueden hacer commit**: el commit y el PR los hace el orquestador desde su worktree.
- Revisión (una sola vuelta, R13): `auditor-seguridad` y `experto-turismo` ya revisaron el ADR-0017 (aceptar con cambios, aplicados).
  Pendiente de revisión: ADR-0018 y la ingesta con IA (`docs/09-ia/09-ingesta-de-catalogo-con-ia.md`, PR #37, que debe alinearse con el ADR-0017).
- **Protocolo con Antigravity** (`docs/09-ia/06-flujo-con-antigravity.md`): empuja su rama = señal; Claude abre el PR, verifica
  (compuertas + navegador) y escribe `traspaso/REVISION.md`. Sus ramas deben salir de `origin/main` (una salió de la rama vieja y hubo que
  portar solo sus commits nuevos con `cherry-pick`). **No debe detenerse** si una tarea está bloqueada: salta a la siguiente.
- **Stitch:** proyecto «ViajaPro — CRM para agencias de turismo», id `8333038101997719867`. Desde aquí las generaciones agotan el tiempo; las hace Antigravity.

## 9. Trampas conocidas (cada una costó tiempo)

- **Clasificador de permisos:** bloquea, aun con autorización en el chat, escribir en `.env`/secretos, rotar credenciales, subir secretos a GitHub,
  `rm -rf`, `psql` a la base local, y alguna escritura a Neon. La salida es una **regla `allow` en `.claude/settings.local.json`** puesta por el
  propietario, o que él ejecute el comando. No rodearlo.
- **Hook `guard-rama`:** bloquea `git commit`/`merge` si la rama actual es `main`. Hay que **cambiar de rama en una orden y commitear en otra**.
- **Windows:** rutas largas rompen `git worktree remove` y `rm`; `git bash` reescribe rutas que empiezan por `/` en `gh api` (usar sin barra inicial);
  PowerShell 5.1 no admite `<` ni `&&`; `curl` y `sleep` largos están bloqueados en esta herramienta (usar `node -e fetch` y bucles `until`).
- **Neon es compartido:** las pruebas e2e y de aislamiento corren contra él; `sembrar-dev` y `registrar-canal` se niegan a correr contra una base con
  datos reales y exigen opt-in en la línea de comandos (no en el `.env`).
- **Prisma:** `schema.prisma` en `main` ya espera M1/M2; sin migrar Neon, las consultas del catálogo fallan por columnas inexistentes.
- **`gitleaks-action` exige licencia en organizaciones:** por eso el CI usa el binario.
- **OpenCode Go:** `Go usage limit exceeded` (cuota agotada hoy). NVIDIA era el respaldo, pero lento.

## 10. Cola inmediata, en orden

1. ~~Integrar PR #50 (sincroniza `ESTADO.md`, `CLAUDE.md`, `AGENTS.md`, guía de git) y PR #52 (bloque 2 de Antigravity, T-017)~~ **Hecho el 2026-10-26.** Cola abierta: #37 (diseño de IA, debe alinearse con el ADR-0017), #29 (cifrado, espera el «sí» del propietario) y Dependabot #11–#13.
2. **Aplicar M1 y M2 a Neon** (`pnpm db:migrate:deploy`), luego `pnpm db:seed`, `identidad:sembrar-dev` con `IDENTIDAD_DEV_PERMITIR_REMOTO=si`, y
   `canal:registrar-prueba` con `CANAL_PRUEBA_PERMITIR_REMOTO=si`.
3. **Verificar en navegador** el recorrido real: ingreso, catálogo, cotizador de excursiones, con capturas.
4. Redis local (Memurai) o despliegue en Render con Redis para ver mensajes de WhatsApp como conversaciones; probar el envío real con el token de Meta.
5. Revisar con `auditor-seguridad` el ADR-0018 y alinear el diseño de IA (#37) con el ADR-0017; luego lanzar las tareas T-032..T-050 a los carriles
   (migraciones M3 siguen bloqueadas hasta aplicar las correcciones de seguridad S1 y S2).
6. Reponer la cola de Antigravity (menos de 3 tareas libres = avisar) y traducir el roadmap v3 a tareas por carril.
7. Cerrar el túnel de Meta al terminar las pruebas; borrar las carpetas residuales y el clon `CRM-ciclo`.
8. El propietario: iniciar la **verificación del negocio** en Meta (camino crítico, semanas), decidir razón social, y la decisión del **PR #29**.

## 11. Cómo retomar en una sesión nueva

1. Leer este archivo, luego `ESTADO.md`, `roadmap/tasks.yaml` y `docs/08-roadmap/02-roadmap-producto-v3.md`.
2. `git fetch origin && git status && node scripts/estado-de-arboles.mjs`; `gh pr list --state open`.
3. Comprobar qué corre: `http://localhost:3333/api/v1/salud/listo` (401 sin sesión es normal), `http://localhost:3000`, el túnel.
4. Reanudar agentes con `SendMessage` en lugar de crear nuevos (economía de tokens). Actualizar este archivo al cerrar.

## 12. Trabajo desatendido (2026-10-27) y estado de la tanda

**Límites con los que se trabaja mientras el propietario está ausente:** no se toca Meta, pagos ni nada con costo o que salga a internet; no se integra el
PR #29 (cifrado, migración irreversible); no hay decisiones de negocio; todo va en PRs con los 8 checks en verde; si algo falla dos veces se anota y no se insiste;
el túnel de Meta está **cerrado** (reabrir solo con el propietario presente).

**Datos de la agencia prospecto JD Tours** (`jdtourscartagena.com`): viven FUERA del repo público, en `D:\Projects\_datos\jd-tours-cartagena.json`
(catálogo, con cargos en destino con monto tomados de sus flyers) y `D:\Projects\_datosotos-jd-tours\` (logo y fotos). Copia servida en desarrollo desde
`apps/web/public/_local/jd-tours/` (**ignorada por git**, PR #59). Las fotos con personas identificables NO se usan en pantalla. No hay permiso escrito de JD Tours
para publicar sus activos: la demo es privada y local; pedir su visto bueno antes de mostrarla a terceros o ponerla en internet.

**Tanda cerrada hoy (PRs integrados):** guardia de Neon (#40), canal de prueba (#46), bloques 1 y 2 de Antigravity (#47, #52), script de sincronía (#49), roadmap v3 e
investigación de HubSpot (#43, #41), documentación del hilo (#50), contexto (#54), arreglo de la CSP en desarrollo (#55), identidad visual y marca por agencia (#56, #57),
cargador de agencias (#58), ignorar activos locales (#59), backlog del catálogo importado (#60), diseño de IA alineado (#61), arreglo del envío duplicado de WhatsApp (#62),
T-041 contrato de propuesta de catálogo (#63), tareas de la auditoría del envío (#64), estabilización del deadlock de tests de `database` (#65: `fileParallelism: false`).

**Cadena del catálogo (ADR-0017), tareas en `roadmap/tasks.yaml`:** T-040 y T-048 (M1, M2) y T-041 hechas; **T-042 en curso** (aplicador transaccional con auditoría); detrás
T-043 a T-047 (vigencias y tarifas por id, listado de gestión con «desde», importación previsualizar y confirmar, historial de precios), T-049, T-050 (`promo_vencida`), T-051.
Siguen **bloqueadas** T-052, T-053 (M3: rol `viajapro_claves`, claves de API), T-058 y la IA, hasta aplicar las correcciones de seguridad S1 y S2 del auditor. Las tareas de web
que esperan esta API (gestión del catálogo, importador, plantillas, `promo_vencida`) son T-028 a T-031 de la cola de Antigravity.

**Cola de calidad y seguridad registrada:** T-059 (carrera tras trabajo estancado en el envío), T-060 (credencial de prueba de WhatsApp atada al tenant), T-061 (higiene del texto y
límite por agencia); T-002 (límite de tasa general). Pendiente de tarea: CSP con **nonce** para producción (hoy `script-src 'self'` sin nonce rompería el arranque de Next en producción:
**bloqueante antes de desplegar**), valores de relleno reales en el formulario de ingreso (defecto de la pantalla de Antigravity, cubierto por T-033), el `ADR-0016` que no refleja que el ciclo está detenido.

**Prioridad dada a Antigravity (el propietario pega el mensaje):** T-032 y T-033 (identidad visual y login con héroe animado), luego T-034 a T-036, y después la cola sin detenerse. Si
una tarea está bloqueada la salta. Su prompt actualizado está en `docs/09-ia/08-prompt-antigravity.md`.

**Qué hacer al volver el propietario:** (1) pasar a Antigravity el mensaje de prioridad; (2) entrar a `http://localhost:3000/ingresar` con `dueno-jdtours@agenciademo.test` y revisar el catálogo de
JD Tours; (3) Redis (Memurai) o despliegue para ver conversaciones de WhatsApp; (4) iniciar la verificación del negocio en Meta; (5) decidir el PR #29; (6) pedir a JD Tours las fotos y su permiso.

## 13. Reanudar tras el apagado del equipo (2026-10-26, 22:00)

El propietario apagó el PC a las 22:00 (apagado programado con `shutdown /s`; se cancela con `shutdown /a`). **Al encender, no corre nada**: ni la API, ni la web, ni el túnel, ni los bucles de integración,
ni los agentes. Lo que está en GitHub (PRs, ramas, `main`) y en Neon sigue intacto. Lo que no estuviera empujado a una rama se perdió: revisar `gh pr list` y las ramas `a/T-0xx`, `b/T-0xx`.

Para volver a levantar el entorno de desarrollo, desde `D:\Projects\CRM` (rama `main`, `git pull` antes):

1. `pnpm install --frozen-lockfile`, luego `pnpm exec turbo run build --force --filter=@viajapro/contracts --filter=@viajapro/domain --filter=@viajapro/database` (sin esto, falsos rojos por `dist` viejo).
2. API: `pnpm --filter @viajapro/api dev` (log útil: redirigir a un fichero). Debe decir `Conectado como 'viajapro_app'` y `'viajapro_identidad'`. Escucha en `http://localhost:3333`.
3. Web: `NEXT_PUBLIC_API_URL=http://localhost:3333 NEXT_PUBLIC_USE_REAL_AUTH=true pnpm --filter @viajapro/web dev` (en PowerShell: `$env:NEXT_PUBLIC_API_URL=...; $env:NEXT_PUBLIC_USE_REAL_AUTH='true'`). Escucha en `http://localhost:3000`. Entrada: `/ingresar`.
4. Túnel de Meta (solo si se va a probar WhatsApp, con el propietario presente): `D:\Projects\_tools\cloudflared\cloudflared-windows-amd64.exe tunnel --url http://localhost:3333`; la URL cambia y hay que repegarla en el webhook de Meta (`<url>/webhooks/whatsapp`, sin `/api/v1`). El token temporal de Meta dura 24 h: puede estar vencido.
5. Redis sigue sin existir: con `COLA_CHANGES=inerte` los mensajes recibidos se guardan pero no se procesan.
6. Comprobar el estado: `node scripts/estado-de-arboles.mjs` y `gh pr list --state open`, y retomar la cadena del catálogo desde la siguiente tarea libre de `roadmap/tasks.yaml` (T-042 en curso al apagar; T-043 en adelante).

