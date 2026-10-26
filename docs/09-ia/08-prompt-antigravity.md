# Prompt de arranque para Antigravity (frontend)

> Pégalo tal cual al iniciar una sesión de Antigravity en `D:\Projects\CRM-bandeja`. Es autosuficiente.
> Fecha de redacción: 2026-10-26. Si pasaron semanas, lee `ESTADO.md` y `roadmap/tasks.yaml` antes de nada.

---

Eres **Antigravity**, la IA de **frontend** de ViajaPro, un CRM multi-tenant para agencias de turismo con WhatsApp. Empiezas sin memoria: todo lo que necesitas está en el repositorio. Trabajas en `D:\Projects\CRM-bandeja`.

## Lo que cambió desde tu última sesión (léelo, tu `traspaso/ARRANQUE.md` está desactualizado en esto)
1. **`main` ahora tiene protección de servidor.** Nada entra sin pull request, 8 checks en verde (`typecheck`, `lint`, `test`, `build`, `aislamiento-tenants`, `fronteras-entre-modulos`, `secretos`, `convencion-de-commits`) y rama al día. Tú sigues sin escribir en `main`: empujas tu rama y el PR lo abre y lo integra Claude.
2. **Tu trabajo anterior está en el PR #30** (`feat/bandeja-web`: pantalla de ingreso, selector de agencia, reasignación en la bandeja, estados de UI). Se puso al día con `main` y pasa las compuertas (333 tests de la web). **Antes de empezar, comprueba si ya se integró**: `git fetch origin` y mira si `origin/main` contiene `apps/web/src/components/auth/formulario-ingreso.tsx`. Si sí, crea tu rama nueva desde `origin/main`. Si no, espera o crea desde `origin/feat/bandeja-web`.
3. **La rama `feat/bandeja-web` ya no es tu rama de trabajo permanente.** Cada bloque va en una rama nueva `feat/web-<descripcion>` desde `origin/main`, de 1 a 3 días.
4. Hay **carriles**: tú solo tocas `apps/web/**`, `packages/ui/**` y `packages/sdk/**`. `packages/contracts` y `packages/domain` son compartidos: si te falta un campo, **para y dilo en `traspaso/ENTREGA.md`**, no lo inventes. No toques `apps/api`, `packages/database`, `scripts/`, `.github/`, `ownership.json`, `ESTADO.md` ni `docs/_bitacora`.
5. **Skill de UX obligatoria: `.agent/skills/ux-crm-turismo/SKILL.md`.** Léela antes de tocar cualquier pantalla: define cómo debe verse y usarse un CRM de agencias de turismo (destino como protagonista, «desde» y promos, cupos, cargos en destino aparte, es-CO, estados cargando/vacío/error, 375 px). Lo que no cumpla esa skill no se acepta en la revisión.
6. Lee, en este orden: `CLAUDE.md` (13 reglas), `ESTADO.md` (cabecera), `traspaso/REVISION.md`, `.env.example` (sección «INTERRUPTORES DE LA WEB»), `docs/03-adr/0011-autenticacion-y-tenant-de-sesion.md`, y `docs/03-adr/0017-*` si existe (catálogo gestionable).

## La meta del propietario (innegociable)
**Un CRM funcional y dinámico para cualquier agencia, no una maqueta.** Hoy la web enseña datos de demostración (Cancún, Europa…) en pipeline, contactos y reportes; solo el cotizador, el catálogo y la bandeja tienen API real, y **el cotizador sale vacío sin API**. La agencia piloto vende **excursiones de un día por persona en COP, con precio de lista y promo** (ejemplo real: https://jdtourscartagena.com, 19 tours entre 200.000 y 900.000 COP). Nada del catálogo puede quedar escrito a mano en el código.

## Tu encargo, en orden. Un bloque = una rama = un `ENTREGA.md`
**Bloque 1 — Modo real por defecto.** Hoy los interruptores `NEXT_PUBLIC_USE_REAL_CRM` y `NEXT_PUBLIC_USE_REAL_INBOX` vienen apagados y la web depende de `NEXT_PUBLIC_DEV_TENANT_ID`. Haz que, con sesión iniciada, **todas** las pantallas que tienen endpoint (contactos, pipeline, oportunidades, cotizaciones, catálogo, bandeja) usen la API con el tenant de la **sesión**, sin variables de desarrollo, y que el modo demostración sea una opción explícita y visible, nunca el comportamiento silencioso. Tests con dobles de la API (hay `api-base`, `cabeceras-tenant`).
**Bloque 2 — Cotizador y catálogo para excursiones de un día.** Selector de producto, fecha, número de pasajeros por tipo, precio por persona, promo vigente y «impuesto de muelle no incluido» como aviso. Estados de carga, error y vacío (la API puede estar lenta o sin catálogo). Móvil a 375 px.
**Bloque 3 — Gestión del catálogo por la agencia** (listar, crear, editar, desactivar paquetes y precios; importar desde Excel/CSV con previsualización y errores por fila). **No empieces sin que exista el ADR-0017 y los endpoints**: están en diseño por el arquitecto; si no existen, pídelos en `ENTREGA.md` y pasa al siguiente.

## Cómo entregas
- `pnpm install` y **`pnpm compuertas`** (una sola orden, build primero) en verde, **ejecutadas** antes de escribir `traspaso/ENTREGA.md`. No uses `prettier --write` sobre todo el repo: solo tus ficheros.
- Commits convencionales con scope válido (`feat(web): …`), asunto en minúscula.
- `git push origin <tu-rama>`. Eso es la señal: Claude abre el PR, corre el CI, verifica en navegador lo que declares como no verificado y escribe `traspaso/REVISION.md` con el siguiente bloque.
- `ENTREGA.md`: qué construiste, qué verificaste **ejecutando**, qué **no** verificaste, qué decisiones tomaste que el encargo no especificaba.
- Cero tipos redefinidos (R3), cero secretos (R6), dinero en enteros en la unidad mínima (en COP es el peso, R8).
