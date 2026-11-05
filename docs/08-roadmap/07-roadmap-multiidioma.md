# Roadmap de multiidioma

| | |
|---|---|
| Fecha | 2026-11-04 |
| Autor | `arquitecto`, a pedido del propietario |
| Base verificada | `main` local del checkout principal (último commit `b165f92`, PR #222), solo lectura. La carga de tareas y el alcance se hicieron después sobre `origin/main` |
| Decisión | [ADR-0020](../03-adr/0020-multiidioma-interfaz-viajero-catalogo-y-plantillas.md) |
| Tareas | `roadmap/tasks.yaml`: M1 a M21 de este documento son T-152 a T-172 (T-131 a T-151 son de reportes). Correspondencia en la tabla de abajo |
| Correspondencia | M1=T-152, M2=T-153, M3=T-154, M4=T-155, M5=T-156, M6=T-157, M7=T-158, M8=T-159, M9=T-160, M10=T-161, M11=T-162, M12=T-163, M14=T-164, M15=T-165, M13=T-166, M16=T-167, M17=T-168, M18=T-169, M19=T-170, M20=T-171, M21=T-172 |
| Estado vivo | `ESTADO.md` y `roadmap/tasks.yaml` mandan sobre este documento |

## 0. Resumen

El producto pasa a ser multiidioma en esta versión: **español de Colombia (fuente), inglés de EE. UU.
y portugués de Brasil**. ADR-0020 separa cuatro capas —interfaz, contenido de cara al viajero,
catálogo y plantillas de WhatsApp— y las ordena en tres entregables:

| Entregable | Qué ve la agencia | Días de agente |
|---|---|---|
| **E1** | La interfaz entera en inglés y portugués; la cotización por WhatsApp y la vista imprimible en el idioma del contacto | ~22 |
| **E2** | Su catálogo traducido (pantalla e importación) y usado en las cotizaciones | ~6 |
| **E3** | Plantillas de WhatsApp elegidas por idioma con caída visible; sugerencia del idioma del contacto | ~3,5 |
| | **Total** | **~31** |

El 45 % de E1 es extracción mecánica de textos. Es el riesgo de calendario y también el de
conflictos con Antigravity, que escribe frontend en paralelo.

## 1. Orden y dependencias

```
M1 glosario ─────────────────────────────────────┐
M2 migración M-i1 ─┬─ M4 API idiomas ─┬─ M6 infra web ─┬─ M7..M11 extracción ─ M12 traducción ─ M13 qa E1
M3 packages/i18n ──┴──────────────────┤                 │
                                      └─ M5 texto WhatsApp por idioma ─ M14 modal envío ─┘
                                                         └─ M15 imprimible por idioma
M16 migración M-i2 ─ M17 API traducciones ─ M18 pantalla + importación ─ M19 qa E2
M20 elegirPlantilla (API) ─ M21 selector + sugerencia de idioma (web)
```

## 2. Tareas

Esfuerzo en días de agente. «Ruta protegida» = espera aprobación del propietario (R11).

### E1 — Interfaz y cotización en el idioma del contacto

| # | Tarea | Dueño | Días | Depende de |
|---|---|---|---|---|
| M1 | Glosario por idioma en `02-lenguaje-ubicuo.md` (ADR-0020 §7): validar la propuesta, decidir términos dudosos (Cotización/Orçamento, Tarifa neta/net) | `experto-turismo` | 0,5 | — |
| M2 | Migración M-i1: `tenants.idioma`, `tenants.idioma_de_contenido`, `usuarios.idioma`, `contactos.idioma`, `mensajes.idioma` con `CHECK` de forma. **Ruta protegida**; pasa por `auditor-seguridad` | `datos` | 0,5 | — |
| M3 | Paquete `packages/i18n` sin dependencias: `IDIOMAS_SOPORTADOS`, `t`, plural, interpolación, formato de dinero (con `MONEDAS`) y fecha por idioma, diccionario `viajero.*` en tres idiomas, equivalencia con códigos de Meta. **`package.json` y `pnpm-workspace.yaml` los toca una persona** | `backend` | 1,5 | M1 (para `viajero.*`) |
| M4 | API: `Idioma` en contratos; `idioma` en sesión (resuelto), `PATCH` de preferencia del usuario, `idioma` en contrato y `PATCH` de contacto, `idioma` e `idioma_de_contenido` en el contrato de ajustes de agencia (coordinar con `a/T-000-api-ajustes-agencia`); 409 `CATALOGO_NO_VACIO` | `backend` | 1 | M2 |
| M5 | Texto de cotización por WhatsApp en el idioma pedido (`textoDeCotizacionParaWhatsapp` con `idioma`), `idioma` en el cuerpo de envío, `mensajes.idioma`, clave de idempotencia con idioma solo si difiere del base | `backend` | 1 | M3, M4 |
| M6 | Infraestructura web: `apps/web/src/i18n/`, diccionario fuente, `useT`/`obtenerT`, proveedor en `layout.tsx`, cookie `vp_idioma`, `<html lang>`, `formato.ts` con `idioma`, selector en el perfil, pruebas de completitud, trinquete de literales, pseudolocale `es-XA` | `frontend` | 1,5 | M3, M4 |
| M7 | Extracción: navegación, `barra-modulos`, auth, aceptar invitación, onboarding, errores, comunes | `frontend` | 1,5 | M6 |
| M8 | Extracción: bandeja y sus componentes | `frontend` | 2 | M6 |
| M9 | Extracción: cotizador, cotizaciones, comparador de versiones | `frontend` | 2 | M6 |
| M10 | Extracción: catálogo e importación | `frontend` | 2 | M6 |
| M11 | Extracción: inicio, contactos, pipeline, seguimientos, reportes, notificaciones, configuración, aviso en páginas legales | `frontend` | 2,5 | M6 |
| M12 | Traducción `en-US` y `pt-BR` de todos los diccionarios con el glosario; revisión de términos por `experto-turismo` | `frontend` + `experto-turismo` | 2 | M1, M7-M11 |
| M14 | Modal de envío de cotización: selector de idioma (preseleccionado el del contacto), «recordar para este contacto» | `frontend` | 0,5 | M5, M6 |
| M15 | Vista imprimible en el idioma pedido (`?idioma=`, por defecto el del contacto) con `viajero.*`; plurales correctos; bloque legal en español con aviso | `frontend` | 1 | M3, M6 |
| M13 | QA de E1: recorrido por las rutas principales en `en-US` y `pt-BR` sin cadenas de la fuente; `revision-375px` con `pt-BR` y `es-XA`; envío de cotización en inglés de punta a punta | `qa` | 1 | M12, M14, M15 |
| | **Subtotal E1** | | **~22** | |

### E2 — Catálogo traducido

| # | Tarea | Dueño | Días | Depende de |
|---|---|---|---|---|
| M16 | Migración M-i2: `traducciones_paquete`, `traducciones_opcion_de_salida`, `traducciones_tarifa` con foráneas compuestas y `CASCADE`. **Ruta protegida**; `auditor-seguridad` | `datos` | 1 | M2 |
| M17 | API: `resolverTextoDeCatalogo` (caída por campo), CRUD de traducciones bajo `catalogo.administrar`, `traducciones` opcional en `PropuestaDeCatalogo` aplicado por el núcleo, columnas `campo@idioma` en el descriptor; el texto de WhatsApp usa las traducciones y devuelve los campos caídos | `backend` | 2,5 | M16, M5 |
| M18 | Web: pestaña «Traducciones» en la ficha del paquete; columnas `@idioma` en la importación; aviso de campos caídos en el modal de envío | `frontend` | 2 | M17 |
| M19 | QA de E2: aislamiento A/B de traducciones (e2e), importación con columnas `@en-US` idempotente, caída por campo | `qa` | 0,5 | M18 |
| | **Subtotal E2** | | **~6** | |

### E3 — Plantillas por idioma y sugerencia de idioma

| # | Tarea | Dueño | Días | Depende de |
|---|---|---|---|---|
| M20 | `elegirPlantilla` pura en `inbox/domain` con pruebas; 409 `PLANTILLA_SIN_IDIOMA` con los idiomas disponibles; revisión de códigos de Meta por `whatsapp`. Se integra al envío de plantillas cuando ese envío exista | `backend` + `whatsapp` | 1,5 | M3 |
| M21 | Web: selector de plantillas agrupado por nombre con estado por idioma y caída explícita; sugerencia de idioma del contacto (detector de palabras frecuentes en el navegador + prefijo) con «Fijar» | `frontend` | 2 | M20, M6 |
| | **Subtotal E3** | | **~3,5** | |

## 3. Riesgos

| Riesgo | Mitigación |
|---|---|
| Traducciones de máquina de baja calidad en documentos que firma la agencia | Glosario validado antes (M1); `experto-turismo` revisa términos; **revisión nativa de `pt-BR` y `en-US` es decisión de presupuesto del propietario** |
| Texto que crece y rompe la interfaz | La fuente es español, que suele ser más largo que el inglés; `pt-BR` es parecido. Pseudolocale `es-XA` (+40 %) y `revision-375px` por idioma |
| Conflictos de fusión con Antigravity en la extracción | Extracción por áreas (M7-M11), coordinada con la cola T-016…T-031; el trinquete impide que lo nuevo nazca con literales |
| Plantillas sin aprobar en un idioma | Caída explícita con un clic (manual) o al idioma de la agencia registrada (automático); estado por idioma visible |
| La API de ajustes de agencia se integra con otro contrato | M4 añade los dos campos donde esté; coordinar con la rama `a/T-000-api-ajustes-agencia` |
| Detector de idioma equivocado | Solo sugiere; escribe una persona |

## 4. Lo que no está en este roadmap

Ver ADR-0020 §10: variantes regionales, traducción legal, IA para traducir el catálogo, idiomas
adicionales, RTL, correos al viajero (no existen aún).
