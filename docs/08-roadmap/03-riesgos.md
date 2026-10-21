# Riesgos del proyecto

Registro vivo. Se revisa al cerrar cada hito del [roadmap v2](01-roadmap.md). Probabilidad e
impacto: alta, media o baja. Última revisión: 2026-10-20, al adoptar el roadmap v2.

| # | Riesgo | Prob. | Impacto | Dueño | Mitigación | Hito |
|---|---|---|---|---|---|---|
| RG-01 | **Fuga entre agencias** por un defecto de RLS o de contexto que las pruebas no detectan | Baja | Alto | `datos`, `qa` | RLS sin contexto = cero filas; guardia de rol; REG-02 con 50 peticiones concurrentes; mutantes al 100 % (C1) | M1.2, M1.3 |
| RG-02 | **Texto de mensajes en claro** en la base y en los respaldos | Alta (hoy es así) | Alto | `auditor-seguridad`, `datos` | ADR-0014, Enfoque A; prueba con `$queryRaw` (C2) | M1.4 |
| RG-03 | Los asesores echan de menos la **búsqueda por el cuerpo** de los mensajes, que desaparece con el ADR-0014 | Media | Medio | `dueno-de-producto` | Búsqueda por contacto, teléfono, fecha, estado y cotización; preguntarlo al piloto en la beta | M3.3, M6.2 |
| RG-04 | **Cuentas de terceros sin abrir** (Meta, Postmark, Render): C3 no se puede cerrar | Alta | Alto | Propietario | Abrirlas entre las semanas 1 y 3; mientras tanto, número de prueba de Meta | M2.1, M2.2, M5.1 |
| RG-05 | La **verificación de Meta Business** tarda semanas y bloquea lanzar con clientes reales | Alta | Alto | Propietario | Iniciar el trámite ya; no bloquea construir | M6.2 |
| RG-06 | **`main` sin protección en GitHub**: un `push` directo salta las compuertas | Media | Alto | Propietario, `devops` | Plan Pro o Team y *rulesets* (C4) | M1.1 |
| RG-07 | **Cadena de suministro del CI**: una acción de GitHub sin fijar corre con los secretos, incluido el que migra | Media | Alto | `devops` | Fijar por SHA y Dependabot | M1.5 |
| RG-08 | **CSRF entre subdominios**: `Origin` solo se comprueba en `auth` y en el socket | Media | Medio | `backend` | Comprobación de `Origin` en toda mutación | M1.6 |
| RG-09 | **Abuso del webhook o de la API** sin límite de tasa fuera de `auth` | Media | Medio | `backend` | Límite por IP y por sesión antes de exponer el webhook | M2.5 |
| RG-10 | **Accesos a PII sin rastro**: `registros_auditoria` no tiene escritores (R10, Ley 1581) | Alta (hoy es así) | Alto | `backend`, `datos` | Escritores y prueba antes de datos reales de viajeros | M2.6 |
| RG-11 | **XSS en la web** sin CSP, con sesión activa | Media | Medio | `frontend` | CSP estricta antes de la web con sesión en staging | M2.7 |
| RG-12 | **Supresión incompleta** (Ley 1581): rastros del titular en colas, caché o payloads crudos | Media | Alto | `backend`, `datos` | Servicio de supresión, *crypto-shredding*, purga a 15 días (C5) | M4.3 |
| RG-13 | El **costo por mensaje de Meta** desde el 2026-10-01 invalida el plan de entrada | Media | Alto | Propietario, `analista-datos` | Bajar la tarifa de Colombia en COP antes de fijar precios | §4 del roadmap |
| RG-14 | **Alcance a medias**: construir producto (§5) en paralelo con los hitos y no cerrar ninguno | Media | Alto | `dueno-de-producto`, `facilitador` | Una sola cola; los cimientos van primero; R13 | Todos |
| RG-15 | **Piloto sin tarifario real**: el cotizador se valida contra datos inventados | Alta | Medio | Propietario | Pedir aunque sea un paquete real | §5 del roadmap |
