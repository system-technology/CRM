# Loops de trabajo

Un *loop* es un ciclo de trabajo con etapas fijas, compuertas explícitas y un cierre que deja
constancia. Existen porque **lo que no tiene ciclo definido se improvisa distinto cada vez**, y en
un proyecto asistido por agentes eso se traduce en deriva: cada sesión produce código con otro
criterio.

Hay cinco. Tres son de ritmo (se disparan solos), dos son bajo demanda.

---

## Loop 1 — Sesión (cada vez que se abre el proyecto)

```mermaid
flowchart LR
    A[Abrir sesión] --> B[Hook inyecta ESTADO.md]
    B --> C[Tomar la primera tarea de la cola]
    C --> D[Trabajar]
    D --> E{¿Modificó el repo?}
    E -- sí --> F["/estado — actualizar hilo + bitácora"]
    E -- no --> G[Cerrar]
    F --> G
```

El hook `SessionStart` elimina el arranque a ciegas; el hook `Stop` elimina el cierre sin
constancia. Entre medio, el trabajo real.

**Dura:** una sesión. **Dispara:** automático.

---

## Loop 2 — Funcionalidad (skill `ciclo-funcionalidad`)

Siete etapas, de la idea al código integrado:

```mermaid
flowchart TD
    A["1. Definir<br/>analista-producto"] --> B["2. Validar dominio<br/>experto-turismo"]
    B --> C["3. Diseñar<br/>arquitecto"]
    C --> D{"¿Toca datos<br/>de tenants?"}
    D -- sí --> E["Revisión previa<br/>auditor-seguridad"]
    D -- no --> F
    E --> F["4. Datos<br/>datos"]
    F --> G["5. Implementar<br/>backend · frontend · whatsapp"]
    G --> H["6. Verificar<br/>qa → auditor-codigo → auditor-seguridad"]
    H --> I{"¿Hallazgos<br/>bloqueantes?"}
    I -- sí --> G
    I -- no --> J["7. Cerrar hilo<br/>documentador"]
```

**Compuertas que requieren una persona:** aprobación de alcance (etapa 1) y aprobación de diseño
(etapa 3). Un agente no se aprueba a sí mismo.

**Dura:** de una sesión a cuatro, según tamaño. **Dispara:** `/funcionalidad <descripción>`.

---

## Loop 3 — Auditoría (skill `auditoria-integral`)

Seis dimensiones en paralelo, verificación, consolidación, corrección, y **una segunda vuelta sobre
lo corregido**. Esa segunda vuelta es lo que separa una auditoría de una lista de buenas intenciones.

```mermaid
flowchart TD
    A[Definir perímetro] --> B[Seis dimensiones en paralelo]
    B --> C1[seguridad] & C2[calidad] & C3[dominio] & C4[pruebas] & C5[operación] & C6[documentación]
    C1 & C2 & C3 & C4 & C5 & C6 --> D[Verificar cada hallazgo]
    D --> E{"¿Escenario<br/>reproducible?"}
    E -- no --> F[Descartar]
    E -- sí --> G[Consolidar informe]
    G --> H[Corregir críticos y altos]
    H --> I[Re-auditar solo lo afectado]
    I --> J[Deuda restante a ESTADO.md con dueño]
```

**Ritmo:** quincenal durante desarrollo activo, mensual después, **siempre** antes de cerrar una
fase o desplegar a producción.

**Dispara:** `/auditoria [completa|incremental]`, o de forma programada.

---

## Loop 4 — Investigación (agente `investigador`)

Para todo lo que cambia con el tiempo y no se puede responder de memoria: precios de Meta, límites
de la API, normativa, movimientos de la competencia.

```
Pregunta → Buscar fuente primaria → Fechar y citar
        → Marcar lo no verificable → Escribir en docs/ → Enlazar desde ESTADO.md
```

La última etapa es la que suele faltar: una investigación que vive solo en el chat se pierde, y
alguien la vuelve a hacer dentro de dos meses.

**Ritmo:** bajo demanda, más una revisión trimestral obligatoria de precios y políticas de Meta —
son la base de nuestro modelo de costos y cambian sin avisarnos.

---

## Loop 5 — Incidente (producción)

```
Detectar (alerta) → Mitigar → Comunicar al cliente afectado
                  → Causa raíz → Corregir → Prueba que lo habría atrapado
                  → Postmortem en docs/_incidentes/ → Alerta o runbook nuevo si faltaba
```

Dos reglas:

1. **La corrección incluye la prueba** que habría detectado el fallo. Sin eso, el incidente
   volverá con otro disfraz.
2. **El postmortem no busca culpables, busca la condición** que permitió el fallo. Si la conclusión
   es "hay que tener más cuidado", el postmortem no terminó.

**Dispara:** alerta de producción.

---

## Ritmos programados

| Cuándo | Qué corre |
|---|---|
| Cada sesión | Loop 1 |
| Cada funcionalidad | Loop 2 |
| Quincenal | Loop 3 incremental |
| Cierre de fase / release | Loop 3 completo |
| Trimestral | Loop 4 sobre precios y políticas de Meta; prueba de restauración de respaldos |
| Por incidente | Loop 5 |

Los loops programados pueden automatizarse con agentes en la nube. Mientras no estén automatizados,
viven como tareas con fecha en `ESTADO.md` — un ritmo que depende de la memoria de alguien no es
un ritmo.
