---
name: handoff-ia-externa
description: Empaqueta una tarea con todo su contexto para que otra IA (o cualquier colaborador fuera de esta sesión) la ejecute sin perder el hilo ni romper las convenciones del proyecto. Úsalo para delegar trabajo puntual a otro modelo, otra herramienta o una persona externa, y para recibir de vuelta su resultado de forma verificable.
---

# Traspaso a una IA externa

Para delegar un trabajo puntual fuera de esta sesión —a otro modelo, otra herramienta o una
persona— sin que el proyecto pierda coherencia.

## El principio

Una IA externa **no conoce el proyecto y no va a leerlo entero**. Si le das una instrucción suelta,
te devolverá código que parece correcto y que viola tres convenciones. El traspaso funciona cuando
el paquete es autosuficiente y la verificación de vuelta es objetiva.

Regla dura: **lo que vuelve de una IA externa no se integra por confianza.** Se audita como si
viniera de un desconocido, porque viene de un desconocido.

---

## Qué se delega bien y qué no

| Delegar | No delegar |
|---|---|
| Tareas acotadas con criterio de aceptación objetivo | Decisiones de arquitectura |
| Algoritmos autocontenidos (cálculo de tarifas, parsers, conversión de formatos) | Nada que toque `tenant_id`, RLS o credenciales |
| Generación de contenido: textos, plantillas, traducciones, datos de prueba | Cambios en el esquema de datos |
| Investigación con fuente verificable | Lógica de pagos |
| Revisión independiente (una segunda opinión sobre un diseño) | Modelado del dominio de turismo sin validación posterior |

---

## El paquete de traspaso

Genéralo en `docs/_traspasos/AAAA-MM-DD-<slug>.md` con esta estructura **completa**:

```markdown
# Traspaso: <título>

## 1. Qué es este proyecto (contexto mínimo)
<Cinco líneas. Qué es ViajaPro, para quién, con qué stack. Nada más: contexto de más
diluye la tarea.>

## 2. La tarea
<Qué se necesita, en una o dos frases. En imperativo.>

## 3. Entradas
- Archivos relevantes (pegados íntegros, no referenciados por ruta: quien recibe no tiene el repo)
- Contratos y tipos que debe respetar
- Datos de ejemplo

## 4. Criterios de aceptación
- [ ] Verificables de forma objetiva, no "que quede bien"
- [ ] Incluir los casos borde que deben funcionar

## 5. Restricciones innegociables
- TypeScript estricto. Sin `any`.
- Dinero en enteros (unidad mínima de la moneda; en COP es el peso, no el centavo) + código ISO-4217. Nunca coma flotante.
- Fechas en UTC.
- Sin dependencias nuevas salvo que se autoricen aquí explícitamente.
- Sin acceso a red ni a base de datos: función pura o módulo aislado.
- <las específicas de esta tarea>

## 6. Qué NO debe hacer
- No reestructurar código fuera del alcance.
- No cambiar contratos existentes.
- No inventar requisitos del dominio: si falta información, debe preguntar, no asumir.

## 7. Formato de entrega
<Un archivo / un diff / una función con su firma exacta. Sé específico.>

## 8. Cómo verificaremos
<El comando o la prueba que se ejecutará contra su entrega.>
```

---

## Protocolo de vuelta

Cuando llegue el resultado, **en este orden**:

1. **Contra los criterios de aceptación**, uno por uno. Lo que no cumple, vuelve.
2. **Pruebas.** Escribe las pruebas tú, no las aceptes del proveedor externo. Una prueba escrita por
   quien escribió el código solo demuestra que el código hace lo que su autor creyó.
3. **`auditor-codigo`** sobre el entregable completo.
4. **`auditor-seguridad`** si toca cualquier dato, aunque la tarea pareciera inocua.
5. **Adaptación al proyecto:** convenciones de nombres, lenguaje ubicuo, ubicación de archivos,
   manejo de errores tipado.
6. **Registro:** entrada en `docs/_traspasos/` con qué se delegó, a quién, qué volvió, qué hubo que
   corregir. Con tres o cuatro de estos registros sabrás qué conviene delegar y qué no.

---

## Formato de interoperabilidad

Si la IA externa se conecta por MCP o por API y puede recibir contexto estructurado, entrega el
paquete como JSON además de en prosa:

```json
{
  "proyecto": "viajapro",
  "version_contexto": "<hash del commit>",
  "tarea": { "id": "...", "titulo": "...", "descripcion": "..." },
  "entradas": [{ "ruta": "...", "contenido": "..." }],
  "contratos": [{ "nombre": "...", "esquema_zod": "..." }],
  "criterios_aceptacion": ["..."],
  "restricciones": ["..."],
  "formato_entrega": "...",
  "comando_verificacion": "..."
}
```

El campo `version_contexto` importa: si el repositorio avanzó mientras la tarea estaba afuera,
el resultado puede haber quedado obsoleto antes de llegar.
