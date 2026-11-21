# Documentación de ViajaPro

Toda la documentación del proyecto. Si una decisión no está aquí (o en `ESTADO.md`), no existe.

> El historial de `ESTADO.md` hasta el 2026-10-20 está en [`_bitacora/archivo/`](_bitacora/archivo/ESTADO-hasta-2026-10-20.md). La bitácora diaria está en [`_bitacora/`](_bitacora/).

## Por dónde empezar

| Si eres… | Lee en este orden |
|---|---|
| Nuevo en el proyecto | `ESTADO.md` → [Visión](00-vision/01-vision-producto.md) → [Arquitectura general](02-arquitectura/01-vision-general.md) → [Modelo operativo de IA](09-ia/01-modelo-operativo.md) |
| Va a implementar algo | `CLAUDE.md` → [Contextos delimitados](02-arquitectura/02-contextos-delimitados.md) → [Convenciones](07-ingenieria/01-convenciones.md) |
| Va a decidir alcance | [Alcance MVP](01-producto/01-alcance-mvp.md) → [Roadmap](08-roadmap/01-roadmap.md) |
| Evalúa invertir o comprar | [Visión](00-vision/01-vision-producto.md) → [Modelo de negocio](00-vision/04-modelo-de-negocio.md) → [Roadmap](08-roadmap/01-roadmap.md) |

---

## 00 · Visión

| Documento | Qué contiene |
|---|---|
| [Visión de producto](00-vision/01-vision-producto.md) | El problema, la solución, por qué ahora, qué nos hace distintos |
| [Mercado y competencia](00-vision/02-mercado-y-competencia.md) | Tamaño, segmentos, competidores y su posicionamiento |
| [Personas y trabajos por resolver](00-vision/03-personas.md) | A quién le servimos y qué está tratando de lograr |
| [Modelo de negocio](00-vision/04-modelo-de-negocio.md) | Modelos de cobro posibles, costos, unit economics, estrategia de entrada. **Nada decidido todavía** |
| [El norte del producto](00-vision/05-norte-del-producto.md) | Hacia dónde va ViajaPro: qué conservamos del material de inspiración y hacia dónde lo expandimos |

## 01 · Producto

| Documento | Qué contiene |
|---|---|
| [Alcance del MVP](01-producto/01-alcance-mvp.md) | Qué entra y qué no en la versión 1, con el porqué |
| [Lenguaje ubicuo](01-producto/02-lenguaje-ubicuo.md) | **El diccionario del dominio.** Término del negocio ↔ nombre en el código |
| [Flujos críticos](01-producto/04-flujos-criticos.md) | Los cinco recorridos que deben funcionar siempre |
| [Métricas de éxito](01-producto/05-metricas.md) | Qué medimos y cómo sabemos si el producto sirve |
| [Diseño y UX](01-producto/06-diseno-y-ux.md) | Principios, sistema de diseño y flujo de trabajo con Stitch |
| [**Cabeza de playa: paquetes**](01-producto/07-cabeza-de-playa-paquetes.md) | **Por dónde se empieza: la agencia que revende paquetes, en rebanada vertical** |
| [Dictamen del catálogo real](01-producto/11-dictamen-del-catalogo-real.md) | Dictamen del experto de turismo sobre un catálogo real |
| [Visibilidad de conversaciones](01-producto/12-visibilidad-de-conversaciones.md) | Visibilidad y asignación de conversaciones (v1) |

## 02 · Arquitectura

| Documento | Qué contiene |
|---|---|
| [Visión general](02-arquitectura/01-vision-general.md) | El mapa del sistema, contenedores, flujos principales |
| [Contextos delimitados](02-arquitectura/02-contextos-delimitados.md) | Cómo se parte el dominio y cómo se hablan las partes |
| [Modelo de datos](02-arquitectura/03-modelo-de-datos.md) | Entidades, relaciones, decisiones de modelado |
| [Multi-tenancy](02-arquitectura/04-multitenancy.md) | Cómo se aíslan las agencias, en todas las capas |
| [Eventos y mensajería](02-arquitectura/05-eventos.md) | Outbox, colas, idempotencia, orden |
| [Contratos de API](02-arquitectura/06-api.md) | Convenciones REST, errores, paginación, versionado |
| [Capa de IA](02-arquitectura/09-capa-de-ia.md) | La capa de IA del producto |
| [Frontend](02-arquitectura/08-frontend.md) | Estructura, estado, tiempo real, rendimiento |

## 03 · Decisiones de arquitectura (ADR)

| ADR | Decisión | Estado |
|---|---|---|
| [0000](03-adr/0000-plantilla.md) | Plantilla | — |
| [0001](03-adr/0001-stack-tecnologico.md) | TypeScript end-to-end: NestJS + Next.js + PostgreSQL | Aceptado |
| [0002](03-adr/0002-whatsapp-cloud-api.md) | WhatsApp Cloud API directo como Tech Provider | Aceptado |
| [0003](03-adr/0003-multitenancy.md) | Esquema compartido + `tenant_id` + Row Level Security | Aceptado |
| [0004](03-adr/0004-monolito-modular.md) | Monolito modular, no microservicios | Aceptado |
| [0005](03-adr/0005-modelo-de-ramas.md) | Rama principal protegida con compuerta de integración | Aceptado |
| [0006](03-adr/0006-parametrizacion-y-extensibilidad.md) | Vertical configurable, no plataforma genérica. Sin código abierto por ahora | Aceptado |
| [0007](03-adr/0007-postgres-gestionado-neon.md) | PostgreSQL gestionado (Neon) en desarrollo, dev y staging | Aceptado |
| [0008](03-adr/0008-resolucion-de-tenant-en-webhooks-entrantes.md) | Directorio global de enrutamiento por función; staging durable antes del 200 | Aceptado; supersedido en parte por 0010 |
| [0009](03-adr/0009-salida-programada-como-unidad-de-venta.md) | El precio se ata a una ventana de vigencia, no al paquete | Aceptado |
| [0010](03-adr/0010-webhook-tal-como-es-y-el-trabajador-en-apps-api.md) | El webhook tal como es; el trabajador en `apps/api` hasta el segundo consumidor | Aceptado |
| [0011](03-adr/0011-autenticacion-y-tenant-de-sesion.md) | Better Auth autoalojado en la API; cookie opaca; tenant activo en la sesión, validado bajo RLS; roles por tenant | Aceptado |
| [0012](03-adr/0012-proveedor-de-correo-transaccional.md) | Correo transaccional con Postmark por HTTP detrás de `PuertoCorreo`; subdominio propio con DKIM y DMARC | Aceptado |
| [0013](03-adr/0013-despliegue-staging-y-produccion.md) | Despliegue en Render (Ohio, junto a Neon): web, API con Socket.IO, trabajador y Key Value; migraciones solo desde `main` por GitHub Actions; producción manual | Aceptado |
| [0014](03-adr/0014-cifrado-del-texto-de-mensajes.md) | Cifrado del texto de los mensajes | Superseded por 0015 |
| [0015](03-adr/0015-cifrado-de-campos-sensibles.md) | Cifrado de las columnas con PII sensible (mensajes, último mensaje, preferencias del contacto, notas internas y nombre de adjuntos); supersede al 0014 | Aceptado |
| [0016](03-adr/0016-ciclo-autonomo-con-sesiones-de-opencode.md) | Ciclo autónomo con sesiones de OpenCode; reformula R11 (la protección de servidor sustituye al escritor único). **Ciclo detenido desde 2026-10-26** | Propuesto |
| [0017](03-adr/0017-catalogo-gestionable-por-la-agencia.md) | El catálogo lo gestiona la agencia: cuatro canales de alta sobre un solo núcleo | Aceptado |
| [0018](03-adr/0018-envio-saliente-de-whatsapp.md) | Envío saliente de WhatsApp: cola, idempotencia y origen de la credencial | Propuesto |
| [0019](03-adr/0019-despliegue-minimo-un-proceso-sin-redis.md) | Despliegue mínimo: un solo proceso y la cola sobre Postgres, sin Redis | Aceptado |
| [0020](03-adr/0020-multiidioma-interfaz-viajero-catalogo-y-plantillas.md) | Multiidioma: interfaz, contenido al viajero, catálogo y plantillas | Aceptado |
| [0022](03-adr/0022-miembros-asignables-de-la-bandeja.md) | Miembros asignables: lectura mínima para reasignar en la bandeja | Aceptado |
| [0023](03-adr/0023-comision-del-proveedor-como-ingreso-propio.md) | La comisión del proveedor es un ingreso propio, no una forma de calcular el margen | Propuesto |
| [0024](03-adr/0024-de-cotizacion-aceptada-a-archivo-de-viaje.md) | De cotización aceptada a archivo de viaje: reserva, *time limit* y TRM congelada | Aceptado |
| [0025](03-adr/0025-retirar-temporadas-y-precios.md) | Retirar `Temporada` y `Precio`: el precio vive en vigencias y tarifas | Aceptado |
| [0026](03-adr/0026-rol-viajapro-metricas-y-medir-cola-de-salida.md) | `viajapro_metricas` y `medir_cola_de_salida` | Aceptado |
| [0027](03-adr/0027-rol-viajapro-ajustes-y-zona-horaria-de-la-agencia.md) | `viajapro_ajustes` y la zona horaria de la agencia | Aceptado |
| [0028](03-adr/0028-despliegue-neon-vercel-y-render-proceso-unico.md) | Despliegue: Neon, web en Vercel y API en un solo proceso en Render | Aceptado |
| [0029](03-adr/0029-cupo-propio-por-salida-receptivo.md) | Cupo propio por salida (receptivo) | Propuesto |
| [0030](03-adr/0030-registro-autoservicio-de-agencias.md) | Registro autoservicio de agencias y prueba gratis | Aceptado |
| [0032](03-adr/0032-layout-compartido-y-tabla-unica-de-navegacion.md) | Layout compartido `(app)` y tabla única de navegación | Aceptado |

## 04 · Integraciones

| Documento | Qué contiene |
|---|---|
| [WhatsApp Cloud API](04-integraciones/01-whatsapp-cloud-api.md) | Onboarding, webhooks, plantillas, ventana de 24h, errores |
| [Pagos](04-integraciones/02-pagos.md) | Pasarelas, conciliación, idempotencia |
| [Proveedores de turismo](04-integraciones/03-proveedores.md) | GDS, consolidadores, tarifarios |

## 05 · Seguridad y cumplimiento

| Documento | Qué contiene |
|---|---|
| [Modelo de amenazas](05-seguridad/01-modelo-de-amenazas.md) | Qué puede salir mal y qué lo contiene |
| [Protección de datos](05-seguridad/02-proteccion-de-datos.md) | Habeas data, PII de viajeros, retención, derechos del titular |
| [Políticas de WhatsApp](05-seguridad/03-politicas-whatsapp.md) | Qué permite Meta y qué nos puede costar el número |
| [Control de acceso](05-seguridad/04-rbac.md) | Roles, permisos, matriz de autorización |
| [Índice de políticas](05-seguridad/00-indice-de-politicas.md) | Las políticas de seguridad y su estado (borrador sin aprobar) |
| [Seguridad de la información](05-seguridad/05-politica-de-seguridad-de-la-informacion.md) | Política marco |
| [Control de accesos (política)](05-seguridad/06-control-de-accesos.md) | Contraseñas, sesiones y MFA |
| [Secretos y claves](05-seguridad/07-gestion-de-secretos-y-claves.md) | Gestión de secretos y claves |
| [Desarrollo seguro](05-seguridad/08-desarrollo-seguro.md) | Desarrollo seguro |
| [Respuesta a incidentes](05-seguridad/09-respuesta-a-incidentes.md) | Respuesta a incidentes y notificación |
| [Retención, supresión y respaldo](05-seguridad/10-retencion-supresion-y-respaldo.md) | Retención, supresión y respaldo de datos |
| [Divulgación responsable](05-seguridad/11-divulgacion-responsable.md) | Divulgación responsable de vulnerabilidades |
| [Uso aceptable de agentes de IA](05-seguridad/12-uso-aceptable-agentes-ia.md) | Uso aceptable para los agentes de IA que desarrollan ViajaPro |
| [Cookies](05-seguridad/13-inventario-y-politica-de-cookies.md) | Inventario y política |

## 06 · Operación

| Documento | Qué contiene |
|---|---|
| [Entornos y despliegue](06-operacion/01-entornos-y-despliegue.md) | Los cuatro entornos y cómo se promueve entre ellos |
| [CI/CD](06-operacion/02-ci-cd.md) | Pipeline, compuertas, migraciones en despliegue |
| [Observabilidad](06-operacion/03-observabilidad.md) | Trazas, métricas, logs, alertas que valen la pena |
| [Runbooks](06-operacion/04-runbooks.md) | Qué hacer cuando suena cada alerta |
| [Costo por agencia](06-operacion/costo-por-tenant.md) | Costo base y costo por agencia |
| [Respaldo y restauración](06-operacion/respaldo-y-restauracion.md) | Propuesta sin ensayar |
| [Rotación de claves](06-operacion/rotacion-de-claves.md) | Propuesta sin ensayar |

## 07 · Ingeniería

| Documento | Qué contiene |
|---|---|
| [Convenciones](07-ingenieria/01-convenciones.md) | Nombres, estructura, errores, estilo |
| [Estrategia de pruebas](07-ingenieria/02-estrategia-de-pruebas.md) | Qué se prueba en cada nivel y qué no |
| [Git y ramas](07-ingenieria/03-git.md) | **`main` protegida, la compuerta de integración y sus siete etapas** |
| [Definición de terminado](07-ingenieria/04-definicion-de-terminado.md) | Cuándo algo está realmente listo |
| [Despliegue de la demo: Neon, Vercel y Render](07-ingenieria/despliegue-neon-vercel-render.md) | **La guía vigente** (ADR-0028) |
| [Despliegue de demo gratuito](07-ingenieria/despliegue-demo-gratuito.md) | Pasos del propietario para una demo gratuita (antecedente de la guía vigente) |
| [Despliegue de staging](07-ingenieria/despliegue-staging.md) | Pasos del propietario para staging en Render |
| [Runbook del modo de un solo proceso](07-ingenieria/runbook-modo-unico.md) | Operación en modo `unico` (un proceso, sin Redis; ADR-0019) |
| [Runbook de Redis en staging](07-ingenieria/runbook-redis-staging.md) | Redis y trabajador en staging (T-079) |
| [Desarrollo en la nube](07-ingenieria/desarrollo-en-la-nube.md) | Trabajar desde GitHub Codespaces |

## 08 · Roadmap

| Documento | Qué contiene |
|---|---|
| [Roadmap](08-roadmap/01-roadmap.md) | Fases, hitos, criterios de salida, estimaciones honestas |
| [Riesgos](08-roadmap/03-riesgos.md) | Qué puede hundir el proyecto y qué hacemos al respecto |
| Roadmap de producto v3 (`08-roadmap/02-roadmap-producto-v3.md`) | HubSpot como norte, el turismo como ventaja. **Propuesta, en el PR #43: aún no está en `main`** |
| [`roadmap/tasks.yaml`](../roadmap/tasks.yaml) | **La cola de trabajo** (ADR-0016). Ya no vive en `ESTADO.md` |
| [Plan de corrección de la auditoría 2026-11-15](08-roadmap/02-plan-correccion-auditoria-2026-11-15.md) | Plan de corrección tras la auditoría integral del 2026-11-15 |
| [Ruta al entregable de la fase 1](08-roadmap/04-ruta-al-entregable-fase-1.md) | Fase 1, «Piloto utilizable» (JD Tours) |
| [Ruta de seguridad y privacidad](08-roadmap/05-ruta-de-seguridad-y-privacidad.md) | Ruta de seguridad y privacidad |
| [Roadmap de reportes](08-roadmap/06-roadmap-de-reportes.md) | Roadmap de reportes |
| [Roadmap multiidioma](08-roadmap/07-roadmap-multiidioma.md) | Ver ADR-0020 |
| [Roadmap JD Tours: reservas, cobros y navegación](08-roadmap/08-roadmap-jd-tours-reservas-cobros-y-navegacion.md) | Lo que pidió el cliente piloto, en cinco ejes; la navegación va primero |
| [Roadmap maestro del CRM completo y operación desatendida](08-roadmap/09-roadmap-maestro-y-operacion-desatendida.md) | Las olas hasta terminar el CRM y las reglas con que las sesiones trabajan sin supervisión |

## 09 · Ingeniería asistida por IA

| Documento | Qué contiene |
|---|---|
| [Modelo operativo](09-ia/01-modelo-operativo.md) | Cómo se construye este producto: equipo de agentes y reglas |
| [Loops de trabajo](09-ia/02-loops-de-trabajo.md) | Los cinco ciclos: sesión, funcionalidad, auditoría, investigación, incidente |
| [Continuidad del hilo](09-ia/03-continuidad-del-hilo.md) | Cómo no perder el contexto entre sesiones ni entre modelos |
| [MCP](09-ia/04-mcp.md) | Servidores de contexto y herramientas |
| [Interoperabilidad multi-IA](09-ia/05-interoperabilidad-multi-ia.md) | Cómo entra otra IA al proyecto sin romperlo. Decisiones sobre Antigravity y modelos abiertos |
| [Cronograma de loops](09-ia/06-cronograma-de-loops.md) | Qué corre solo, cuándo, y por qué el calendario crece con el proyecto |
| [Flujo con Antigravity](09-ia/06-flujo-con-antigravity.md) | Trabajo en paralelo con Antigravity: worktrees, traspaso por archivo |
| [Ciclo autónomo](09-ia/07-ciclo-autonomo.md) | Guía del ciclo de OpenCode. **Detenido desde 2026-10-26** |
| [Prompt de Antigravity](09-ia/08-prompt-antigravity.md) | Arranque y cola (T-016 a T-031) del carril de frontend |
| [Ingesta de catálogo con IA](09-ia/09-ingesta-de-catalogo-con-ia.md) | Diseño de la ingesta de catálogo con IA (sin código todavía) |

## 10 · Onboarding de agencias

| Documento | Qué contiene |
|---|---|
| [Requisitos para la agencia](10-onboarding/01-requisitos-para-la-agencia.md) | **Documento para enviar al cliente.** Qué necesita para conectar su WhatsApp. Sin verificación ni web |
| [Alta como Tech Provider](10-onboarding/02-alta-como-tech-provider.md) | Alta de ViajaPro como Tech Provider de Meta |
| [Valores del entorno de pruebas](10-onboarding/03-valores-del-entorno-de-pruebas.md) | Valores del entorno de pruebas de Meta |

## 11 · Entregables

| Documento | Qué contiene |
|---|---|
| [Entregables](11-entregables/README.md) | Documentos `.docx` y `.pdf` para enviar fuera del repositorio. Todo entregable debe rastrearse hasta sus documentos fuente |
| [Documentación general del proyecto](11-entregables/documentacion-general-del-proyecto.md) | Documentación general del proyecto |

---

## Carpetas que se acumulan

| Carpeta | Qué guarda |
|---|---|
| `_bitacora/` | Una entrada por sesión de trabajo. Nunca se edita, se acumula. |
| `_auditorias/` | Auditorías (integrales, UX, competitiva, externa) y sus insumos. Un solo lugar. |
| `_investigacion/` | Investigación externa puntual (hoy, HubSpot). |
| `_contexto/` | El cerebro persistente: marco, contexto estable y diario. |
| `_backlog/` | Cola de trabajo de un catálogo gestionable (la cola vigente es `roadmap/tasks.yaml`). |
| `_traspasos/` | Tareas delegadas a IAs o colaboradores externos, y qué volvió (incluye `ENTREGA.md`, `REVISION.md` y `COLA.md` del flujo con Antigravity, hoy sin uso). |
| `_incidentes/` | Postmortems de producción. |
| `_integraciones/` | Una entrada por integración a `main`, y el registro de autorizaciones. |
| `_assets/` | Imágenes y recursos de la documentación. |

## Cómo se escribe aquí

- **Español, prosa, directo.** Frases cortas. Sin relleno.
- **El porqué antes del qué.** El código ya dice qué hace.
- **Un hecho vive en un solo documento.** Los demás enlazan. La duplicación se desincroniza y miente.
- **Diagramas en Mermaid**, embebidos. Nunca imágenes que no se puedan editar.
- **Concreto sobre genérico.** No "se maneja la concurrencia", sino el mecanismo exacto.
