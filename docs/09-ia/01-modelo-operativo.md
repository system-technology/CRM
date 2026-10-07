# Modelo operativo de ingeniería asistida por IA

> Cómo se construye ViajaPro. No es un anexo del proyecto: **es el método de trabajo del proyecto.**

---

## 1. La premisa

Este producto lo construye un equipo pequeño asistido por agentes de IA. Eso cambia tres cosas
respecto a un proyecto tradicional, y el método tiene que responder a las tres:

| Lo que cambia | Consecuencia | Cómo lo resolvemos |
|---|---|---|
| **Un modelo no recuerda la sesión anterior.** | El contexto se pierde en cada corte. | El hilo vive en archivos, no en conversaciones. Ver §4. |
| **La velocidad de producción de código se multiplica.** | El cuello de botella se mueve de *escribir* a *verificar*. | Auditoría como etapa de primera clase, no como favor al final. |
| **Un agente genérico produce código genérico.** | Deriva de convenciones, dominio mal modelado. | Agentes especializados con contexto y límites explícitos. |

La conclusión operativa: **la disciplina documental no es burocracia, es la memoria del sistema.**
Un proyecto así, sin `ESTADO.md` al día, se degrada en semanas.

---

## 2. El equipo de agentes

Diecisiete roles definidos en `.claude/agents/`. Cada uno tiene contexto obligatorio, criterios propios y
—lo más importante— **una lista de lo que no hace**.

### Diseño y producto

| Agente | Responsabilidad | Límite |
|---|---|---|
| `arquitecto` | Forma del sistema, fronteras, ADRs | No implementa funcionalidades |
| `analista-producto` | Alcance, historias, criterios, métricas | No diseña la solución técnica |
| `experto-turismo` | Fidelidad del modelo al negocio real | No propone arquitectura |

### Construcción

| Agente | Responsabilidad | Límite |
|---|---|---|
| `backend` | Módulos NestJS, casos de uso, puertos | No toca migraciones ni decide arquitectura |
| `frontend` | Next.js, componentes, estado | No define tipos de API a mano |
| `diseno-ux` | Flujos de pantalla, sistema de diseño, prototipado | No implementa componentes ni copia código generado |
| `datos` | Esquema, migraciones, RLS, rendimiento | Único agente que escribe migraciones |
| `whatsapp` | Integración con Meta Cloud API | No decide producto |
| `ingeniero-ia` | Capacidades de IA **del producto** | No confundir con esta capa de agentes |
| `devops` | CI/CD, infraestructura, observabilidad | No agrega complejidad sin justificarla |

### Verificación y memoria

| Agente | Responsabilidad | Límite |
|---|---|---|
| `auditor-seguridad` | Aislamiento, secretos, OWASP, cumplimiento | Reporta, no corrige |
| `auditor-codigo` | Corrección, fronteras, deuda | Reporta, no reescribe |
| `qa` | Estrategia y escritura de pruebas | No arregla el código de producción |
| `documentador` | Que `docs/` diga la verdad | — |
| `analista-datos` | Métricas, embudos, unit economics | No consulta producción directamente |
| `investigador` | Información externa verificable | Nunca responde de memoria sobre lo que cambia |
| **`integrador`** | **Guardián de `main`. Única vía de integración** | **No arregla lo que encuentra: devuelve** |

### Por qué los auditores no corrigen

Separar quien encuentra de quien arregla no es ceremonia. Un agente que corrige lo que él mismo
encontró tiende a corregir el síntoma y declararse satisfecho. La separación obliga a que el
hallazgo sea **explicable a otro**, y eso filtra los hallazgos falsos.

---

## 3. Reglas de coordinación

1. **Un agente por tarea, no un agente para todo.** Si la tarea cruza dominios, se parte.
2. **El escalamiento es obligatorio, no opcional.** Si `backend` se topa con una decisión
   estructural no documentada, se detiene y escala a `arquitecto`. No improvisa.
3. **Los agentes de verificación nunca los invoca quien escribió el código**: los invoca el ciclo.
4. **Paralelizar solo lo independiente.** Las seis dimensiones de una auditoría van en paralelo.
   Backend y frontend van en paralelo **solo después** de que el contrato esté cerrado.
5. **Lo que un agente concluye y no queda escrito, no existe.** El resultado de un subagente se
   pierde con su contexto: lo que importe va a `docs/` o a `ESTADO.md`.

---

## 4. Los cuatro artefactos del hilo

Detalle completo en [`03-continuidad-del-hilo.md`](03-continuidad-del-hilo.md).

| Artefacto | Pregunta que responde | Frecuencia | Mutable |
|---|---|---|---|
| `ESTADO.md` | ¿Dónde estamos ahora? | Cada sesión | Sí, se reescribe |
| `docs/03-adr/` | ¿Por qué el sistema es así? | Por decisión | **No.** Se supersede |
| `docs/_bitacora/` | ¿Qué pasó y qué aprendimos? | Cada sesión | No, se acumula |
| `docs/08-roadmap/` | ¿Hacia dónde vamos? | Por fase | Sí |

---

## 5. Automatización del método

Lo que depende de que alguien se acuerde, se olvida. Por eso el método tiene dientes:

| Mecanismo | Qué hace |
|---|---|
| Hook `SessionStart` | Inyecta el hilo (`ESTADO.md`) al abrir cualquier sesión. Nadie empieza a ciegas. |
| Hook `PreToolUse` | Bloquea la escritura de secretos y de archivos prohibidos. La regla R6 con dientes. |
| Hook `PostToolUse` | Formatea, y avisa de tabla sin RLS, importación entre módulos y `any`. |
| Hook `Stop` | Avisa si la sesión modificó el repositorio sin actualizar el hilo. |
| Hook `guard-rama` | Impide commitear en `main`, integrar sin autorización del `integrador`, y reescribir el historial. Regla R11. |
| `permissions.deny` | Impide leer `.env`, borrar en masa, forzar push, resetear la base. |
| CI | Lint, tipos, pruebas, aislamiento entre tenants, escaneo de secretos. |

---

## 6. Qué se delega a IA y qué no

| Se delega | No se delega |
|---|---|
| Implementación contra un diseño aprobado | La decisión de qué construir |
| Pruebas y casos borde | La aceptación de que algo está terminado |
| Auditoría y revisión | El juicio final sobre riesgo aceptable |
| Documentación y sincronización | La validación con un cliente real |
| Investigación con fuente verificable | La relación con la agencia piloto |

El criterio no es la capacidad del modelo: es **quién responde cuando sale mal**. Las decisiones
cuyo costo recae sobre el negocio las toma una persona.

---

## 7. Cómo entra otra IA al proyecto

Por el protocolo de [`05-interoperabilidad-multi-ia.md`](05-interoperabilidad-multi-ia.md) y la
skill `handoff-ia-externa`. Resumen: tarea empaquetada con contexto autosuficiente, criterios de
aceptación objetivos, y **auditoría obligatoria de lo que vuelve**. Nada entra por confianza.
