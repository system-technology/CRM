---
description: Empaqueta una tarea con todo su contexto para delegarla a otra IA o colaborador externo.
argument-hint: <tarea a delegar>
---

Ejecuta la skill `handoff-ia-externa` para preparar el traspaso de:

**$ARGUMENTS**

Primero comprueba que la tarea sea delegable: nada que toque `tenant_id`, RLS, credenciales,
esquema de datos, lógica de pagos ni decisiones de arquitectura sale del proyecto.
Si no es delegable, dilo y propón qué parte sí lo es.

Genera el paquete en `docs/_traspasos/AAAA-MM-DD-<slug>.md` con las ocho secciones completas,
pegando los archivos de entrada **íntegros** —quien recibe no tiene el repositorio— y con criterios
de aceptación verificables de forma objetiva.

Incluye al final el bloque JSON de interoperabilidad con el hash del commit actual como
`version_contexto`.
