# Documentación de ViajaPro

Toda la documentación del proyecto. Si una decisión no está aquí (o en `ESTADO.md`), no existe.

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

## 02 · Arquitectura

| Documento | Qué contiene |
|---|---|
| [Visión general](02-arquitectura/01-vision-general.md) | El mapa del sistema, contenedores, flujos principales |
| [Contextos delimitados](02-arquitectura/02-contextos-delimitados.md) | Cómo se parte el dominio y cómo se hablan las partes |
| [Modelo de datos](02-arquitectura/03-modelo-de-datos.md) | Entidades, relaciones, decisiones de modelado |
| [Multi-tenancy](02-arquitectura/04-multitenancy.md) | Cómo se aíslan las agencias, en todas las capas |
| [Eventos y mensajería](02-arquitectura/05-eventos.md) | Outbox, colas, idempotencia, orden |
| [Contratos de API](02-arquitectura/06-api.md) | Convenciones REST, errores, paginación, versionado |
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

## 06 · Operación

| Documento | Qué contiene |
|---|---|
| [Entornos y despliegue](06-operacion/01-entornos-y-despliegue.md) | Los cuatro entornos y cómo se promueve entre ellos |
| [CI/CD](06-operacion/02-ci-cd.md) | Pipeline, compuertas, migraciones en despliegue |
| [Observabilidad](06-operacion/03-observabilidad.md) | Trazas, métricas, logs, alertas que valen la pena |
| [Runbooks](06-operacion/04-runbooks.md) | Qué hacer cuando suena cada alerta |

## 07 · Ingeniería

| Documento | Qué contiene |
|---|---|
| [Convenciones](07-ingenieria/01-convenciones.md) | Nombres, estructura, errores, estilo |
| [Estrategia de pruebas](07-ingenieria/02-estrategia-de-pruebas.md) | Qué se prueba en cada nivel y qué no |
| [Git y ramas](07-ingenieria/03-git.md) | **`main` protegida, la compuerta de integración y sus siete etapas** |
| [Definición de terminado](07-ingenieria/04-definicion-de-terminado.md) | Cuándo algo está realmente listo |

## 08 · Roadmap

| Documento | Qué contiene |
|---|---|
| [Roadmap](08-roadmap/01-roadmap.md) | Fases, hitos, criterios de salida, estimaciones honestas |
| [Riesgos](08-roadmap/03-riesgos.md) | Qué puede hundir el proyecto y qué hacemos al respecto |

## 09 · Ingeniería asistida por IA

| Documento | Qué contiene |
|---|---|
| [Modelo operativo](09-ia/01-modelo-operativo.md) | Cómo se construye este producto: equipo de agentes y reglas |
| [Loops de trabajo](09-ia/02-loops-de-trabajo.md) | Los cinco ciclos: sesión, funcionalidad, auditoría, investigación, incidente |
| [Continuidad del hilo](09-ia/03-continuidad-del-hilo.md) | Cómo no perder el contexto entre sesiones ni entre modelos |
| [MCP](09-ia/04-mcp.md) | Servidores de contexto y herramientas |
| [Interoperabilidad multi-IA](09-ia/05-interoperabilidad-multi-ia.md) | Cómo entra otra IA al proyecto sin romperlo. Decisiones sobre Antigravity y modelos abiertos |
| [Cronograma de loops](09-ia/06-cronograma-de-loops.md) | Qué corre solo, cuándo, y por qué el calendario crece con el proyecto |

---

## Carpetas que se acumulan

| Carpeta | Qué guarda |
|---|---|
| `_bitacora/` | Una entrada por sesión de trabajo. Nunca se edita, se acumula. |
| `_auditorias/` | Informes de auditoría integral. |
| `_traspasos/` | Tareas delegadas a IAs o colaboradores externos, y qué volvió. |
| `_incidentes/` | Postmortems de producción. |
| `_integraciones/` | Una entrada por integración a `main`, y el registro de autorizaciones. |
| `_assets/` | Imágenes y recursos de la documentación. |

## Cómo se escribe aquí

- **Español, prosa, directo.** Frases cortas. Sin relleno.
- **El porqué antes del qué.** El código ya dice qué hace.
- **Un hecho vive en un solo documento.** Los demás enlazan. La duplicación se desincroniza y miente.
- **Diagramas en Mermaid**, embebidos. Nunca imágenes que no se puedan editar.
- **Concreto sobre genérico.** No "se maneja la concurrencia", sino el mecanismo exacto.
