# 2026-11-15 — MVP en navegador y cierre de la auditoría

**Participantes:** agentes `backend`, `frontend`, `datos`, `qa`, `auditor-seguridad`, `integrador`,
`documentador`; el propietario fijó el modo de trabajo («intégralo cuando esté en verde y sigue»).
**Duración / alcance:** el día completo, desde la auditoría integral hasta el PR #269. Esta entrada
cubre los PR #266 a #269; los anteriores (#256, #263, #264) están en el
[DIARIO](../_contexto/DIARIO.md).

## Qué se hizo

- **PR #266 (`02d1e07`).** T-225: demo cifrada (`demo:sembrar-cifrada`). T-196: la suite de navegador
  llega al final del flujo: responder desde la bandeja y enviar una cotización por WhatsApp, contra una
  Graph API falsa (`apps/web/e2e/graph-falsa.mjs`). El texto enviado no lleva neto ni margen.
- **PR #267 (`8b4c070`).** T-220: dependencias (overrides; vitest 2 a 4, vite 6, happy-dom 21). El
  `audit` de producción baja de 3 críticas y 15 altas a 0 y 1; queda zod v3. T-224: simulador sobre
  vigencias, «Oportunidad nueva», banner de cookies. T-226 (a) y T-227 (`ContactoDeLista` sin
  preferencias). ADR-0022 y ADR-0025 aceptados. Hooks del cerebro: la parada bloquea si el checkpoint
  es más viejo que el último commit; el modo `hito` se activa tras merge, PR o push.
- **PR #268 (`46e88a6`).** T-223: función `SECURITY DEFINER` `medir_cola_de_salida`, con dueño
  `NOLOGIN` `viajapro_metricas`. T-214: tabla `motivos_de_perdida` por agencia, con RLS forzada y clave
  foránea compuesta. El `auditor-seguridad` la declaró integrable. Las migraciones corrieron en el CI
  (`aislamiento-tenants` y `compat-migraciones` en verde).
- **PR #269 (`5c6e247`).** Vista previa honesta del envío. Cotizador y catálogo consultan desde hoy,
  en la zona del tenant, y eligen la primera salida. El drawer de contactos carga la ficha con
  preferencias. T-228: `/salud/listo` público solo da el estado de cada cola. La semilla del catálogo
  real siembra una salida publicada futura por pasadía (primer sábado desde hoy + 7 días).

## Defectos reales que halló la suite de navegador

| Defecto | Por qué no lo veía nada más |
|---|---|
| La bandeja nunca ofrecía cotizaciones para enviar con la API real | La ficha de CRM las trae vacías, por R4 (los módulos no se importan). Con mocks siempre había cotizaciones. Ahora la bandeja las pide a `quoting` (`listarCotizacionesApi({contactoId})`) |
| El modal de guardado ignoraba título y contacto (cotización a nombre de otro cliente) | Las pruebas unitarias pasaban datos a mano; solo el recorrido completo mostró el contacto equivocado |
| Guardar con la API real usaba la acomodación de la maqueta | Igual: la maqueta y la API coinciden en pruebas aisladas |

## Decisiones tomadas

| Decisión | Razón | Dónde quedó registrada |
|---|---|---|
| ADR-0022 y ADR-0025 aceptados | El propietario autorizó aceptar los que no dependieran de una decisión suya | `docs/03-adr/` |
| ADR-0023 y ADR-0024 siguen propuestos | Dependen del propietario; las fuentes de la DIAN del 0023 no están verificadas | `docs/03-adr/`, ESTADO §3 |
| Motivos de pérdida por agencia, como tabla y no `enum` | R12: es política de negocio | PR #268, T-214 |
| Cola nueva: T-229 (API y UI de motivos), T-230 (endurecer función y disparador), T-231 (reflejar el rol `viajapro_metricas` en ADR-0008 y R2) | Hallazgos de la auditoría de seguridad que no bloquean (R13) | `roadmap/tasks.yaml` |

## Qué quedó pendiente

- [ ] Propietario: cargar `CAMPOS_SENSIBLES_KEY` y `CAMPOS_SENSIBLES_KEY_VERSION=1` en Render y guardar copia de la clave.
- [ ] Propietario: `STAGING_DESPLIEGUE=desactivado` mientras no haya secretos de staging.
- [ ] Propietario: Meta real (T-080) y un mensaje desde un celular.
- [ ] Propietario: decidir zod 4; decidir ADR-0023 y ADR-0024.
- [ ] T-229, T-230, T-231; T-214 y T-226 (b, c) siguen `in_progress`.
- [ ] Verificar las fuentes de la DIAN citadas en ADR-0023.

## Qué aprendimos

- **Vitest 4 rompió 40 e2e de la API.** Un `import(variable)` con ruta relativa se resuelve contra la
  raíz de Vite, no contra el archivo. Solución: `new URL(ruta, import.meta.url).href`.
- **Un saliente pasa a ENVIADO con el webhook de estado `sent`**, no con la respuesta de la Graph. La
  Graph falsa de las pruebas debe simularlo, o el flujo se queda en «en cola».
- **Desde el cifrado, la búsqueda de la bandeja solo mira nombre y teléfono**, y la semilla SQL no puede
  escribir texto: por eso existe `demo:sembrar-cifrada`.
- **Una frontera entre módulos (R4) esconde defectos a los mocks.** Si un dato cruza contextos, la
  prueba que cuenta es la que recorre ambos con la API real.
- **Postgres no arranca en las sesiones en la nube.** Migraciones, e2e y aislamiento solo se verifican
  en el CI; no afirmar que una migración funciona sin ver el check en verde.
- **Verificado frente a supuesto.** Verificado: los cuatro PR integrados y sus checks. Supuesto: nada
  está desplegado y WhatsApp solo se probó contra una Graph falsa; no se afirma más que eso.
