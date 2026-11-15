# Auditoría integral — 2026-11-15

**Perímetro:** completa. HEAD `c4cf6bb` = `origin/main` (`762fb42`) + PR #256. 1278 ficheros versionados, 21 ADR.
**Dimensiones:** seguridad y cumplimiento, calidad y arquitectura, dominio del turismo, pruebas,
operación, veracidad documental, inteligencia de negocio (7 agentes en paralelo).
**Comparada con:** `2026-10-20-auditoria-integral.md`.
**Hallazgos vigentes:** 3 críticos, 17 altos, 24 medios, 7 bajos. Cerrados en esta sesión: 3.

## Veredicto

**No se puede poner frente a clientes hoy.** El aislamiento entre agencias es sólido por lectura
(RLS forzada, roles que abortan, tenant desde la sesión), pero no se ejecutó en esta auditoría. Lo
que impide la demo a JD Tours no es la seguridad sino el producto:
- El cotizador no puede cotizar una familia con niños en un producto con noche.
- La bandeja guarda los valores multiplicados por 100.
- La cotización impresa sale con el NIT de una agencia inventada.
- Las cifras del SLA y del pipeline engañan.

## Verificación

Cada hallazgo marcado **CONFIRMADO\*** lo reprodujo o leyó en el código el auditor principal además
del agente. El resto lo confirmó el agente con lectura de código o comando; los **PLAUSIBLE** no se
reprodujeron.

## Hallazgos

### Críticos

| # | Hallazgo | Dónde | Escenario | Corrección | Dueño | Verif. |
|---|---|---|---|---|---|---|
| C1 | Las familias con niños no se pueden cotizar en productos con noche | `quoting/domain/seleccion-de-tarifas.ts:104-113`, `cotizar-salida.use-case.ts:287-289` | 2 adultos + niño de 7 años en «Puebleando»: 422 `TARIFAS_CON_CONDICION_NO_EVALUABLE`. Toda tarifa de menor lleva rango de edad | Pedir la edad de cada niño e infante en el contrato `CotizarSalida` y evaluar el rango y si ocupa silla | backend + frontend | CONFIRMADO\* |
| C2 | El cotizador suma todas las acomodaciones | `cotizar-salida.use-case.ts:255-283` (lee `acomodacion` en :179, no filtra) | Pareja en DOBLE de San Andrés: total 13.300.000 en vez de 3.180.000 en cuanto se importe un tarifario de hotel | Filtrar por `peticion.acomodacion` y exigirla cuando la tarifa la trae | backend | CONFIRMADO\* |
| C3 | Sin observabilidad ni alertas (antes de producción) | Sin pino ni OpenTelemetry en `apps/`; `docs/06-operacion/04-runbooks.md` vacío | Se cae el trabajador o crece una cola y nadie se entera | Pino con `tenant_id`/`trace_id`, monitor externo sobre `/salud/listo`, alerta de antigüedad de cola, un runbook por alerta | devops | CONFIRMADO |

### Altos

| # | Hallazgo | Dónde | Corrección | Dueño | Verif. |
|---|---|---|---|---|---|
| A1 | Atajo de desarrollo `x-dev-tenant-id` con todos los permisos, expuesto a internet en Codespaces (puerto 3333 público y `APP_ENV=local`). El UUID del tenant demo es público | `scripts/dev-nube.mjs:124`, `apps/api/src/shared/tenant/tenant.middleware.ts:121-133` | Exigir conexión de loopback sin `X-Forwarded-For`; `APP_ENV=dev` en Codespaces; corregir `docs/07-ingenieria/desarrollo-en-la-nube.md` | devops + backend | CONFIRMADO\* |
| A2 | **Reincidente desde 2026-10-20.** PII en claro y lectura sin auditar (R10): `mensajes.texto`, `contactos.preferencias` | `schema.prisma:1751, 1172`; ADR-0015 sin implementar | Implementar ADR-0015. Bloquea el piloto | datos + backend | CONFIRMADO |
| A3 | La bandeja guarda el valor de la oportunidad ×100 en COP (R8) y la tarjeta y el modal de cotización dividen entre 100 al mostrar | `components/bandeja/modal-crear-oportunidad.tsx:52`; `tarjeta-cotizacion.tsx:26`; `modal-enviar-cotizacion.tsx:28,175`; `ficha-cliente.tsx:156,244` | Usar `formatearDinero` y el mismo parseo que el modal de contactos | frontend | CONFIRMADO\* |
| A4 | Datos inventados en modo real: la tarjeta fija «Cancún Todo Incluido» en la bandeja, y la cotización impresa con el NIT y la razón social de `MOCK_CONFIGURACION_AGENCIA` | `app/bandeja/[id]/page.tsx:1018-1026`; `app/cotizaciones/[id]/imprimir/page.tsx:44,362-369,542` | Leer la cotización real y los datos de `GET /agencia/ajustes`; omitir lo que no exista. Falta el RNT en `Tenant` (verificar normativa) | frontend + datos | CONFIRMADO\* |
| A5 | El tablero del pipeline suma monedas distintas y etiqueta el total como COP | `crm/infrastructure/crm.prisma.ts:88-93`, `crm/application/ver-tablero.ts:59-62` | Agrupar por `etapaId, monedaIso`, o rechazar monedas distintas de la del tenant | backend | CONFIRMADO\* |
| A6 | El SLA de la bandeja nunca se activa con datos reales: `sla_vence_en` solo lo escribe el seed | `inbox/infrastructure/mapeo.ts:83`, `conversaciones.prisma.ts:137` | Fijarlo al recibir el primer entrante sin respuesta | backend + whatsapp | CONFIRMADO\* |
| A7 | «Ventas del período» cuenta por fecha de envío, no de aceptación: los meses cerrados cambian después | `quoting/infrastructure/cotizaciones-para-reportes.prisma.ts:88` | Agrupar por el cambio a `ACEPTADA` en `cotizacion_cambios_estado` | backend | CONFIRMADO |
| A8 | Tasas de conversión sin n mínimo: con 1 ganada y 0 perdidas muestra 100 %, y el nombre no es lo que mide | `analytics/domain/resumen.ts:85,93` | «n insuficiente» por debajo de un mínimo; renombrar a «Tasa de victoria» | backend + frontend | CONFIRMADO |
| A9 | Los paquetes con hotel de la semilla viven en el modelo muerto Temporada/Precio, que el cotizador no lee | `schema.prisma:764-824` frente a `848-942`; `seed.ts:146-370` | Migrar la semilla a vigencias y tarifas; retirar el modelo viejo con ADR | datos | CONFIRMADO |
| A10 | «Deploy staging» en verde sin desplegar nada cuando faltan secretos | `.github/workflows/deploy-staging.yml` (pasos condicionados a `listo`; hooks vacíos solo avisan) | Fallar o publicar un estado «omitido» | devops | CONFIRMADO\* |
| A11 | `pnpm dev` en un clon nuevo: la web responde 500 porque `dev` no construye `contracts` y `domain` | `turbo.json:11-14` | `"dependsOn": ["^build"]` en `dev`, o un paso de preparación en `dev-nube` | devops | CONFIRMADO\* (reproducido) |
| A12 | El trabajador no arranca en desarrollo y en Render no tiene sonda: muere en silencio | `apps/api/package.json:12`, `render.yaml:104-123` | Añadirlo a `dev:nube`; heartbeat vigilado | devops + backend | CONFIRMADO |
| A13 | Sin respaldo documentado ni restauración probada (RPO/RTO) | `docs/06-operacion/` | Fijar plan y retención en Neon; ensayar la restauración antes de la primera agencia | devops | CONFIRMADO |
| A14 | Ninguna e2e valida las respuestas de bandeja, reportes y cotización guardada contra su esquema Zod. Las que sí validan: identidad, CRM, catálogo, importaciones | `reportes.e2e-spec.ts:110` (cast), entre otras | `Esquema.parse(await r.json())` en cada endpoint que consume la web | qa + backend | CONFIRMADO\* (más acotado que lo reportado) |
| A15 | Ninguna prueba de navegador: el flujo H1–H6 no tiene red | `apps/web` usa happy-dom; no hay Playwright | E2E mínima: login → bandeja → webhook firmado → cotizar → enviar | qa + frontend | CONFIRMADO\* |
| A16 | `ESTADO.md` (2026-11-04) describe otro repositorio: #191, #200, #211 y #220 integrados pero presentados como diseño; el margen de reportes ya es real; `/crm/etapas` existe; Antigravity | `ESTADO.md` §1; `CLAUDE.md` §1, §5, §8 | Reescribir la matriz de capacidades. `CLAUDE.md` es ruta protegida | documentador | CONFIRMADO\* |
| A17 | Tras ACEPTADA no hay continuación: ni reserva con time limit, ni archivo de viaje, ni pagos, ni TRM congelada | `estado-de-cotizacion.ts:15-21`; `schema.prisma:612` (`diasTimeLimit` sin uso) | Historia en la cola: reserva con time limit y TRM en la versión | dueño de producto + arquitecto | CONFIRMADO |

### Medios

| # | Hallazgo | Dueño |
|---|---|---|
| M1 | «Enviar plantilla» manda texto libre; el error 409 de ventana cerrada se traga, igual que en «tomar» y «soltar» (`app/bandeja/[id]/page.tsx:554,578,747-786`) | frontend + whatsapp |
| M2 | Reasignar solo ofrece los asesores de maqueta (`modal-reasignar.tsx:5,120`) | frontend + arquitecto |
| M3 | Sin derechos del titular ni retención (Ley 1581; T-097 `blocked`) | backend + propietario |
| M4 | El CRM no tiene pruebas HTTP entre agencias para las mutaciones de contactos, seguimientos y oportunidades | qa |
| M5 | Ventana de 24 h implementada dos veces (web y API) sin prueba cruzada | frontend + whatsapp |
| M6 | Las pruebas de Redis usan `skipIf` sin candado `EXIGIR`: pueden desaparecer y el CI seguir verde | qa + devops |
| M7 | Sin casos de dinero borde en el cotizador: venta < neto, infante sin adulto, COP/USD mezclados | qa |
| M8 | El cálculo del cotizador suma tarifas de distinta moneda; solo falla al guardar (`cotizar-salida.use-case.ts:292-295`) | backend |
| M9 | El infante se cobra como adulto con una tarifa sin tipo de pasajero (`seleccion-de-tarifas.ts:82-83`) — PLAUSIBLE como regla del sector | backend |
| M10 | La comisión está modelada como base del margen y no como ingreso aparte (`schema.prisma:957-959`) | arquitecto + datos |
| M11 | Las cotizaciones no vencen por fecha, VENCIDA es terminal, y ACEPTADA no mueve la oportunidad — PLAUSIBLE | backend |
| M12 | Primera respuesta: numerador y denominador de grupos distintos («12 de 5»), sesgo de supervivencia, sin p90 | backend |
| M13 | «Margen Real» es margen cotizado y «Ventas» son aceptaciones, no cobros | frontend + dueño de producto |
| M14 | «Oportunidades por etapa» es una foto, no conversión; el pipeline acumula Ganada y Perdida de siempre | backend |
| M15 | Sin `pnpm audit`, SAST ni escaneo de imágenes en el CI | devops |
| M16 | Acciones de GitHub con tags móviles en `ownership`, `cerrar-tarea` y `mantener-ramas`; Dependabot #11, #13 y #255 abiertos | devops |
| M17 | Imagen del devcontainer y servicios de `infra/docker` sin fijar (dev 22.23 frente a prod 22.20) | devops |
| M18 | Nada verifica «expandir y luego contraer» en las migraciones — PLAUSIBLE | devops + datos |
| M19 | Costo por tenant no calculado; el costo base no está escrito | analista-datos + devops |
| M20 | ADR-0018 y ADR-0019 siguen en «Propuesto» aunque están implementados | arquitecto |
| M21 | Cifras desactualizadas: tareas `done` (94, no 86), pruebas de la API (1325, no 965), ruta de migraciones en `CLAUDE.md` | documentador |
| M22 | T-079 figura `done` sin Redis ni trabajador en staging | dueño de producto |
| M23 | PR #29 es solo de documentación; el cifrado no tiene PR | datos |
| M24 | Guardar etapas del pipeline con varios PATCH seguidos deja estados a medias sin decir cuáles (`crm-api.ts:379-399`) | frontend |

### Bajos

`POST /conversaciones/:id/leida` sin permiso (`conversaciones.controller.ts:133`) · `MotivoPerdida` como
enum (R12) · «Nuevo Lead» frente al lenguaje ubicuo · columna vacía del pipeline pintada como «$0» ·
costo neto y ventas con bases distintas en reportes · sin runbook de rotación de `BETTER_AUTH_SECRET`,
`META_APP_SECRET` y `ENCRYPTION_MASTER_KEY` · aserciones débiles (`toBeDefined`) en specs de la web.

## Cerrados en esta sesión (PR #256)

| Hallazgo | Corrección | Verificación |
|---|---|---|
| H-3: error de hidratación en todas las páginas (nonce) | `suppressHydrationWarning` en el script anti-FOUC | Chromium: consola limpia |
| H-4: `/login` daba 404 | Alias hacia `/ingresar` que conserva la consulta | Chromium y pruebas |
| Redirección abierta en `redirigir` (`/\evil.com`, `/<TAB>/evil.com`, `/.//evil.com`, `/a/..//evil.com`) | `rutaInternaSegura`: rechaza `\` y caracteres de control, exige mismo origen, rechaza el pathname `//` | 13 vectores en `errores-sistema.spec.ts` |

## Qué se revisó y salió limpio

- **Seguridad:**
  - Política RLS canónica con ENABLE, FORCE, USING y WITH CHECK; excepciones en datos; los roles abortan si pueden saltarse RLS (por lectura, sin ejecutar).
  - El tenant siempre sale de la sesión; los esquemas `.strict()` rechazan un `tenantId` en el cuerpo.
  - Webhook con HMAC en tiempo constante y límite de 1 MB.
  - Cookies HttpOnly, Secure y SameSite con chequeo de Origin; OTP con hash y límites.
  - CSP con nonce; ningún secreto en el árbol ni en el historial.
- **Arquitectura:** ningún import entre módulos (R4); `domain/` sin frameworks; sin `any` ni `@ts-ignore` en producción; las 56 rutas que llama la web existen en la API; sin N+1 en la bandeja.
- **Dominio:**
  - `Money` con bigint, 0 decimales en COP y redondeo entero.
  - Margen sobre el neto o sobre la venta bien calculado.
  - Resolución de vigencias y composición de pasajeros correctas.
  - Versiones inmutables; el texto enviado no lleva neto ni margen; consentimiento probado; código ESCNNA impreso.
- **Inteligencia de negocio:** el margen sale de la base y lo protege un permiso; ventas separadas por moneda; periodos en la zona de la agencia; denominador 0 da «sin datos».
- **Pruebas:** el CI corre web, API, contracts, domain y database; sin `.only`; idempotencia del webhook y del envío probada; aislamiento probado en cotizaciones, reportes, catálogo e invitaciones.
- **Operación:** deploy-staging solo despliega desde `main` verde y SHA ancestro; acciones fijadas por SHA en `ci.yml`; Dockerfile con Node 22.20 y usuario sin privilegios; `render.yaml` sin secretos.

## Comparación con 2026-10-20

- **Cerrados:** `/salud/listo` responde 503 cuando está degradado; permisos en controladores (#191); retirada la ruta antigua de cotizar.
- **Reincidente:** PII en claro (A2). Señal de proceso: el ADR-0015 está aceptado desde hace semanas sin dueño activo.
- **Nuevos:** C1 (consecuencia del arreglo del 20-10, que cambió un total incorrecto por un bloqueo), A1, A3 a A8.

## Deuda aceptada conscientemente

| Deuda | Por qué se acepta | Cuándo se revisa |
|---|---|---|
| C3 observabilidad, A13 respaldo | No hay agencia real ni despliegue vivo | Antes de la primera agencia (criterios C1–C5) |
| A2 cifrado de PII, M3 derechos del titular | No hay datos reales de viajeros | Bloquean el piloto; revisión externa de RLS antes |
| A17 reserva, pagos, TRM | Fuera del congelamiento H1–H6 | Tras la demo a JD Tours |

## Orden propuesto

1. **Antes de la demo:** C1, A3, A4, A9 y la honestidad de cifras (A5, A6, A8, M13), o no enseñarlas.
2. **Ya, por seguridad:** A1, una línea en el middleware y otra en `dev-nube`.
3. **Para que la campaña H1–H6 avance:** A11, A12 y A15 (la e2e mínima), A14.
4. **Hilo:** A16 y M20 a M23 en un PR de documentación.
5. C2 antes de importar el primer tarifario de hotel.
