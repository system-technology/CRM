# Retrospectiva: estado real del proceso de ViajaPro

| | |
|---|---|
| Fecha | 2026-11-05 |
| Pedida por | El propietario |
| Base | `origin/main` (1 240 commits), PRs de GitHub, `roadmap/tasks.yaml`, CI. Cifras medidas ese día; lo que no se pudo medir se dice |
| Postura | Honesta antes que alentadora. Ver también la [auditoría de veracidad](2026-11-04-auditoria-de-veracidad.md) |

## 1. Veredicto en cuatro líneas

1. **El backend es sólido y está bien probado; el producto, como flujo completo, todavía no existe.**
   Nadie ha recorrido en un navegador «entra un WhatsApp → lo atiendo → cotizo → lo envío» contra una
   API real.
2. **Lo que más ha costado no es construir sino integrar:** 223 PRs integrados, 11 cerrados sin
   integrar, y una cola de revisión lenta que es el cuello de botella.
3. **Seguimos en local, sin gasto de infraestructura, a propósito.** La decisión de desplegar espera a
   que el flujo funcione de punta a punta.
4. **El riesgo mayor ya no es técnico sino de verificación:** mucho código con pruebas unitarias y e2e
   de backend, casi nada que pruebe la web contra la API.

## 2. Qué es y para quién

SaaS multi-tenant: CRM vertical para **agencias de turismo**, con **WhatsApp Cloud API** como canal
nativo. Piloto previsto: JD Tours (datos fuera del repositorio público). Meta: un MVP **real y usable**,
no una demo, al menor costo de infraestructura posible.

## 3. Arquitectura (lo que hay hoy)

### 3.1 Forma

| Capa | Decisión | Estado |
|---|---|---|
| Monorepo | pnpm + Turborepo: `apps/api`, `apps/web`, `apps/worker` (vacío), `packages/{contracts,database,domain,ui,sdk}` | Real |
| API | NestJS, monolito modular, un módulo por contexto, cuatro capas (`domain/application/infrastructure/interface`) | Real: `identity`, `inbox`, `crm`, `quoting`, `analytics`, `notifications` |
| Web | Next.js App Router + Tailwind + shadcn/ui | Real en parte; ver §5 |
| Datos | PostgreSQL 16 + Prisma, **RLS en toda tabla de negocio**, 33 migraciones | Real, probado en CI |
| Contratos | Esquemas Zod en `packages/contracts`, fuente única | Real |
| Colas | BullMQ + Redis (modo `escalado`) o colas en memoria / Postgres (modo `unico`, ADR-0019) | `unico` integrado; ningún modo corrido contra un Meta real |
| Tiempo real | Socket.IO | Probado en CI con Redis |
| Despliegue | `render.yaml` y runbooks | **Solo documentos. No hay un servicio vivo** |

Módulos del diseño que **aún no existen** como código: `booking`, `payments`, `automation`, `audit`
(parcial).

### 3.2 Decisiones estructurales (21 ADR en `docs/03-adr/`)

- **ADR-0003 / 0008 / 0011:** aislamiento entre agencias con RLS y **cuatro roles de aplicación**, cada
  proceso aborta al arrancar si no es el rol que esperaba. Es la pieza mejor construida del proyecto.
- **ADR-0010 / 0018:** recepción y envío de WhatsApp por cola, idempotentes (R5).
- **ADR-0015:** cifrado de campos sensibles. **Aceptado, sin implementar** (`mensajes.texto` está en claro).
- **ADR-0019:** despliegue mínimo de un proceso sin Redis. Implementado, **no desplegado**.
- **ADR-0020:** multiidioma (es-CO fuente, en-US, pt-BR). **Solo diseño y tareas.**

### 3.3 Seguridad, lo verificado

| Control | Evidencia |
|---|---|
| RLS + prueba de aislamiento A/B | Job `aislamiento-tenants` en CI |
| Ningún rol de app salta RLS; roles distintos por función | `arranque-seguro.e2e-spec.ts` |
| Permisos de mutación por rol (RBAC) en todas las rutas que mutan | `mutaciones-con-permiso.spec.ts` |
| Historiales **append-only** (etapas de oportunidad, estados de cotización) | Disparador compartido + e2e |
| Funciones `SECURITY DEFINER` con dueño `NOLOGIN` y `search_path=''` | Migración de zona horaria (#234) |
| Texto saliente sin neto ni margen; saneado de caracteres de control | `limpiarTextoSaliente` + pruebas |
| Auditorías de seguridad por PR sensible | #211, #220 |

**Abierto, bloquea datos reales:** criterios C1, C2, C3 y C5 del roadmap v2 (solo C4 está verde).
Cifrado de campos sensibles, derechos del titular (T-097), aviso de privacidad (T-093), RNBD (T-098).

## 4. Método de trabajo

### 4.1 Cómo se construye

- **Equipo de agentes con roles fijos** (20 definidos en `.claude/agents/`): arquitecto, backend,
  frontend, datos, whatsapp, qa, auditor-seguridad, integrador, etc. Claude orquesta y también escribe
  código; Antigravity cubría frontend y **hoy no está habilitado**, así que un agente de Claude hace su
  papel.
- **Carriles:** `a/` backend y base de datos, `b/` frontend, `i/` integración y documentos. Un check del
  CI («Carril y tarea») rechaza el PR que toque rutas de otro carril. Funciona, pero ya costó un PR
  partido (#225/#226).
- **`main` protegida por servidor:** PR obligatorio, 8+ checks, rama al día, sin excepción de
  administradores. Rutas sensibles (migraciones, RLS, cifrado, `infra/`, `.github/`, dependencias, ADR)
  exigen aprobación del propietario, hoy **delegada a Claude**.
- **Cola de trabajo:** `roadmap/tasks.yaml`: 172 tareas, 94 hechas, 66 en backlog, 10 bloqueadas,
  2 descartadas.
- **El hilo:** `ESTADO.md`, ADR, bitácora (92 entradas) y roadmap. «Si no está escrito, no existe».
- **Regla de parada (R13):** una vuelta de revisión salvo en aislamiento entre agencias.

### 4.2 Lo que funciona del método

| Práctica | Efecto medido |
|---|---|
| Protección de servidor + CI como compuerta | Cero empujes directos; los defectos aparecen en el PR y no en `main` |
| Revisión línea a línea de migraciones | Atrapó la mayor parte de los errores de datos antes de aplicarse |
| Prueba de aislamiento entre agencias en CI | Ninguna fuga conocida |
| Auditoría de veracidad (2026-11-04) | Obligó a decir que no hay flujo completo; recortó la autoengañada «80 % listo» |
| Decisiones con un default y avanzar | Evitó bloqueos por salvedades |

### 4.3 Lo que no funciona, con ejemplos reales

| Problema | Ejemplo | Costo |
|---|---|---|
| **Cola de integración serial y lenta:** cada actualización de rama reinicia el CI | Ondas de conflictos de #208, #214, #228 | Horas por PR; el trabajo espera |
| **Conflictos entre carriles sobre archivos compartidos** | `traspaso/ENTREGA.md`, `schema.prisma` con CRLF (#182 reescribió 4 100 líneas) | Rehacer fusiones |
| **Ids de tarea que colisionan** | PR #187 integró solo su primer commit y T-120..T-123 se perdieron; hubo que reasignar | Trabajo perdido y confusión |
| **Fixtures de prueba que no llevan los permisos nuevos** | Pasó tres veces (RBAC, historiales, canal) | Fallos de CI evitables |
| **Revisión humana-IA con puntos ciegos** | Dejé pasar un `CHECK` que aceptaba NULL (lógica trivaluada, #221); lo atrapó la prueba | Una vuelta extra |
| **Pruebas que no prueban lo que dicen** | `comoAgencia` leía como dueño y se saltaba RLS | Falsa confianza hasta corregirla |
| **Fatiga de revisión:** el 4 de noviembre hubo 225 commits en un día | Riesgo de aprobar sin ver | Mitigado con hashes y revisión línea a línea en rutas sensibles |
| **Dependencia de un agente externo** (Antigravity sin cuota) | Cola frontend vacía | Resuelto con un agente relevo |
| **El clasificador de permisos bloquea herramientas** (`.env`, `psql`, Neon, `rm -rf`) | No puedo aplicar migraciones a Neon ni cerrar un proceso huérfano | Tareas que solo puede hacer el propietario |

## 5. Estado real por capacidad

Leyenda: **Real** = integrado y probado; **Parcial** = existe pero con huecos; **Maqueta/Diseño** = no
funciona o no existe.

| Capacidad | Backend | Web | Verificado de punta a punta |
|---|---|---|---|
| Identidad (sesión, OTP, invitaciones, baja) | Real | Real | No |
| Aislamiento entre agencias | Real | n/a | Sí (CI) |
| Catálogo (CRUD, tarifas, importación) | Real | Real por defecto; restos de maqueta | No |
| Cotizador (calcular, guardar, versionar, estados) | Real | Real | No |
| Bandeja: recepción de WhatsApp | Real (probada una vez con el botón «Probar» de Meta) | Real | No con celular real |
| Bandeja: envío a WhatsApp | Real **contra Graph falso** | Real | **No contra Meta** |
| CRM (contactos, oportunidades, seguimientos) | Real | Real | No |
| Reportes | Real (#213: por moneda, margen con permiso) | Real (T-142, zona de la agencia en #241) | No |
| Zona horaria de la agencia | GET real; PATCH pendiente de #234 | En #241 | No |
| Estado del canal de WhatsApp | En CI (#212) | Pendiente | No |
| Etapas configurables del pipeline | Existe | Falta conectar | No |
| Equipo / miembros | Real | Real (#228) | No |
| Multiidioma | Diseño (ADR-0020) | — | — |
| Reservas, archivos de viaje, pagos, automatizaciones, IA | **No existen** | — | — |
| Plantilla de reapertura (24 h), verificación de negocio en Meta | Bloqueado por Meta | — | — |

**Dato clave:** 263 archivos de prueba unitaria y 43 de integración. **Ninguno abre un navegador.**
La suite web usa mocks de la API; la de la API no ejercita la web.

### Cifras

| Medida | Valor |
|---|---|
| PRs integrados / cerrados sin integrar | 223 / 11 |
| Commits en `main` | 1 240 |
| Tareas hechas / backlog / bloqueadas | 94 / 66 / 10 |
| Migraciones | 33 |
| ADR | 21 |
| Pruebas web (última corrida) | 1 119 en 136 archivos, en verde |
| Pruebas API | 144 archivos de integración pasan, 1 en reparación (#212) |
| Servicios desplegados | 0 |
| Agencias reales usándolo | 0 |

## 6. Costos y decisiones de dinero

- **Hoy se gasta cero en infraestructura.** Todo es local; no hay Docker en la máquina del propietario.
- Candidatos a producción: **Hetzner VPS, unos 7-8 EUR al mes**, o **Fly.io + Neon, unos 18-34 USD al
  mes**. Modo `unico` (un proceso, sin Redis) lo hace posible.
- Descartados: Oracle Always Free (riesgoso para producción), créditos de hiperescalares (expiran),
  Vercel Hobby (uso no comercial), Neon gratis (incompatible con la consulta periódica).
- Costos de Meta (conversaciones y plantillas) no están en el modelo de precios; es una pregunta
  pendiente para `jefe-de-producto`.

## 7. Riesgos, ordenados

| # | Riesgo | Gravedad | Mitigación |
|---|---|---|---|
| 0 | **Riesgo de mercado, no medido:** ninguna agencia ha visto el flujo ni dicho que cambiaría su forma de trabajar. Hay más procesos (21 ADR, 20 roles, 172 tareas) que contacto con el comprador | Alta | Demo del flujo (aunque sea en una máquina o por túnel) a JD Tours en cuanto H1-H6 corra; congelar alcance nuevo hasta entonces |
| 1 | **Flujo completo nunca probado:** puede esconder fallos de integración web↔API que ningún test actual ve | Alta | T-126: campaña funcional, hallazgos en `.md`, corregir hasta cero bloqueantes |
| 2 | Envío a Meta real sin probar; credenciales y verificación de negocio pendientes | Alta | Prueba con número de prueba antes de cualquier agencia; T-080 depende del propietario |
| 3 | **Datos de viajeros reales sin cifrado de campos sensibles ni derechos del titular** | Alta (legal) | No cargar datos reales hasta C1-C5; cifrado ADR-0015 |
| 4 | Cuello de botella en la integración (serial, lenta) | Media | Agrupar PRs pequeños por área; menos conflictos entre carriles |
| 5 | Alcance: el producto promete bloques (reservas, pagos, IA) que no existen | Media | La oferta inicial se limita a bandeja + CRM + cotizador, como dice el estado |
| 6 | Un solo propietario como cuello para rutas sensibles y cuentas externas | Media | Aprobación delegada, pero cuentas y trámites legales siguen siendo suyos |
| 7 | Multiidioma añade ~31 días de agente y choca con la extracción de textos del frontend | Media | Decidir prioridad frente a reportes |
| 8 | Dependencia de IA para revisar IA: ya hubo pruebas equivocadas (`comoAgencia`, CHECK con NULL) | **Alta** | Antes de datos reales, revisión independiente del aislamiento (RLS, roles) por un tercero humano |

## 8. Qué sigue, en orden

> Congelado hasta cerrar H1-H6: multiidioma, reportes avanzados y cualquier funcionalidad nueva.

1. **Terminar la cola actual:** #234 (función de zona horaria), #212 (estado del canal), #241 (zona en
   `/reportes`).
2. **PATCH de zona horaria** (backend) y **etapas del pipeline + pantalla de WhatsApp** (web).
3. **Campaña funcional T-126:** levantar el sistema completo local en modo `unico`, recorrer los
   flujos H1-H6 en el navegador, escribir los hallazgos, corregir y repetir. **Es lo que convierte
   código en producto.**
4. Playwright (T-125) para que ese recorrido se repita solo en CI. Requiere aprobar una dependencia.
5. **Solo entonces** decidir despliegue (Hetzner o Fly+Neon) y abrir con la agencia piloto.
6. Multiidioma (T-152 a T-172): base sin conflictos primero (glosario, migración, `packages/i18n`).

## 9. Qué necesito del propietario

| Decisión o trámite | Por qué |
|---|---|
| ¿Revisión nativa de las traducciones al inglés y al portugués? | Presupuesto |
| ¿Multiidioma antes o después de reportes y de la campaña funcional? | Prioridad. Mi recomendación: después de la campaña |
| Idiomas que necesita JD Tours | Alcance de E1 |
| Cuentas: Meta (verificación), proveedor de despliegue, dominio, Neon | Solo el propietario puede |
| Aprobar la dependencia de Playwright | Ruta protegida |
| Cerrar el PR #107 y las ramas sueltas | El gancho me lo impide |
| Empujar la rama del flujo de trabajo `i/T-000-ci-modo-unico` con sus credenciales | La app no tiene permiso `workflows` |
| Cerrar el proceso `node` huérfano de la API local | El clasificador me lo bloquea |

## 10. Lecciones para el proceso

1. **El trabajo no cuenta hasta que se prueba entero.** Muchos «terminados» eran piezas; el producto es
   el recorrido.
2. **Medir antes de afirmar.** La auditoría de veracidad bajó el porcentaje de avance a su valor real.
3. **Ids y carriles necesitan un solo dueño por archivo compartido** (`tasks.yaml`, `ENTREGA.md`).
4. **Toda fixture de prueba hereda los permisos** o fallará en el siguiente cambio de RBAC.
5. **Un `CHECK` con NULL pasa en SQL;** hay que escribir el caso negativo.
6. **Cada paso de la cola cuesta un CI completo:** menos PRs, más grandes por área, y no más ramas
   paralelas sobre el mismo archivo.
7. **El aislamiento entre agencias no se recorta nunca;** todo lo demás, una vuelta de revisión.
